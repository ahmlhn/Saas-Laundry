import { Ionicons } from "@expo/vector-icons";
import type { NavigationProp, RouteProp } from "@react-navigation/native";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  findNodeHandle,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { listCustomers, listCustomersPage } from "../../features/customers/customerApi";
import { formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { createOrder, listOrders } from "../../features/orders/orderApi";
import { listPromotionSections } from "../../features/promotions/promoApi";
import { listServices } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { Customer } from "../../types/customer";
import type { OrderSummary } from "../../types/order";
import type { Promotion, PromotionSections, PromotionVoucher } from "../../types/promotion";
import type { ServiceCatalogItem } from "../../types/service";

type Step = "customer" | "services" | "review";
type Direction = -1 | 1;

const STEP_ORDER: Step[] = ["customer", "services", "review"];
const CUSTOMER_LIMIT = 40;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 260;
const CUSTOMER_PROGRESSIVE_DELAY_MS = 70;
const SERVICE_RENDER_BATCH = 40;
const MAX_MONEY_INPUT_DIGITS = 9;
const currencyFormatter = new Intl.NumberFormat("id-ID");
let customerListClientCache: Customer[] = [];
let customerListAutoLoadedOnce = false;

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function normalizeMoneyInput(raw: string): string {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  const withoutLeadingZeros = digitsOnly.replace(/^0+(?=\d)/, "");
  return withoutLeadingZeros.slice(0, MAX_MONEY_INPUT_DIGITS);
}

function parseMoneyInput(raw: string): number {
  const normalized = normalizeMoneyInput(raw);
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

type PromoSource = "automatic" | "selection" | "voucher";

interface PromotionDiscountDraft {
  promo: Promotion;
  source: PromoSource;
  discountAmount: number;
  eligibleSubtotal: number;
  voucherCode?: string;
}

function parsePromotionNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseIsoTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isPromotionScheduledNow(promo: Promotion, nowTimestamp: number): boolean {
  const startsAt = parseIsoTimestamp(promo.start_at);
  if (startsAt !== null && nowTimestamp < startsAt) {
    return false;
  }

  const endsAt = parseIsoTimestamp(promo.end_at);
  if (endsAt !== null && nowTimestamp > endsAt) {
    return false;
  }

  return true;
}

function isVoucherUsable(voucher: PromotionVoucher, nowTimestamp: number): boolean {
  if (!voucher.active) {
    return false;
  }

  if (voucher.quota_total !== null && voucher.quota_used >= voucher.quota_total) {
    return false;
  }

  const expiresAt = parseIsoTimestamp(voucher.expires_at);
  if (expiresAt !== null && nowTimestamp > expiresAt) {
    return false;
  }

  return true;
}

function formatPromotionTypeLabel(type: Promotion["promo_type"]): string {
  if (type === "selection") {
    return "Pilihan";
  }

  if (type === "automatic") {
    return "Otomatis";
  }

  return "Voucher";
}

function formatPromotionRuleSummary(promo: Promotion): string {
  const discountType = promo.rule_json.discount_type;
  const discountValue = parsePromotionNumber(promo.rule_json.discount_value);

  if (!discountValue || discountValue <= 0) {
    return "Aturan diskon tidak valid";
  }

  const base = discountType === "percentage" ? `${discountValue}%` : formatMoney(Math.round(discountValue));
  const maxDiscount = parsePromotionNumber(promo.rule_json.max_discount);
  const minimumAmount = parsePromotionNumber(promo.rule_json.minimum_amount);

  const chunks: string[] = [base];
  if (maxDiscount !== null && maxDiscount > 0) {
    chunks.push(`maks ${formatMoney(Math.round(maxDiscount))}`);
  }
  if (minimumAmount !== null && minimumAmount > 0) {
    chunks.push(`min ${formatMoney(Math.round(minimumAmount))}`);
  }

  return chunks.join(" • ");
}

function isKgUnit(unitType: string | undefined): boolean {
  return unitType === "kg";
}

function parseMetricInput(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  return Number.parseFloat(normalized);
}

function normalizeMetricValue(value: number, unitType: string | undefined): number {
  if (isKgUnit(unitType)) {
    return Math.round(value * 10) / 10;
  }

  return Math.round(value);
}

function formatMetricValue(value: number, unitType: string | undefined): string {
  const normalized = normalizeMetricValue(value, unitType);
  if (isKgUnit(unitType)) {
    const fixed = normalized.toFixed(1);
    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  }

  return `${normalized}`;
}

function metricStep(unitType: string | undefined): number {
  return isKgUnit(unitType) ? 0.1 : 1;
}

function stepLabel(step: Step): string {
  if (step === "customer") {
    return "Konsumen";
  }

  if (step === "services") {
    return "Layanan";
  }

  return "Ringkasan";
}

function mapGenderLabel(value: string): string {
  if (value === "male") {
    return "Laki-laki";
  }

  if (value === "female") {
    return "Perempuan";
  }

  return "";
}

interface CustomerListEntry {
  customer: Customer;
  profile: ReturnType<typeof parseCustomerProfileMeta>;
  address: string;
}

function formatDateShort(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function QuickActionScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const footerBasePadding = isCompactLandscape ? theme.spacing.xs : theme.spacing.sm;
  const footerBottomPadding = footerBasePadding + insets.bottom;

  const navigation = useNavigation<NavigationProp<AppTabParamList>>();
  const route = useRoute<RouteProp<AppTabParamList, "QuickActionTab">>();
  const isFocused = useIsFocused();
  const { session, selectedOutlet, refreshSession } = useSession();

  const roles = session?.roles ?? [];
  const canCreateOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [step, setStep] = useState<Step>("customer");

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [serviceGroupNamesById, setServiceGroupNamesById] = useState<Record<string, string>>({});
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceKeyword, setServiceKeyword] = useState("");
  const [showServiceSearch, setShowServiceSearch] = useState(false);
  const [activeServiceGroupKey, setActiveServiceGroupKey] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [promotionSections, setPromotionSections] = useState<PromotionSections>({
    selection: [],
    automatic: [],
    voucher: [],
  });
  const [loadingPromotions, setLoadingPromotions] = useState(false);
  const [promoErrorMessage, setPromoErrorMessage] = useState<string | null>(null);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [promoVoucherCodeInput, setPromoVoucherCodeInput] = useState("");

  const [customers, setCustomers] = useState<Customer[]>(() => customerListClientCache);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [pendingAutoSelectCustomerId, setPendingAutoSelectCustomerId] = useState<string | null>(null);
  const [customerOrdersPreview, setCustomerOrdersPreview] = useState<OrderSummary[]>([]);
  const [loadingCustomerOrdersPreview, setLoadingCustomerOrdersPreview] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [isPickupDelivery, setIsPickupDelivery] = useState(false);

  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);
  const [focusedMetricServiceId, setFocusedMetricServiceId] = useState<string | null>(null);
  const [visibleServiceLimit, setVisibleServiceLimit] = useState(SERVICE_RENDER_BATCH);
  const [showServiceItemValidation, setShowServiceItemValidation] = useState(false);
  const [showReviewPromoPanel, setShowReviewPromoPanel] = useState(false);
  const [showReviewDiscountPanel, setShowReviewDiscountPanel] = useState(false);
  const [showReviewNotesPanel, setShowReviewNotesPanel] = useState(false);
  const customerRequestSeqRef = useRef(0);
  const contentScrollRef = useRef<ScrollView | null>(null);
  const serviceInputRefs = useRef<Record<string, TextInput | null>>({});
  const serviceSearchInputRef = useRef<TextInput | null>(null);
  const scrollYRef = useRef(0);

  useEffect(() => {
    if (!selectedOutlet || !canCreateOrder) {
      setServices([]);
      setServiceGroupNamesById({});
      setLoadingServices(false);
      return;
    }

    void loadServices(true);
  }, [selectedOutlet?.id, canCreateOrder]);

  useEffect(() => {
    if (!route.params?.openCreateStamp || !canCreateOrder) {
      return;
    }

    if (showCreateForm) {
      navigation.setParams({
        openCreateStamp: undefined,
      });
      return;
    }

    openCreateFlow();
    navigation.setParams({
      openCreateStamp: undefined,
    });
  }, [route.params?.openCreateStamp, canCreateOrder, showCreateForm, navigation]);

  useEffect(() => {
    if (!isFocused || !canCreateOrder || showCreateForm || actionMessage || (!loadingServices && services.length === 0)) {
      return;
    }

    openCreateFlow();
  }, [isFocused, canCreateOrder, showCreateForm, actionMessage, loadingServices, services.length]);

  useEffect(() => {
    const preselectCustomerId = route.params?.preselectCustomerId;
    if (!preselectCustomerId || !canCreateOrder) {
      return;
    }

    openCreateFlow();
    setPendingAutoSelectCustomerId(preselectCustomerId);
    const existsInClientCache = customerListClientCache.some((item) => item.id === preselectCustomerId);
    if (!existsInClientCache) {
      void loadCustomers(true, {
        fetchAll: true,
        keyword: "",
      });
    }
  }, [route.params?.preselectCustomerId, canCreateOrder]);

  useEffect(() => {
    if (!showCreateForm || !canCreateOrder || !selectedOutlet) {
      return;
    }

    void loadPromotions();
  }, [showCreateForm, canCreateOrder, selectedOutlet?.id]);

  useEffect(() => {
    if (!showCreateForm || !canCreateOrder || step !== "customer" || selectedCustomerId) {
      return;
    }

    if (customers.length > 0 || customerListAutoLoadedOnce) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void loadCustomers(true, {
        fetchAll: true,
        keyword: "",
      });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [showCreateForm, canCreateOrder, step, selectedCustomerId, customerKeyword, customers.length]);

  async function loadServices(forceRefresh = false): Promise<void> {
    if (!selectedOutlet) {
      setLoadingServices(false);
      return;
    }

    setLoadingServices(true);
    try {
      const [serviceItems, serviceGroups] = await Promise.all([
        listServices({
          outletId: selectedOutlet.id,
          active: true,
          serviceType: ["regular", "package"],
          isGroup: false,
          forceRefresh,
        }),
        listServices({
          outletId: selectedOutlet.id,
          active: true,
          serviceType: ["regular", "package"],
          isGroup: true,
          forceRefresh,
        }),
      ]);

      const groupNameMap = serviceGroups.reduce<Record<string, string>>((result, item) => {
        result[item.id] = item.name;
        return result;
      }, {});

      setServices(serviceItems);
      setServiceGroupNamesById(groupNameMap);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingServices(false);
    }
  }

  async function loadCustomers(
    forceRefresh = false,
    options?: {
      keyword?: string;
      fetchAll?: boolean;
    },
  ): Promise<void> {
    const keyword = options?.keyword?.trim() ?? "";
    const requestSeq = customerRequestSeqRef.current + 1;
    customerRequestSeqRef.current = requestSeq;
    setLoadingCustomers(true);
    setLoadingMoreCustomers(false);
    const applyCustomerState = (nextCustomers: Customer[]) => {
      setCustomers(nextCustomers);
      customerListClientCache = nextCustomers;
    };

    try {
      const fetchAll = options?.fetchAll === true;

      if (fetchAll) {
        const data = await listCustomers({
          query: keyword || undefined,
          limit: CUSTOMER_LIMIT,
          fetchAll: true,
          forceRefresh,
        });
        if (requestSeq !== customerRequestSeqRef.current) {
          return;
        }
        applyCustomerState(data);
        customerListAutoLoadedOnce = true;
        return;
      }

      const merged: Customer[] = [];
      const seen = new Set<string>();
      let nextPage = 1;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await listCustomersPage({
          query: keyword || undefined,
          limit: CUSTOMER_LIMIT,
          page: nextPage,
          forceRefresh: forceRefresh && nextPage === 1,
        });
        if (requestSeq !== customerRequestSeqRef.current) {
          return;
        }

        for (const customer of pageResult.items) {
          if (seen.has(customer.id)) {
            continue;
          }

          seen.add(customer.id);
          merged.push(customer);
        }

        applyCustomerState([...merged]);
        if (nextPage === 1) {
          setLoadingCustomers(false);
        }
        hasMore = pageResult.hasMore;

        if (hasMore) {
          setLoadingMoreCustomers(true);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, CUSTOMER_PROGRESSIVE_DELAY_MS);
          });
        }

        nextPage += 1;
      }

      customerListAutoLoadedOnce = true;
    } catch (error) {
      if (requestSeq !== customerRequestSeqRef.current) {
        return;
      }
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoadingCustomers(false);
        setLoadingMoreCustomers(false);
      }
    }
  }

  async function loadPromotions(forceRefresh = false): Promise<void> {
    if (loadingPromotions) {
      return;
    }

    setLoadingPromotions(true);
    setPromoErrorMessage(null);
    try {
      const data = await listPromotionSections({
        status: "active",
        forceRefresh,
      });
      setPromotionSections(data);
    } catch (error) {
      setPromoErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingPromotions(false);
    }
  }

  function resetDraft(): void {
    customerRequestSeqRef.current += 1;
    setStep("customer");
    setServiceKeyword("");
    setShowServiceSearch(false);
    setActiveServiceGroupKey(null);
    setSelectedServiceIds([]);
    setSelectedPromoId(null);
    setPromoVoucherCodeInput("");
    setPromoErrorMessage(null);
    setShowServiceItemValidation(false);
    setShowReviewPromoPanel(false);
    setShowReviewDiscountPanel(false);
    setShowReviewNotesPanel(false);
    setMetrics({});
    setCustomerKeyword("");
    setSelectedCustomerId(null);
    setPendingAutoSelectCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setIsPickupDelivery(false);
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setLoadingCustomers(false);
    setLoadingMoreCustomers(false);
    setShippingFeeInput("");
    setDiscountInput("");
    setOrderNotes("");
  }

  function openCreateFlow(): void {
    resetDraft();
    setShowCreateForm(true);
    setErrorMessage(null);
    setActionMessage(null);
  }

  function closeCreateFlow(): void {
    setShowCreateForm(false);
    resetDraft();
    setErrorMessage(null);
  }

  function toggleCreateFlow(): void {
    if (showCreateForm) {
      closeCreateFlow();
      return;
    }

    openCreateFlow();
  }

  function openCreateCustomerForm(): void {
    navigation.navigate("AccountTab", {
      screen: "CustomerForm",
      params: {
        mode: "create",
        returnToQuickAction: true,
      },
    });
  }

  function handleSelectCustomer(customer: Customer): void {
    customerRequestSeqRef.current += 1;
    setLoadingCustomers(false);
    setLoadingMoreCustomers(false);
    const profile = parseCustomerProfileMeta(customer.notes);
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone_normalized ?? "");
    setCustomerNotes(profile.note);
    setCustomerKeyword("");
    setErrorMessage(null);
  }

  function handleReplaceSelectedCustomer(): void {
    setSelectedCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setCustomerKeyword("");
    setErrorMessage(null);
  }

  useEffect(() => {
    if (!pendingAutoSelectCustomerId || loadingCustomers) {
      return;
    }

    const matchedCustomer = customers.find((item) => item.id === pendingAutoSelectCustomerId) ?? null;
    if (matchedCustomer) {
      const profile = parseCustomerProfileMeta(matchedCustomer.notes);
      setSelectedCustomerId(matchedCustomer.id);
      setCustomerName(matchedCustomer.name);
      setCustomerPhone(matchedCustomer.phone_normalized ?? "");
      setCustomerNotes(profile.note);
      setCustomerKeyword("");
      setPendingAutoSelectCustomerId(null);
      setErrorMessage(null);
      navigation.setParams({
        preselectCustomerId: undefined,
      });
      return;
    }

    if (customers.length > 0) {
      setPendingAutoSelectCustomerId(null);
      setErrorMessage("Pelanggan baru belum ditemukan. Coba muat ulang daftar.");
      navigation.setParams({
        preselectCustomerId: undefined,
      });
    }
  }, [pendingAutoSelectCustomerId, loadingCustomers, customers, navigation]);

  function updateMetric(serviceId: string, value: string): void {
    setMetrics((previous) => {
      if (!value.trim()) {
        const next = { ...previous };
        delete next[serviceId];
        return next;
      }

      return {
        ...previous,
        [serviceId]: value,
      };
    });
  }

  function stepMetric(service: ServiceCatalogItem, direction: Direction): void {
    const current = parseMetricInput(metrics[service.id] ?? "");
    const safe = Number.isFinite(current) ? current : 0;
    const next = Math.max(normalizeMetricValue(safe + direction * metricStep(service.unit_type), service.unit_type), 0);
    updateMetric(service.id, next > 0 ? formatMetricValue(next, service.unit_type) : "");
  }

  function handleShippingFeeChange(value: string): void {
    setShippingFeeInput(normalizeMoneyInput(value));
  }

  function handleDiscountChange(value: string): void {
    setDiscountInput(normalizeMoneyInput(value));
  }

  function handlePromoVoucherCodeChange(value: string): void {
    const normalized = value.toUpperCase().replace(/\s+/g, "");
    setPromoVoucherCodeInput(normalized.slice(0, 32));
  }

  const customerListEntries = useMemo<CustomerListEntry[]>(() => {
    const keyword = customerKeyword.trim().toLowerCase();
    return customers
      .map((customer) => {
        const profile = parseCustomerProfileMeta(customer.notes);
        const address = profile.address.trim();
        return {
          customer,
          profile,
          address,
        };
      })
      .filter((entry) => {
        if (!keyword) {
          return true;
        }

        return (
          entry.customer.name.toLowerCase().includes(keyword) ||
          (entry.customer.phone_normalized ?? "").toLowerCase().includes(keyword) ||
          entry.address.toLowerCase().includes(keyword) ||
          entry.profile.email.toLowerCase().includes(keyword) ||
          entry.profile.note.toLowerCase().includes(keyword)
        );
      });
  }, [customers, customerKeyword]);

  const customerCountInfo = useMemo(() => {
    if (customerKeyword.trim()) {
      return `${customerListEntries.length} hasil`;
    }

    return `${customerListEntries.length} pelanggan`;
  }, [customerKeyword, customerListEntries.length]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) {
      return null;
    }

    return customers.find((item) => item.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const selectedCustomerProfile = useMemo(() => {
    if (!selectedCustomer) {
      return null;
    }

    return parseCustomerProfileMeta(selectedCustomer.notes);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedOutlet || !showCreateForm || step !== "customer" || !selectedCustomer) {
      setCustomerOrdersPreview([]);
      setLoadingCustomerOrdersPreview(false);
      return;
    }

    const outlet = selectedOutlet;
    const customer = selectedCustomer;
    let active = true;

    async function loadSelectedCustomerOrdersPreview(): Promise<void> {
      const phoneQuery = customer.phone_normalized?.trim() ?? "";
      const nameQuery = customer.name?.trim() ?? "";
      const query = phoneQuery || nameQuery;

      if (!query) {
        setCustomerOrdersPreview([]);
        return;
      }

      setLoadingCustomerOrdersPreview(true);
      try {
        const data = await listOrders({
          outletId: outlet.id,
          query,
          limit: 100,
          timezone: outlet.timezone,
          forceRefresh: true,
        });

        if (!active) {
          return;
        }

        const filtered = data.filter((order) => {
          if (order.customer_id === customer.id) {
            return true;
          }

          const orderPhone = order.customer?.phone_normalized?.trim() ?? "";
          if (phoneQuery && orderPhone === phoneQuery) {
            return true;
          }

          const orderName = order.customer?.name?.trim().toLowerCase() ?? "";
          return nameQuery !== "" && orderName === nameQuery.toLowerCase();
        });

        setCustomerOrdersPreview(filtered);
      } catch (error) {
        if (active) {
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoadingCustomerOrdersPreview(false);
        }
      }
    }

    void loadSelectedCustomerOrdersPreview();

    return () => {
      active = false;
    };
  }, [selectedCustomer, selectedOutlet, showCreateForm, step]);

  const customerTransactionSummary = useMemo(() => {
    const totalTransactions = customerOrdersPreview.length;
    const totalAmount = customerOrdersPreview.reduce((sum, order) => sum + Math.max(order.total_amount ?? 0, 0), 0);
    const outstandingAmount = customerOrdersPreview.reduce((sum, order) => sum + Math.max(order.due_amount ?? 0, 0), 0);
    const unpaidCount = customerOrdersPreview.filter((order) => (order.due_amount ?? 0) > 0).length;
    const lastOrderAt = customerOrdersPreview.length > 0 ? customerOrdersPreview[0].created_at : null;

    return {
      totalTransactions,
      totalAmount,
      outstandingAmount,
      unpaidCount,
      lastOrderAt,
    };
  }, [customerOrdersPreview]);

  const serviceById = useMemo(() => {
    const map = new Map<string, ServiceCatalogItem>();
    for (const item of services) {
      map.set(item.id, item);
    }
    return map;
  }, [services]);

  const selectedServiceIdSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds]);

  const groupedServices = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; items: ServiceCatalogItem[] }>();

    for (const service of services) {
      const groupKey = service.parent_service_id ?? "__ungrouped";
      const groupLabel = service.parent_service_id ? serviceGroupNamesById[service.parent_service_id] ?? "Tanpa Group" : "Tanpa Group";
      const current = buckets.get(groupKey);
      if (current) {
        current.items.push(service);
      } else {
        buckets.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          items: [service],
        });
      }
    }

    const groups = Array.from(buckets.values());
    for (const group of groups) {
      group.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "id-ID"));
    }

    groups.sort((a, b) => {
      if (a.key === "__ungrouped") {
        return 1;
      }

      if (b.key === "__ungrouped") {
        return -1;
      }

      return a.label.localeCompare(b.label, "id-ID");
    });

    return groups;
  }, [services, serviceGroupNamesById]);

  const visibleServiceGroups = useMemo(() => {
    const keyword = serviceKeyword.trim().toLowerCase();
    if (!keyword) {
      return groupedServices;
    }

    return groupedServices.filter((group) => group.label.toLowerCase().includes(keyword));
  }, [groupedServices, serviceKeyword]);

  const activeServiceGroup = useMemo(() => {
    if (!activeServiceGroupKey) {
      return null;
    }

    return groupedServices.find((group) => group.key === activeServiceGroupKey) ?? null;
  }, [activeServiceGroupKey, groupedServices]);

  const visibleServicesInActiveGroup = useMemo(() => {
    if (!activeServiceGroup) {
      return [];
    }

    const keyword = serviceKeyword.trim().toLowerCase();
    if (!keyword) {
      return activeServiceGroup.items;
    }

    return activeServiceGroup.items.filter((service) => service.name.toLowerCase().includes(keyword));
  }, [activeServiceGroup, serviceKeyword]);

  useEffect(() => {
    if (!activeServiceGroup) {
      setVisibleServiceLimit(SERVICE_RENDER_BATCH);
      return;
    }

    let highestSelectedIndex = -1;
    for (let index = 0; index < activeServiceGroup.items.length; index += 1) {
      const service = activeServiceGroup.items[index];
      if (selectedServiceIdSet.has(service.id)) {
        highestSelectedIndex = index;
      }
    }

    setVisibleServiceLimit(Math.max(SERVICE_RENDER_BATCH, highestSelectedIndex + 1));
  }, [activeServiceGroupKey, serviceKeyword]);

  const visibleServicesInActiveGroupLimited = useMemo(() => {
    if (visibleServiceLimit >= visibleServicesInActiveGroup.length) {
      return visibleServicesInActiveGroup;
    }

    return visibleServicesInActiveGroup.slice(0, visibleServiceLimit);
  }, [visibleServiceLimit, visibleServicesInActiveGroup]);

  const remainingServicesInActiveGroupCount = useMemo(
    () => Math.max(visibleServicesInActiveGroup.length - visibleServicesInActiveGroupLimited.length, 0),
    [visibleServicesInActiveGroup.length, visibleServicesInActiveGroupLimited.length],
  );

  const validSelectedCountByGroup = useMemo(() => {
    const result: Record<string, number> = {};
    for (const serviceId of selectedServiceIds) {
      const service = serviceById.get(serviceId);
      if (!service) {
        continue;
      }

      const metricValue = parseMetricInput(metrics[service.id] ?? "");
      const hasValidMetric = Number.isFinite(metricValue) && metricValue > 0;
      if (!hasValidMetric) {
        continue;
      }

      const groupKey = service.parent_service_id ?? "__ungrouped";
      result[groupKey] = (result[groupKey] ?? 0) + 1;
    }

    return result;
  }, [metrics, selectedServiceIds, serviceById]);

  const selectedServiceDrafts = useMemo(() => {
    return selectedServiceIds
      .map((serviceId) => serviceById.get(serviceId) ?? null)
      .filter((service): service is ServiceCatalogItem => service !== null)
      .map((service) => {
        const metricRaw = metrics[service.id] ?? "";
        const metricValue = parseMetricInput(metricRaw);
        const hasValidMetric = Number.isFinite(metricValue) && metricValue > 0;
        return {
          service,
          metricRaw,
          metricValue,
          hasValidMetric,
          subtotal: hasValidMetric ? Math.round(metricValue * (service.effective_price_amount ?? 0)) : 0,
        };
      });
  }, [metrics, selectedServiceIds, serviceById]);

  const selectedServiceDraftById = useMemo(() => {
    return selectedServiceDrafts.reduce<
      Record<
        string,
        {
          service: ServiceCatalogItem;
          metricRaw: string;
          metricValue: number;
          hasValidMetric: boolean;
          subtotal: number;
        }
      >
    >((result, line) => {
      result[line.service.id] = line;
      return result;
    }, {});
  }, [selectedServiceDrafts]);

  useEffect(() => {
    if (!activeServiceGroupKey) {
      return;
    }

    const groupStillExists = groupedServices.some((group) => group.key === activeServiceGroupKey);
    if (!groupStillExists) {
      setActiveServiceGroupKey(null);
    }
  }, [activeServiceGroupKey, groupedServices]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = Math.max((event.endCoordinates?.height ?? 0) - insets.bottom, 0);
      setKeyboardHeight(nextHeight);
      const nextTop = event.endCoordinates?.screenY;
      if (typeof nextTop === "number" && Number.isFinite(nextTop)) {
        setKeyboardTopY(nextTop);
      }
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setKeyboardTopY(null);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const selectedLines = useMemo(() => selectedServiceDrafts.filter((line) => line.hasValidMetric), [selectedServiceDrafts]);
  const invalidSelectedLines = useMemo(() => selectedServiceDrafts.filter((line) => !line.hasValidMetric), [selectedServiceDrafts]);

  const subtotal = useMemo(() => selectedLines.reduce((sum, line) => sum + line.subtotal, 0), [selectedLines]);
  const promoVoucherCodeNormalized = promoVoucherCodeInput.trim().toUpperCase();

  const shippingFee = useMemo(() => {
    return parseMoneyInput(shippingFeeInput);
  }, [shippingFeeInput]);

  const discountAmount = useMemo(() => {
    return parseMoneyInput(discountInput);
  }, [discountInput]);

  const automaticPromoDrafts = useMemo(() => {
    const nowTimestamp = Date.now();

    function buildPromoDraft(promo: Promotion, source: PromoSource, voucherCode?: string): PromotionDiscountDraft | null {
      if (!isPromotionScheduledNow(promo, nowTimestamp)) {
        return null;
      }

      const discountType = promo.rule_json.discount_type;
      const discountValue = parsePromotionNumber(promo.rule_json.discount_value);
      if (!discountValue || discountValue <= 0 || (discountType !== "fixed" && discountType !== "percentage")) {
        return null;
      }

      const minimumAmount = parsePromotionNumber(promo.rule_json.minimum_amount);
      if (minimumAmount !== null && minimumAmount > 0 && subtotal < minimumAmount) {
        return null;
      }

      const appliesTo = typeof promo.rule_json.applies_to === "string" ? promo.rule_json.applies_to.toLowerCase() : "all";
      const eligibleSubtotal = selectedLines.reduce((sum, line) => {
        const serviceType = String(line.service.service_type ?? "").toLowerCase();
        if (appliesTo !== "all" && appliesTo !== serviceType) {
          return sum;
        }

        if (promo.targets.length === 0) {
          return sum + line.subtotal;
        }

        const matched = promo.targets.some((target) => {
          if (target.target_type === "all") {
            return true;
          }

          if (target.target_type === "outlet") {
            return selectedOutlet ? target.target_id === selectedOutlet.id : false;
          }

          if (target.target_type === "service") {
            return target.target_id === line.service.id;
          }

          if (target.target_type === "service_type") {
            return target.target_id ? String(target.target_id).toLowerCase() === serviceType : false;
          }

          return false;
        });

        return matched ? sum + line.subtotal : sum;
      }, 0);

      if (eligibleSubtotal <= 0) {
        return null;
      }

      let discount = discountType === "percentage" ? Math.round((eligibleSubtotal * discountValue) / 100) : Math.round(discountValue);
      const maxDiscount = parsePromotionNumber(promo.rule_json.max_discount);
      if (maxDiscount !== null && maxDiscount > 0) {
        discount = Math.min(discount, Math.round(maxDiscount));
      }

      const finalDiscount = Math.max(Math.min(discount, eligibleSubtotal), 0);
      if (finalDiscount <= 0) {
        return null;
      }

      return {
        promo,
        source,
        discountAmount: finalDiscount,
        eligibleSubtotal,
        voucherCode,
      };
    }

    const automatic = promotionSections.automatic
      .map((promo) => buildPromoDraft(promo, "automatic"))
      .filter((draft): draft is PromotionDiscountDraft => draft !== null);

    const selection = promotionSections.selection
      .map((promo) => buildPromoDraft(promo, "selection"))
      .filter((draft): draft is PromotionDiscountDraft => draft !== null);

    const selectedSelection = selectedPromoId ? selection.find((draft) => draft.promo.id === selectedPromoId) ?? null : null;

    const voucher = (() => {
      if (!promoVoucherCodeNormalized) {
        return null;
      }

      for (const promo of promotionSections.voucher) {
        if (!isPromotionScheduledNow(promo, nowTimestamp)) {
          continue;
        }

        const matchedVoucher = promo.vouchers.find((item) => item.code.toUpperCase() === promoVoucherCodeNormalized) ?? null;
        if (!matchedVoucher || !isVoucherUsable(matchedVoucher, nowTimestamp)) {
          continue;
        }

        const draft = buildPromoDraft(promo, "voucher", promoVoucherCodeNormalized);
        if (draft) {
          return draft;
        }
      }

      return null;
    })();

    const candidates: PromotionDiscountDraft[] = [...automatic];
    if (selectedSelection) {
      candidates.push(selectedSelection);
    }
    if (voucher) {
      candidates.push(voucher);
    }

    const exclusiveCandidates = candidates.filter((item) => item.promo.stack_mode === "exclusive");
    const applied =
      exclusiveCandidates.length > 0
        ? [
            [...exclusiveCandidates].sort(
              (a, b) => b.discountAmount - a.discountAmount || b.promo.priority - a.promo.priority || a.promo.name.localeCompare(b.promo.name, "id-ID"),
            )[0],
          ]
        : candidates;

    const hasVoucherTyped = promoVoucherCodeNormalized.length > 0;
    const voucherRejected = hasVoucherTyped && voucher === null;

    return {
      automatic,
      selection,
      selectedSelection,
      voucher,
      applied,
      voucherRejected,
    };
  }, [promotionSections.automatic, promotionSections.selection, promotionSections.voucher, promoVoucherCodeNormalized, selectedLines, selectedOutlet, selectedPromoId, subtotal]);

  const automaticPromoDraftList = automaticPromoDrafts.automatic;
  const selectionPromoDrafts = automaticPromoDrafts.selection;
  const selectedSelectionPromoDraft = automaticPromoDrafts.selectedSelection;
  const voucherPromoDraft = automaticPromoDrafts.voucher;
  const appliedPromoDrafts = automaticPromoDrafts.applied;
  const voucherCodeRejected = automaticPromoDrafts.voucherRejected;

  useEffect(() => {
    if (!selectedPromoId) {
      return;
    }

    const stillExists = selectionPromoDrafts.some((item) => item.promo.id === selectedPromoId);
    if (!stillExists) {
      setSelectedPromoId(null);
    }
  }, [selectedPromoId, selectionPromoDrafts]);

  const promoDiscountAmount = useMemo(() => appliedPromoDrafts.reduce((sum, item) => sum + item.discountAmount, 0), [appliedPromoDrafts]);
  const totalDiscountAmount = discountAmount + promoDiscountAmount;
  const effectiveShippingFee = isPickupDelivery ? shippingFee : 0;
  const discountLimitBaseAmount = subtotal + effectiveShippingFee;
  const total = useMemo(() => Math.max(discountLimitBaseAmount - totalDiscountAmount, 0), [discountLimitBaseAmount, totalDiscountAmount]);
  const discountExceedsLimit = totalDiscountAmount > discountLimitBaseAmount;
  const promoCandidateCount = automaticPromoDraftList.length + (selectedSelectionPromoDraft ? 1 : 0) + (voucherPromoDraft ? 1 : 0);
  const promoExclusiveApplied = appliedPromoDrafts.length === 1 && appliedPromoDrafts[0]?.promo.stack_mode === "exclusive" && promoCandidateCount > 1;
  const appliedPromoNote = useMemo(() => {
    if (appliedPromoDrafts.length === 0) {
      return "";
    }

    const labels = appliedPromoDrafts.map((item) => {
      if (item.source === "voucher" && item.voucherCode) {
        return `${item.promo.name} (${item.voucherCode})`;
      }
      return item.promo.name;
    });
    return `Promo: ${labels.join(", ")}`;
  }, [appliedPromoDrafts]);
  const orderNotesWithPromo = useMemo(() => {
    const parts = [orderNotes.trim(), appliedPromoNote].filter((value) => value !== "");
    return parts.join("\n");
  }, [appliedPromoNote, orderNotes]);

  useEffect(() => {
    if (step !== "review") {
      return;
    }

    if (voucherCodeRejected || promoErrorMessage) {
      setShowReviewPromoPanel(true);
    }
  }, [step, voucherCodeRejected, promoErrorMessage]);

  useEffect(() => {
    if (step !== "review") {
      return;
    }

    if (discountExceedsLimit) {
      setShowReviewDiscountPanel(true);
    }
  }, [step, discountExceedsLimit]);

  const canCustomerNext = selectedCustomerId !== null;
  const canServicesNext = selectedLines.length > 0;

  function toggleServiceSelection(serviceId: string): void {
    setShowServiceItemValidation(false);
    const isSelected = selectedServiceIdSet.has(serviceId);

    if (isSelected) {
      setSelectedServiceIds((previous) => previous.filter((id) => id !== serviceId));
      setMetrics((previous) => {
        if (!(serviceId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[serviceId];
        return next;
      });
      return;
    }

    setSelectedServiceIds((previous) => [...previous, serviceId]);
  }

  function ensureFocusedMetricVisible(serviceId: string): void {
    const inputRef = serviceInputRefs.current[serviceId];
    const scrollRef = contentScrollRef.current;
    if (!inputRef || !scrollRef) {
      return;
    }

    const inputNode = findNodeHandle(inputRef);
    const scrollResponder = scrollRef as unknown as {
      scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, additionalOffset?: number, preventNegativeScrollOffset?: boolean) => void;
    };
    if (typeof inputNode === "number" && typeof scrollResponder.scrollResponderScrollNativeHandleToKeyboard === "function") {
      scrollResponder.scrollResponderScrollNativeHandleToKeyboard(inputNode, theme.spacing.lg, true);
      return;
    }

    const fallbackKeyboardTop = height - (keyboardHeight > 0 ? keyboardHeight : Math.round(height * 0.42));
    const keyboardTop = keyboardTopY ?? fallbackKeyboardTop;
    const visibleBottom = keyboardTop - theme.spacing.md;

    inputRef.measureInWindow((_x, y, _w, inputHeight) => {
      const inputBottom = y + inputHeight;
      if (inputBottom <= visibleBottom) {
        return;
      }

      const delta = inputBottom - visibleBottom + theme.spacing.sm;
      const nextY = Math.max(scrollYRef.current + delta, 0);
      scrollRef.scrollTo({ y: nextY, animated: true });
    });
  }

  function focusServiceMetricInput(serviceId: string): void {
    const retryDelays = [0, 80, 160, 260, 360];
    for (const delay of retryDelays) {
      setTimeout(() => ensureFocusedMetricVisible(serviceId), delay);
    }
  }

  useEffect(() => {
    if (!focusedMetricServiceId || keyboardHeight <= 0) {
      return;
    }

    const timeoutId = setTimeout(() => ensureFocusedMetricVisible(focusedMetricServiceId), 40);
    return () => clearTimeout(timeoutId);
  }, [focusedMetricServiceId, keyboardHeight, keyboardTopY]);

  async function refreshServicesFromServer(): Promise<void> {
    if (loadingServices) {
      return;
    }

    setErrorMessage(null);
    await loadServices(true);
  }

  function openServiceSearch(): void {
    setShowServiceSearch(true);
    setTimeout(() => {
      serviceSearchInputRef.current?.focus();
    }, 0);
  }

  function closeServiceSearch(): void {
    setShowServiceSearch(false);
    setServiceKeyword("");
    serviceSearchInputRef.current?.blur();
  }

  function goToReviewStep(): void {
    setShowServiceItemValidation(false);
    setShowReviewPromoPanel(false);
    setShowReviewDiscountPanel(false);
    setShowReviewNotesPanel(false);
    setStep("review");
    setErrorMessage(null);
  }

  function nextStep(): void {
    if (step === "customer") {
      if (!canCustomerNext) {
        setErrorMessage("Pilih konsumen dari daftar terlebih dulu.");
        return;
      }
      setActiveServiceGroupKey(null);
      setShowServiceItemValidation(false);
      setStep("services");
      setErrorMessage(null);
      return;
    }

    if (step === "services") {
      if (selectedServiceDrafts.length === 0) {
        setErrorMessage("Pilih minimal satu layanan terlebih dulu.");
        return;
      }

      if (!canServicesNext) {
        setShowServiceItemValidation(true);
        setErrorMessage(null);
        const firstInvalidServiceId = invalidSelectedLines[0]?.service.id;
        if (firstInvalidServiceId) {
          setFocusedMetricServiceId(firstInvalidServiceId);
          focusServiceMetricInput(firstInvalidServiceId);
        }
        return;
      }

      if (invalidSelectedLines.length > 0) {
        setShowServiceItemValidation(true);
        setErrorMessage(null);
        const firstInvalidServiceId = invalidSelectedLines[0]?.service.id;
        if (firstInvalidServiceId) {
          setFocusedMetricServiceId(firstInvalidServiceId);
          focusServiceMetricInput(firstInvalidServiceId);
        }
        return;
      }

      goToReviewStep();
    }
  }

  function previousStep(): void {
    if (step === "customer") {
      closeCreateFlow();
      navigation.navigate("OrdersTab", {
        screen: "OrdersToday",
      });
      return;
    }

    if (step === "services") {
      setShowServiceItemValidation(false);
      setStep("customer");
      setErrorMessage(null);
      return;
    }

    setShowServiceItemValidation(false);
    setStep("services");
    setErrorMessage(null);
  }

  async function submitOrder(): Promise<void> {
    if (!selectedOutlet || !canCreateOrder || submitting) {
      return;
    }

    if (!canCustomerNext) {
      setErrorMessage("Pilih konsumen dari daftar terlebih dulu.");
      setStep("customer");
      return;
    }

    if (!canServicesNext) {
      if (selectedServiceDrafts.length === 0) {
        setErrorMessage("Pilih minimal satu layanan terlebih dulu.");
      } else {
        setShowServiceItemValidation(true);
        setErrorMessage(null);
      }
      setStep("services");
      return;
    }

    if (invalidSelectedLines.length > 0) {
      setShowServiceItemValidation(true);
      setErrorMessage(null);
      setStep("services");
      const firstInvalidServiceId = invalidSelectedLines[0]?.service.id;
      if (firstInvalidServiceId) {
        setFocusedMetricServiceId(firstInvalidServiceId);
      }
      return;
    }

    if (voucherCodeRejected) {
      setErrorMessage(null);
      return;
    }

    if (discountExceedsLimit) {
      setErrorMessage(null);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const created = await createOrder({
        outletId: selectedOutlet.id,
        isPickupDelivery,
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          notes: customerNotes,
        },
        items: selectedLines.map((line) => ({
          serviceId: line.service.id,
          qty: isKgUnit(line.service.unit_type) ? undefined : line.metricValue,
          weightKg: isKgUnit(line.service.unit_type) ? line.metricValue : undefined,
        })),
        shippingFeeAmount: effectiveShippingFee,
        discountAmount: totalDiscountAmount,
        notes: orderNotesWithPromo,
      });

      await refreshSession();
      setLastCreatedOrderId(created.id);
      setActionMessage(`Order ${created.order_code} berhasil dibuat.`);
      setShowCreateForm(false);
      resetDraft();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const primaryDisabled =
    step === "customer"
      ? !canCustomerNext
      : step === "services"
        ? selectedServiceDrafts.length === 0
        : submitting || selectedLines.length === 0 || discountExceedsLimit || voucherCodeRejected;

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const stepProgressPercent = ((currentStepIndex + 1) / STEP_ORDER.length) * 100;
  const serviceSearchVisible = showServiceSearch || serviceKeyword.trim().length > 0;
  const keyboardVisible = keyboardHeight > 0;
  const footerVisible = showCreateForm && (!keyboardVisible || step === "review");
  const footerReservedSpace = showCreateForm
    ? keyboardVisible
      ? step === "review"
        ? (footerHeight > 0 ? footerHeight : 132 + insets.bottom) + theme.spacing.xs
        : keyboardHeight + theme.spacing.lg
      : (footerHeight > 0 ? footerHeight : 132 + insets.bottom) + theme.spacing.xs
    : 0;

  function handleFooterLayout(event: LayoutChangeEvent): void {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight !== footerHeight) {
      setFooterHeight(nextHeight);
    }
  }

  return (
    <AppScreen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.content, showCreateForm ? { paddingBottom: footerReservedSpace } : null]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          ref={contentScrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Tambah Pesanan</Text>
          </View>

          {!showCreateForm ? (
            <AppPanel style={styles.panel}>
              <View style={styles.actionList}>
                <AppButton
                  disabled={!canCreateOrder || loadingServices || services.length === 0}
                  leftElement={<Ionicons color={theme.colors.primaryContrast} name="bag-add-outline" size={18} />}
                  onPress={toggleCreateFlow}
                  title="Mulai Tambah Pesanan"
                />
                <AppButton
                  leftElement={<Ionicons color={theme.colors.info} name="person-add-outline" size={18} />}
                  onPress={() =>
                    navigation.navigate("AccountTab", {
                      screen: "Customers",
                    })
                  }
                  title="Tambah Pelanggan"
                  variant="secondary"
                />
              </View>
              {!canCreateOrder ? <Text style={styles.infoText}>Role Anda tidak memiliki akses membuat order.</Text> : null}
              {!loadingServices && canCreateOrder && services.length === 0 ? <Text style={styles.infoText}>Belum ada layanan aktif untuk outlet ini.</Text> : null}
              {loadingServices ? <ActivityIndicator color={theme.colors.info} size="small" /> : null}
            </AppPanel>
          ) : (
            <AppPanel style={styles.panel}>
              <View style={styles.stepsRow}>
                {STEP_ORDER.map((item, index) => {
                  const isActive = item === step;
                  const done = index < currentStepIndex;

                  return (
                    <View key={item} style={styles.stepItem}>
                      <View style={[styles.stepDot, isActive ? styles.stepDotActive : null, done ? styles.stepDotDone : null]}>
                        <Text style={[styles.stepDotText, isActive || done ? styles.stepDotTextActive : null]}>{index + 1}</Text>
                      </View>
                      <Text style={[styles.stepText, isActive ? styles.stepTextActive : null]}>{stepLabel(item)}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.stepProgressTrack}>
                <View style={[styles.stepProgressFill, { width: `${stepProgressPercent}%` }]} />
              </View>

              {step === "customer" ? (
                <View style={styles.sectionWrap}>
                  <View style={styles.customerTopBar}>
                    <View style={styles.customerTopTitleWrap}>
                      <Text style={styles.customerStepLeadTitle}>Pilih Konsumen</Text>
                      <Text style={styles.customerStepLeadSubtitleCompact}>{selectedCustomer ? "Konsumen sudah dipilih. Lanjut ke layanan." : "Pilih dari daftar pelanggan."}</Text>
                    </View>
                    <Pressable
                      onPress={selectedCustomer ? handleReplaceSelectedCustomer : openCreateCustomerForm}
                      style={({ pressed }) => [styles.customerTopAction, pressed ? styles.pressed : null]}
                    >
                      <Ionicons color={theme.colors.info} name={selectedCustomer ? "swap-horizontal-outline" : "person-add-outline"} size={15} />
                      <Text style={styles.customerTopActionText}>{selectedCustomer ? "Ganti" : "Tambah"}</Text>
                    </Pressable>
                  </View>

                  {selectedCustomer ? (
                    <View style={styles.selectedCustomerCard}>
                      <View style={styles.selectedCustomerHeadRow}>
                        <Text style={styles.selectedCustomerBadge}>Konsumen terpilih</Text>
                        <Ionicons color={theme.colors.success} name="checkmark-circle" size={14} />
                      </View>
                      <Text numberOfLines={1} style={styles.selectedCustomerName}>
                        {selectedCustomer.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.selectedCustomerMeta}>
                        {formatCustomerPhoneDisplay(selectedCustomer.phone_normalized)}
                      </Text>
                      <Text numberOfLines={1} style={styles.selectedCustomerMetaMuted}>
                        {selectedCustomer.orders_count && selectedCustomer.orders_count > 0 ? `${selectedCustomer.orders_count} transaksi` : "Lanjutkan ke langkah layanan."}
                      </Text>
                    </View>
                  ) : null}

                  {selectedCustomer ? (
                    <View style={styles.deliveryModePanel}>
                      <View style={styles.deliveryModeHeader}>
                        <Text style={styles.deliveryModeTitle}>Metode Pesanan</Text>
                        <Text style={styles.deliveryModeValue}>{isPickupDelivery ? "Antar Jemput" : "Datang Sendiri"}</Text>
                      </View>
                      <View style={styles.deliveryModeOptions}>
                        <Pressable
                          onPress={() => setIsPickupDelivery(false)}
                          style={({ pressed }) => [styles.deliveryModeOption, !isPickupDelivery ? styles.deliveryModeOptionActive : null, pressed ? styles.pressed : null]}
                        >
                          <Ionicons color={!isPickupDelivery ? theme.colors.info : theme.colors.textMuted} name="walk-outline" size={14} />
                          <Text style={[styles.deliveryModeOptionText, !isPickupDelivery ? styles.deliveryModeOptionTextActive : null]}>Datang Sendiri</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setIsPickupDelivery(true)}
                          style={({ pressed }) => [styles.deliveryModeOption, isPickupDelivery ? styles.deliveryModeOptionActive : null, pressed ? styles.pressed : null]}
                        >
                          <Ionicons color={isPickupDelivery ? theme.colors.info : theme.colors.textMuted} name="car-outline" size={14} />
                          <Text style={[styles.deliveryModeOptionText, isPickupDelivery ? styles.deliveryModeOptionTextActive : null]}>Antar Jemput</Text>
                        </Pressable>
                      </View>
                      {isPickupDelivery ? (
                        <Text style={styles.deliveryModeHint}>
                          {selectedCustomerProfile?.address?.trim() ? "Alamat pelanggan siap dipakai untuk pickup/delivery." : "Alamat pelanggan belum diisi. Tambahkan alamat agar antar jemput lebih akurat."}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {selectedCustomer ? (
                    <View style={styles.customerInsightStack}>
                      <AppPanel style={styles.customerInsightPanel}>
                        <Text style={styles.customerInsightTitle}>Profil & Kontak</Text>

                        <View style={styles.customerInsightRow}>
                          <View style={styles.customerInsightIconWrap}>
                            <Ionicons color={theme.colors.textSecondary} name="call-outline" size={14} />
                          </View>
                          <View style={styles.customerInsightTextWrap}>
                            <Text style={styles.customerInsightLabel}>Telepon</Text>
                            <Text style={styles.customerInsightValue}>{formatCustomerPhoneDisplay(selectedCustomer.phone_normalized)}</Text>
                          </View>
                        </View>

                        <View style={styles.customerInsightRow}>
                          <View style={styles.customerInsightIconWrap}>
                            <Ionicons color={theme.colors.textSecondary} name="location-outline" size={14} />
                          </View>
                          <View style={styles.customerInsightTextWrap}>
                            <Text style={styles.customerInsightLabel}>Alamat</Text>
                            <Text style={[styles.customerInsightValue, !selectedCustomerProfile?.address?.trim() ? styles.customerInsightValueMuted : null]}>
                              {selectedCustomerProfile?.address?.trim() || "Belum diisi"}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.customerInsightRow}>
                          <View style={styles.customerInsightIconWrap}>
                            <Ionicons color={theme.colors.textSecondary} name="mail-outline" size={14} />
                          </View>
                          <View style={styles.customerInsightTextWrap}>
                            <Text style={styles.customerInsightLabel}>Email</Text>
                            <Text style={[styles.customerInsightValue, !selectedCustomerProfile?.email?.trim() ? styles.customerInsightValueMuted : null]}>
                              {selectedCustomerProfile?.email?.trim() || "Belum diisi"}
                            </Text>
                          </View>
                        </View>

                        {selectedCustomerProfile?.birthDate?.trim() ? (
                          <View style={styles.customerInsightRow}>
                            <View style={styles.customerInsightIconWrap}>
                              <Ionicons color={theme.colors.textSecondary} name="calendar-outline" size={14} />
                            </View>
                            <View style={styles.customerInsightTextWrap}>
                              <Text style={styles.customerInsightLabel}>Tanggal Lahir</Text>
                              <Text style={styles.customerInsightValue}>{selectedCustomerProfile.birthDate.trim()}</Text>
                            </View>
                          </View>
                        ) : null}

                        <View style={styles.customerInsightRow}>
                          <View style={styles.customerInsightIconWrap}>
                            <Ionicons color={theme.colors.textSecondary} name="document-text-outline" size={14} />
                          </View>
                          <View style={styles.customerInsightTextWrap}>
                            <Text style={styles.customerInsightLabel}>Catatan</Text>
                            <Text style={[styles.customerInsightValue, !selectedCustomerProfile?.note?.trim() ? styles.customerInsightValueMuted : null]}>
                              {selectedCustomerProfile?.note?.trim() || "Tidak ada catatan"}
                            </Text>
                          </View>
                        </View>

                        {selectedCustomerProfile?.gender ? (
                          <View style={styles.customerInsightRow}>
                            <View style={styles.customerInsightIconWrap}>
                              <Ionicons color={theme.colors.textSecondary} name="transgender-outline" size={14} />
                            </View>
                            <View style={styles.customerInsightTextWrap}>
                              <Text style={styles.customerInsightLabel}>Gender</Text>
                              <Text style={styles.customerInsightValue}>{mapGenderLabel(selectedCustomerProfile.gender)}</Text>
                            </View>
                          </View>
                        ) : null}
                      </AppPanel>

                      <AppPanel style={styles.customerInsightPanel}>
                        <View style={styles.customerInsightHeaderRow}>
                          <Text style={styles.customerInsightTitle}>Data Transaksi</Text>
                          {loadingCustomerOrdersPreview ? <ActivityIndicator color={theme.colors.info} size="small" /> : null}
                        </View>

                        <View style={styles.customerMetricGrid}>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>{customerTransactionSummary.totalTransactions}</Text>
                            <Text style={styles.customerMetricLabel}>Total transaksi</Text>
                          </View>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>{customerTransactionSummary.unpaidCount}</Text>
                            <Text style={styles.customerMetricLabel}>Transaksi piutang</Text>
                          </View>
                        </View>

                        <View style={styles.customerMetricGrid}>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>{formatMoney(customerTransactionSummary.totalAmount)}</Text>
                            <Text style={styles.customerMetricLabel}>Akumulasi belanja</Text>
                          </View>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>{formatMoney(customerTransactionSummary.outstandingAmount)}</Text>
                            <Text style={styles.customerMetricLabel}>Piutang aktif</Text>
                          </View>
                        </View>

                        <Text style={styles.customerInsightHint}>Transaksi terakhir: {formatDateShort(customerTransactionSummary.lastOrderAt)}</Text>
                      </AppPanel>

                      <AppPanel style={styles.customerInsightPanel}>
                        <Text style={styles.customerInsightTitle}>Data Paket</Text>
                        <View style={styles.customerMetricGrid}>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>0</Text>
                            <Text style={styles.customerMetricLabel}>Paket aktif</Text>
                          </View>
                          <View style={styles.customerMetricItem}>
                            <Text style={styles.customerMetricValue}>-</Text>
                            <Text style={styles.customerMetricLabel}>Sisa kuota</Text>
                          </View>
                        </View>
                        <Text style={styles.customerInsightHint}>Data paket pelanggan belum tersedia di API saat ini.</Text>
                      </AppPanel>
                    </View>
                  ) : null}

                  {!selectedCustomer ? (
                    <View style={styles.customerPanel}>
                      <View style={styles.customerPanelMetaRow}>
                        <Text style={styles.customerPanelTitle}>Daftar pelanggan</Text>
                        <View style={styles.customerCountWrap}>
                          {loadingMoreCustomers ? <ActivityIndicator color={theme.colors.info} size="small" /> : null}
                          <Text style={styles.customerCountText}>{customerCountInfo}</Text>
                        </View>
                      </View>

                      <View style={styles.customerSearchWrap}>
                        <Ionicons color={theme.colors.textMuted} name="search-outline" size={16} />
                        <TextInput
                          onChangeText={setCustomerKeyword}
                          placeholder="Cari nama, HP, atau alamat"
                          placeholderTextColor={theme.colors.textMuted}
                          style={styles.customerSearchInput}
                          value={customerKeyword}
                        />
                        {customerKeyword.trim() ? (
                          <Pressable hitSlop={6} onPress={() => setCustomerKeyword("")} style={({ pressed }) => [styles.customerSearchAction, pressed ? styles.pressed : null]}>
                            <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          disabled={loadingCustomers || loadingMoreCustomers}
                          hitSlop={6}
                          onPress={() =>
                            void loadCustomers(true, {
                              fetchAll: true,
                              keyword: "",
                            })
                          }
                          style={({ pressed }) => [styles.customerSearchAction, pressed ? styles.pressed : null, loadingCustomers || loadingMoreCustomers ? styles.customerSearchActionDisabled : null]}
                        >
                          {loadingCustomers || loadingMoreCustomers ? <ActivityIndicator color={theme.colors.info} size="small" /> : <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={17} />}
                        </Pressable>
                      </View>

                      {loadingCustomers ? (
                        <ActivityIndicator color={theme.colors.info} size="small" />
                      ) : customerListEntries.length > 0 ? (
                        <ScrollView contentContainerStyle={styles.customerListContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.customerList}>
                          {customerListEntries.map((entry) => (
                            <Pressable key={entry.customer.id} onPress={() => handleSelectCustomer(entry.customer)} style={({ pressed }) => [styles.customerItem, pressed ? styles.pressed : null]}>
                              <View style={styles.customerItemMain}>
                                <Text numberOfLines={1} style={styles.customerItemName}>
                                  {entry.customer.name}
                                </Text>
                                <Text numberOfLines={1} style={styles.customerItemMeta}>
                                  {formatCustomerPhoneDisplay(entry.customer.phone_normalized)}
                                </Text>
                                <Text numberOfLines={1} style={[styles.customerItemAddress, !entry.address ? styles.customerItemAddressMuted : null]}>
                                  {entry.address || "Alamat belum diisi"}
                                </Text>
                              </View>
                              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.infoText}>Data konsumen tidak ditemukan.</Text>
                      )}
                    </View>
                  ) : null}

                </View>
              ) : null}

              {step === "services" ? (
                <View style={styles.sectionWrap}>
                  <View style={styles.servicesTopBar}>
                    <View style={styles.servicesTopTitleWrap}>
                      <Text style={styles.stepHeaderTitle}>Pilih Layanan</Text>
                      <Text style={styles.servicesTopSubtitle}>Pilih group dulu, lanjut pilih layanan dan isi qty/berat.</Text>
                    </View>
                    <View style={styles.servicesTopActions}>
                      <Pressable
                        disabled={loadingServices}
                        onPress={() => void refreshServicesFromServer()}
                        style={({ pressed }) => [styles.serviceSearchIconButton, pressed ? styles.pressed : null, loadingServices ? styles.serviceIconButtonDisabled : null]}
                      >
                        {loadingServices ? (
                          <ActivityIndicator color={theme.colors.info} size="small" />
                        ) : (
                          <Ionicons color={theme.colors.textSecondary} name="refresh" size={18} />
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (serviceSearchVisible) {
                            closeServiceSearch();
                            return;
                          }
                          openServiceSearch();
                        }}
                        style={({ pressed }) => [styles.serviceSearchIconButton, serviceSearchVisible ? styles.serviceSearchIconButtonActive : null, pressed ? styles.pressed : null]}
                      >
                        <Ionicons color={serviceSearchVisible ? theme.colors.info : theme.colors.textSecondary} name={serviceSearchVisible ? "close" : "search"} size={18} />
                      </Pressable>
                    </View>
                  </View>

                  {serviceSearchVisible ? (
                    <View style={styles.serviceSearchWrap}>
                      <Ionicons color={theme.colors.textMuted} name="search-outline" size={16} />
                      <TextInput
                        onChangeText={setServiceKeyword}
                        placeholder={activeServiceGroup ? "Cari layanan di group ini" : "Cari group layanan"}
                        placeholderTextColor={theme.colors.textMuted}
                        ref={serviceSearchInputRef}
                        style={styles.serviceSearchInput}
                        value={serviceKeyword}
                      />
                      {serviceKeyword.trim() ? (
                        <Pressable hitSlop={6} onPress={() => setServiceKeyword("")} style={({ pressed }) => [styles.customerSearchAction, pressed ? styles.pressed : null]}>
                          <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {!activeServiceGroup ? (
                    <>
                      {visibleServiceGroups.length === 0 ? <Text style={styles.infoText}>Group layanan tidak ditemukan.</Text> : null}
                      <View style={styles.serviceGroupList}>
                        {visibleServiceGroups.map((group) => {
                          const validCount = validSelectedCountByGroup[group.key] ?? 0;
                          const groupMeta = validCount > 0 ? `${group.items.length} layanan • ${validCount} aktif` : `${group.items.length} layanan`;
                          return (
                            <Pressable
                              key={group.key}
                              onPress={() => {
                                setActiveServiceGroupKey(group.key);
                                closeServiceSearch();
                              }}
                              style={({ pressed }) => [styles.serviceGroupPickerItem, pressed ? styles.pressed : null]}
                            >
                              <View style={styles.serviceGroupPickerMain}>
                                <Text numberOfLines={1} style={styles.serviceGroupPickerName}>
                                  {group.label}
                                </Text>
                                <Text style={styles.serviceGroupPickerMeta}>{groupMeta}</Text>
                              </View>
                              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.activeGroupBar}>
                        <Pressable
                          onPress={() => {
                            setActiveServiceGroupKey(null);
                            closeServiceSearch();
                          }}
                          style={({ pressed }) => [styles.activeGroupBackLink, pressed ? styles.pressed : null]}
                        >
                          <Ionicons color={theme.colors.info} name="chevron-back" size={17} />
                          <Text style={styles.activeGroupBackLinkText}>Kembali ke daftar group</Text>
                        </Pressable>
                      </View>

                      {visibleServicesInActiveGroup.length === 0 ? <Text style={styles.infoText}>Layanan di group ini tidak ditemukan.</Text> : null}
                      <View style={styles.serviceGroupSection}>
                        <View style={styles.serviceGroupHeader}>
                          <Text numberOfLines={1} style={styles.serviceGroupTitle}>
                            {activeServiceGroup.label}
                          </Text>
                          <Text style={styles.serviceGroupCount}>
                            {activeServiceGroup.items.length} layanan • {validSelectedCountByGroup[activeServiceGroup.key] ?? 0} aktif
                          </Text>
                        </View>
                        <View style={styles.serviceGroupList}>
                          {visibleServicesInActiveGroupLimited.map((service) => {
                            const selected = selectedServiceIdSet.has(service.id);
                            const selectedDraft = selectedServiceDraftById[service.id];
                            const showInlineValidationError = showServiceItemValidation && selected && !selectedDraft?.hasValidMetric;

                            return (
                              <View key={service.id} style={[styles.servicePickerBlock, selected ? styles.servicePickerItemSelected : null]}>
                                <Pressable
                                  onPress={() => toggleServiceSelection(service.id)}
                                  style={({ pressed }) => [styles.servicePickerItem, pressed ? styles.pressed : null]}
                                >
                                  <View style={styles.servicePickerMain}>
                                    <Text numberOfLines={1} style={styles.servicePickerName}>
                                      {service.name}
                                    </Text>
                                    <Text style={styles.servicePickerMeta}>{formatMoney(service.effective_price_amount)} / {service.unit_type.toUpperCase()}</Text>
                                  </View>
                                <View style={[styles.servicePickerCheck, selected ? styles.servicePickerCheckActive : null]}>
                                  {selected ? <Ionicons color={theme.colors.primaryContrast} name="checkmark" size={13} /> : null}
                                </View>
                                </Pressable>
                                {selected ? (
                                  <View style={styles.serviceInlineInputWrap}>
                                    <View style={styles.stepperRow}>
                                      <Pressable onPress={() => stepMetric(service, -1)} style={({ pressed }) => [styles.stepperButton, pressed ? styles.pressed : null]}>
                                        <Text style={styles.stepperButtonText}>-</Text>
                                      </Pressable>
                                      <TextInput
                                        keyboardType="numeric"
                                        onChangeText={(value) => updateMetric(service.id, value)}
                                        onBlur={() => {
                                          setFocusedMetricServiceId((current) => (current === service.id ? null : current));
                                        }}
                                        onFocus={() => {
                                          setFocusedMetricServiceId(service.id);
                                          focusServiceMetricInput(service.id);
                                        }}
                                        placeholder={isKgUnit(service.unit_type) ? "KG" : "QTY"}
                                        placeholderTextColor={theme.colors.textMuted}
                                        ref={(ref) => {
                                          serviceInputRefs.current[service.id] = ref;
                                        }}
                                        style={[styles.metricInput, showInlineValidationError ? styles.metricInputInvalid : null]}
                                        value={selectedDraft?.metricRaw ?? ""}
                                      />
                                      <Pressable onPress={() => stepMetric(service, 1)} style={({ pressed }) => [styles.stepperButton, pressed ? styles.pressed : null]}>
                                        <Text style={styles.stepperButtonText}>+</Text>
                                      </Pressable>
                                    </View>
                                    {selectedDraft?.hasValidMetric ? (
                                      <Text style={styles.serviceQtySubtotal}>{formatMoney(selectedDraft.subtotal)}</Text>
                                    ) : showInlineValidationError ? (
                                      <Text style={styles.serviceQtyErrorText}>Wajib isi qty/berat</Text>
                                    ) : (
                                      <Text style={styles.serviceQtyHint}>Isi nilai</Text>
                                    )}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                          {remainingServicesInActiveGroupCount > 0 ? (
                            <Pressable
                              onPress={() => {
                                setVisibleServiceLimit((current) => current + SERVICE_RENDER_BATCH);
                              }}
                              style={({ pressed }) => [styles.serviceLoadMoreButton, pressed ? styles.pressed : null]}
                            >
                              <Text style={styles.serviceLoadMoreText}>Muat {Math.min(SERVICE_RENDER_BATCH, remainingServicesInActiveGroupCount)} layanan lagi</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        {(validSelectedCountByGroup[activeServiceGroup.key] ?? 0) === 0 ? <Text style={styles.infoText}>Pilih varian untuk isi qty atau berat.</Text> : null}
                      </View>
                    </>
                  )}

                </View>
              ) : null}

              {step === "review" ? (
                <View style={styles.sectionWrap}>
                  <View style={styles.stepHeader}>
                    <View style={styles.stepHeaderIconWrap}>
                      <Ionicons color={theme.colors.info} name="document-text-outline" size={16} />
                    </View>
                    <View style={styles.stepHeaderTextWrap}>
                      <Text style={styles.stepHeaderTitle}>Review Pesanan</Text>
                      <Text style={styles.stepHeaderSubtitle}>Cek total dan catatan sebelum simpan.</Text>
                    </View>
                  </View>

                  <AppPanel style={styles.summaryPanel}>
                    <View style={styles.reviewCustomerRow}>
                      <View style={styles.reviewCustomerMain}>
                        <Text numberOfLines={1} style={styles.reviewCustomerName}>
                          {customerName || "-"}
                        </Text>
                        <Text numberOfLines={1} style={styles.reviewCustomerPhone}>
                          {formatCustomerPhoneDisplay(customerPhone)}
                        </Text>
                      </View>
                      <Text style={styles.reviewCustomerMethod}>{isPickupDelivery ? "Antar Jemput" : "Datang Sendiri"}</Text>
                    </View>
                  </AppPanel>

                  <AppPanel style={[styles.summaryPanel, styles.summaryTotalPanel]}>
                    <View style={styles.summarySectionHeader}>
                      <Text style={styles.summaryTitle}>Item Layanan</Text>
                      <Text style={styles.summarySectionMeta}>{selectedLines.length} item</Text>
                    </View>
                    <View style={styles.summaryItemList}>
                      {selectedLines.map((line) => (
                        <View key={line.service.id} style={styles.summaryItemCard}>
                          <View style={styles.summaryItemTopRow}>
                            <Text numberOfLines={1} style={styles.summaryItemName}>
                              {line.service.name}
                            </Text>
                            <Text style={styles.summaryItemSubtotal}>{formatMoney(line.subtotal)}</Text>
                          </View>
                          <Text style={styles.summaryItemMeta}>
                            {formatMetricValue(line.metricValue, line.service.unit_type)} {line.service.unit_type.toUpperCase()} x {formatMoney(line.service.effective_price_amount ?? 0)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Subtotal</Text>
                      <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
                    </View>
                    {isPickupDelivery ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryText}>Ongkir</Text>
                        <Text style={styles.summaryValue}>{formatMoney(effectiveShippingFee)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Diskon Promo</Text>
                      <Text style={styles.summaryValue}>- {formatMoney(promoDiscountAmount)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Diskon Manual</Text>
                      <Text style={styles.summaryValue}>- {formatMoney(discountAmount)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Total Potongan</Text>
                      <Text style={styles.summaryValue}>- {formatMoney(totalDiscountAmount)}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryTotal}>Total Estimasi</Text>
                      <Text style={styles.summaryTotalValue}>{formatMoney(total)}</Text>
                    </View>
                  </AppPanel>

                  <AppPanel style={styles.summaryPanel}>
                    <Pressable onPress={() => setShowReviewPromoPanel((current) => !current)} style={({ pressed }) => [styles.reviewToggleButton, pressed ? styles.pressed : null]}>
                      <View style={styles.reviewToggleMain}>
                        <Text style={styles.summaryTitle}>Promo</Text>
                        <Text style={styles.reviewToggleHint}>{appliedPromoDrafts.length > 0 ? `${appliedPromoDrafts.length} promo dipakai` : "Pilih promo atau voucher"}</Text>
                      </View>
                      <View style={styles.reviewToggleRight}>
                        {promoDiscountAmount > 0 ? <Text style={styles.reviewToggleValue}>- {formatMoney(promoDiscountAmount)}</Text> : null}
                        <Ionicons color={theme.colors.textMuted} name={showReviewPromoPanel ? "chevron-up" : "chevron-down"} size={18} />
                      </View>
                    </Pressable>

                    {showReviewPromoPanel ? (
                      <>
                        <View style={styles.reviewPromoUtilityRow}>
                          <Pressable
                            disabled={loadingPromotions}
                            onPress={() => void loadPromotions(true)}
                            style={({ pressed }) => [styles.reviewPromoRefresh, loadingPromotions ? styles.serviceIconButtonDisabled : null, pressed ? styles.pressed : null]}
                          >
                            {loadingPromotions ? <ActivityIndicator color={theme.colors.info} size="small" /> : <Ionicons color={theme.colors.info} name="refresh" size={16} />}
                          </Pressable>
                        </View>
                        {promoErrorMessage ? <Text style={styles.reviewFieldError}>{promoErrorMessage}</Text> : null}

                        {automaticPromoDraftList.length > 0 ? (
                          <View style={styles.reviewPromoBlock}>
                            <Text style={styles.reviewAmountLabel}>Otomatis</Text>
                            {automaticPromoDraftList.map((item) => (
                              <View key={item.promo.id} style={styles.reviewPromoRow}>
                                <View style={styles.reviewPromoRowMain}>
                                  <Text numberOfLines={1} style={styles.reviewPromoName}>
                                    {item.promo.name}
                                  </Text>
                                  <Text style={styles.reviewPromoMeta}>{formatPromotionRuleSummary(item.promo)}</Text>
                                </View>
                                <Text style={styles.reviewPromoValue}>- {formatMoney(item.discountAmount)}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {selectionPromoDrafts.length > 0 ? (
                          <View style={styles.reviewPromoBlock}>
                            <Text style={styles.reviewAmountLabel}>Pilih Promo</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewPromoChipScroller}>
                              <View style={styles.reviewPromoChipRow}>
                                <Pressable
                                  onPress={() => setSelectedPromoId(null)}
                                  style={({ pressed }) => [styles.reviewPromoChip, selectedPromoId === null ? styles.reviewPromoChipActive : null, pressed ? styles.pressed : null]}
                                >
                                  <Text style={[styles.reviewPromoChipText, selectedPromoId === null ? styles.reviewPromoChipTextActive : null]}>Tanpa Promo</Text>
                                </Pressable>
                                {selectionPromoDrafts.map((item) => {
                                  const active = selectedPromoId === item.promo.id;
                                  return (
                                    <Pressable key={item.promo.id} onPress={() => setSelectedPromoId(item.promo.id)} style={({ pressed }) => [styles.reviewPromoChip, active ? styles.reviewPromoChipActive : null, pressed ? styles.pressed : null]}>
                                      <Text style={[styles.reviewPromoChipText, active ? styles.reviewPromoChipTextActive : null]}>{item.promo.name}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </ScrollView>
                          </View>
                        ) : null}

                        <View style={styles.reviewPromoBlock}>
                          <Text style={styles.reviewAmountLabel}>Voucher</Text>
                          <TextInput
                            autoCapitalize="characters"
                            onChangeText={handlePromoVoucherCodeChange}
                            placeholder="Kode voucher (opsional)"
                            placeholderTextColor={theme.colors.textMuted}
                            style={[styles.input, styles.reviewAmountInput, voucherCodeRejected ? styles.inputInvalid : null]}
                            value={promoVoucherCodeInput}
                          />
                          {promoVoucherCodeInput.trim() ? (
                            voucherPromoDraft ? (
                              <Text style={styles.reviewPromoHint}>
                                Voucher aktif: {voucherPromoDraft.promo.name} • Potongan {formatMoney(voucherPromoDraft.discountAmount)}
                              </Text>
                            ) : (
                              <Text style={styles.reviewFieldError}>Kode voucher tidak valid atau belum memenuhi syarat promo.</Text>
                            )
                          ) : (
                            <Text style={styles.reviewPromoHint}>Kosongkan jika tidak pakai voucher.</Text>
                          )}
                        </View>

                        {appliedPromoDrafts.length > 0 ? (
                          <View style={styles.reviewPromoBlock}>
                            <Text style={styles.reviewAmountLabel}>Dipakai</Text>
                            {appliedPromoDrafts.map((item) => (
                              <View key={`${item.source}-${item.promo.id}`} style={styles.reviewPromoRow}>
                                <View style={styles.reviewPromoRowMain}>
                                  <Text numberOfLines={1} style={styles.reviewPromoName}>
                                    {item.promo.name}
                                  </Text>
                                  <Text style={styles.reviewPromoMeta}>
                                    {formatPromotionTypeLabel(item.promo.promo_type)} • {item.promo.stack_mode === "exclusive" ? "Eksklusif" : "Stackable"}
                                  </Text>
                                </View>
                                <Text style={styles.reviewPromoValue}>- {formatMoney(item.discountAmount)}</Text>
                              </View>
                            ))}
                            {promoExclusiveApplied ? <Text style={styles.reviewPromoHint}>Promo eksklusif diprioritaskan.</Text> : null}
                          </View>
                        ) : !promoErrorMessage ? (
                          <Text style={styles.reviewPromoHint}>Belum ada promo aktif yang cocok.</Text>
                        ) : null}
                      </>
                    ) : null}
                  </AppPanel>

                  <AppPanel style={styles.summaryPanel}>
                    <Pressable onPress={() => setShowReviewDiscountPanel((current) => !current)} style={({ pressed }) => [styles.reviewToggleButton, pressed ? styles.pressed : null]}>
                      <View style={styles.reviewToggleMain}>
                        <Text style={styles.summaryTitle}>Diskon</Text>
                        <Text style={styles.reviewToggleHint}>{isPickupDelivery ? "Ongkir dan diskon manual" : "Diskon manual"}</Text>
                      </View>
                      <View style={styles.reviewToggleRight}>
                        {totalDiscountAmount > 0 ? <Text style={styles.reviewToggleValue}>- {formatMoney(totalDiscountAmount)}</Text> : null}
                        <Ionicons color={theme.colors.textMuted} name={showReviewDiscountPanel ? "chevron-up" : "chevron-down"} size={18} />
                      </View>
                    </Pressable>

                    {showReviewDiscountPanel ? (
                      <>
                        <View style={styles.reviewAdjustmentsGrid}>
                          {isPickupDelivery ? (
                            <View style={styles.reviewAmountField}>
                              <Text style={styles.reviewAmountLabel}>Ongkir</Text>
                              <TextInput
                                keyboardType="numeric"
                                onChangeText={handleShippingFeeChange}
                                placeholder="0"
                                placeholderTextColor={theme.colors.textMuted}
                                style={[styles.input, styles.reviewAmountInput]}
                                value={shippingFeeInput}
                              />
                              <Text style={styles.reviewAmountHint}>{formatMoney(shippingFee)}</Text>
                            </View>
                          ) : null}
                          <View style={styles.reviewAmountField}>
                            <Text style={styles.reviewAmountLabel}>Diskon Manual</Text>
                            <TextInput
                              keyboardType="numeric"
                              onChangeText={handleDiscountChange}
                              placeholder="0"
                              placeholderTextColor={theme.colors.textMuted}
                              style={[styles.input, styles.reviewAmountInput, discountExceedsLimit ? styles.inputInvalid : null]}
                              value={discountInput}
                            />
                            <Text style={styles.reviewAmountHint}>- {formatMoney(discountAmount)}</Text>
                          </View>
                        </View>
                        {discountExceedsLimit ? (
                          <Text style={styles.reviewFieldError}>
                            Total potongan (promo + manual) melebihi {isPickupDelivery ? "subtotal + ongkir" : "subtotal"}.
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </AppPanel>

                  <AppPanel style={styles.summaryPanel}>
                    <Pressable onPress={() => setShowReviewNotesPanel((current) => !current)} style={({ pressed }) => [styles.reviewToggleButton, pressed ? styles.pressed : null]}>
                      <View style={styles.reviewToggleMain}>
                        <Text style={styles.summaryTitle}>Catatan</Text>
                        <Text numberOfLines={1} style={styles.reviewToggleHint}>
                          {orderNotes.trim() ? orderNotes.trim() : "Opsional"}
                        </Text>
                      </View>
                      <View style={styles.reviewToggleRight}>
                        <Ionicons color={theme.colors.textMuted} name={showReviewNotesPanel ? "chevron-up" : "chevron-down"} size={18} />
                      </View>
                    </Pressable>

                    {showReviewNotesPanel ? (
                      <TextInput
                        multiline
                        onChangeText={setOrderNotes}
                        placeholder="Catatan order (opsional)"
                        placeholderTextColor={theme.colors.textMuted}
                        style={[styles.input, styles.reviewNotesInput]}
                        value={orderNotes}
                      />
                    ) : null}
                  </AppPanel>

                </View>
              ) : null}
            </AppPanel>
          )}

          {lastCreatedOrderId && !showCreateForm ? (
            <AppPanel style={styles.panel}>
              <AppButton
                leftElement={<Ionicons color={theme.colors.info} name="receipt-outline" size={18} />}
                onPress={() =>
                  navigation.navigate("OrdersTab", {
                    screen: "OrderDetail",
                    params: { orderId: lastCreatedOrderId },
                  })
                }
                title="Lihat Detail Order"
                variant="secondary"
              />
            </AppPanel>
          ) : null}

          {actionMessage ? (
            <View style={styles.successWrap}>
              <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
              <Text style={styles.successText}>{actionMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorWrap}>
              <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </ScrollView>

        {footerVisible ? (
          <View onLayout={handleFooterLayout} style={[styles.footer, step === "review" ? styles.footerReview : null, { bottom: -insets.bottom, paddingBottom: footerBottomPadding }]}>
            <View style={styles.footerMetaRow}>
              <View style={styles.footerMetaLeft}>
                <Text style={styles.footerMetaText}>Langkah {currentStepIndex + 1} dari 3</Text>
                <Text style={styles.footerMetaHint}>{selectedLines.length} layanan aktif</Text>
              </View>
              <Text style={styles.footerMetaValue}>{formatMoney(total)}</Text>
            </View>
            <View style={[styles.footerActions, step === "review" ? styles.footerActionsReview : null]}>
              <View style={styles.footerActionItem}>
                <AppButton leftElement={<Ionicons color={theme.colors.textPrimary} name="arrow-back-outline" size={18} />} onPress={previousStep} title={step === "customer" ? "Batal" : "Kembali"} variant="ghost" />
              </View>
              <View style={styles.footerActionItem}>
                <AppButton
                  disabled={primaryDisabled}
                  leftElement={<Ionicons color={theme.colors.primaryContrast} name={step === "review" ? "save-outline" : "arrow-forward-outline"} size={18} />}
                  loading={submitting && step === "review"}
                  onPress={() => {
                    if (step === "review") {
                      void submitOrder();
                      return;
                    }
                    nextStep();
                  }}
                  title={step === "review" ? "Simpan Pesanan" : "Lanjut"}
                />
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  const contentHorizontal = isTablet ? theme.spacing.xl : theme.spacing.lg;
  const contentTop = isCompactLandscape ? theme.spacing.md : theme.spacing.lg;

  return StyleSheet.create({
    root: {
      flex: 1,
      position: "relative",
    },
    scroll: {
      flex: 1,
    },
    pageHeader: {
      paddingHorizontal: 2,
    },
    pageTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 26 : 22,
      lineHeight: isTablet ? 33 : 29,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: contentHorizontal,
      paddingTop: contentTop,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    hero: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
    },
    heroBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    heroBadge: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 23,
      lineHeight: isTablet ? 34 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    heroMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    outletText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 17,
    },
    heroStatusPill: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.86)",
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    heroStatusText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    panel: {
      gap: theme.spacing.md,
    },
    actionList: {
      gap: theme.spacing.sm,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    stepsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 2,
    },
    stepProgressTrack: {
      height: 5,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.border,
      overflow: "hidden",
      marginTop: 2,
      marginBottom: 4,
    },
    stepProgressFill: {
      height: "100%",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.info,
    },
    stepItem: {
      flex: 1,
      alignItems: "center",
      gap: 4,
    },
    stepDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    stepDotDone: {
      borderColor: theme.colors.success,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
    },
    stepDotText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    stepDotTextActive: {
      color: theme.colors.info,
    },
    stepText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    stepTextActive: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
    },
    sectionWrap: {
      gap: theme.spacing.xs,
    },
    customerTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: 2,
    },
    customerTopTitleWrap: {
      flex: 1,
      gap: 1,
    },
    customerStepLeadTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13.5,
      lineHeight: 19,
    },
    customerStepLeadSubtitleCompact: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    customerTopAction: {
      minHeight: 32,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    customerTopActionText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 14,
    },
    stepHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    stepHeaderIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    stepHeaderTextWrap: {
      flex: 1,
      gap: 1,
    },
    stepHeaderTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 18,
    },
    stepHeaderSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    servicesTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: 2,
    },
    servicesTopTitleWrap: {
      flex: 1,
      gap: 2,
    },
    servicesTopActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    servicesTopSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    serviceSearchIconButton: {
      width: 32,
      height: 32,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    serviceSearchIconButtonActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    serviceIconButtonDisabled: {
      opacity: 0.72,
    },
    serviceSearchWrap: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      minHeight: isTablet ? 40 : 36,
      paddingHorizontal: 10,
      paddingVertical: isTablet ? 7 : 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    serviceSearchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingVertical: 0,
    },
    inlineActions: {
      flexDirection: "row",
      gap: 8,
    },
    inlineAction: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    inlineActionSingle: {
      flex: 0,
      alignSelf: "flex-start",
      minWidth: 170,
    },
    inlineActionText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      textAlign: "center",
    },
    customerPanel: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      padding: 8,
      gap: 8,
    },
    customerPanelMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    customerPanelTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    customerSearchWrap: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      minHeight: isTablet ? 44 : 40,
      paddingHorizontal: 10,
      paddingVertical: isTablet ? 8 : 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    customerSearchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingVertical: 0,
    },
    customerSearchAction: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    customerSearchActionDisabled: {
      opacity: 0.7,
    },
    customerFilters: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    customerFilterChip: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    customerFilterChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    customerFilterChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    customerFilterChipTextActive: {
      color: theme.colors.info,
    },
    customerCountText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    customerCountWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    customerList: {
      maxHeight: isTablet ? 470 : 420,
    },
    customerListContent: {
      gap: 5,
      paddingBottom: 2,
    },
    customerItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    customerItemActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    customerItemMain: {
      flex: 1,
      gap: 1,
    },
    customerItemName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 18,
    },
    customerItemMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    customerItemAddress: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    customerItemAddressMuted: {
      color: theme.colors.textMuted,
    },
    customerItemDetail: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    customerItemNote: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    selectedCustomerCard: {
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 1,
    },
    selectedCustomerHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    selectedCustomerBadge: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    selectedCustomerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 18,
    },
    selectedCustomerMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    selectedCustomerMetaMuted: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    deliveryModePanel: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 6,
    },
    deliveryModeHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    deliveryModeTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    deliveryModeValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    deliveryModeOptions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    deliveryModeOption: {
      flex: 1,
      minHeight: 34,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    deliveryModeOptionActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    deliveryModeOptionText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    deliveryModeOptionTextActive: {
      color: theme.colors.info,
    },
    deliveryModeHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    customerInsightStack: {
      gap: 8,
    },
    customerInsightPanel: {
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
      gap: 7,
    },
    customerInsightHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    customerInsightTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    customerInsightRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    customerInsightIconWrap: {
      width: 23,
      height: 23,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    customerInsightTextWrap: {
      flex: 1,
      gap: 1,
    },
    customerInsightLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    customerInsightValue: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    customerInsightValueMuted: {
      color: theme.colors.textMuted,
    },
    customerMetricGrid: {
      flexDirection: "row",
      gap: 8,
    },
    customerMetricItem: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 9,
      paddingVertical: 8,
      gap: 1,
    },
    customerMetricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      lineHeight: 17,
    },
    customerMetricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    customerInsightHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    serviceGroupSection: {
      gap: 6,
    },
    serviceGroupHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: 2,
    },
    serviceGroupTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13.5,
      lineHeight: 19,
    },
    serviceGroupCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    serviceGroupList: {
      gap: 5,
    },
    serviceLoadMoreButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    serviceLoadMoreText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    serviceGroupPickerItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    serviceGroupPickerMain: {
      flex: 1,
      gap: 1,
    },
    serviceGroupPickerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    serviceGroupPickerMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    activeGroupBar: {
      gap: 6,
    },
    activeGroupBackLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      minHeight: 34,
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    activeGroupBackLinkText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    servicePickerBlock: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 6,
    },
    servicePickerItemSelected: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    servicePickerItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    servicePickerMain: {
      flex: 1,
      gap: 1,
    },
    servicePickerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    servicePickerMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    servicePickerCheck: {
      width: 20,
      height: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    servicePickerCheckActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.info,
    },
    serviceInlineInputWrap: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 7,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    serviceQtySubtotal: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    serviceQtyHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10,
      lineHeight: 14,
    },
    serviceQtyErrorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    stepperButton: {
      width: 28,
      height: 28,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperButtonText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    metricInput: {
      minWidth: 58,
      maxWidth: 72,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textAlign: "center",
      paddingHorizontal: 6,
      paddingVertical: 5,
    },
    metricInputInvalid: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.mode === "dark" ? "#4a2730" : "#fff1f4",
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      minHeight: isTablet ? 48 : 44,
      paddingHorizontal: 13,
      paddingVertical: isTablet ? 11 : 10,
    },
    inputInvalid: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.mode === "dark" ? "#4a2730" : "#fff1f4",
    },
    notesInput: {
      minHeight: isTablet ? 84 : 72,
      textAlignVertical: "top",
    },
    summaryPanel: {
      gap: 6,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    summarySectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    summarySectionMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    summaryTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    reviewCustomerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    reviewCustomerMain: {
      flex: 1,
      gap: 1,
    },
    reviewCustomerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 17,
    },
    reviewCustomerPhone: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    reviewCustomerMethod: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    summaryItemList: {
      gap: 5,
    },
    summaryItemCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    summaryItemTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    summaryItemName: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 17,
    },
    summaryItemSubtotal: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    summaryItemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewToggleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingVertical: 2,
    },
    reviewToggleMain: {
      flex: 1,
      gap: 1,
    },
    reviewToggleHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewToggleRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    reviewToggleValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11.5,
    },
    reviewPromoHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    reviewPromoHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    reviewPromoHeaderValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11.5,
    },
    reviewPromoRefresh: {
      width: 28,
      height: 28,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    reviewPromoUtilityRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    reviewPromoBlock: {
      gap: 5,
    },
    reviewPromoEmpty: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewPromoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    reviewPromoRowMain: {
      flex: 1,
      gap: 1,
    },
    reviewPromoName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    reviewPromoMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10,
      lineHeight: 13,
    },
    reviewPromoValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    reviewPromoChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingRight: 2,
    },
    reviewPromoChipScroller: {
      marginHorizontal: -1,
    },
    reviewPromoChip: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    reviewPromoChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    reviewPromoChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewPromoChipTextActive: {
      color: theme.colors.info,
    },
    reviewPromoHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewAdjustmentsGrid: {
      flexDirection: "row",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: 8,
    },
    reviewAmountField: {
      flexGrow: 1,
      flexBasis: isTablet ? 0 : 150,
      gap: 4,
    },
    reviewAmountLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 14,
    },
    reviewAmountInput: {
      minHeight: 42,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
    },
    reviewAmountHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    reviewFieldError: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    reviewNotesInput: {
      minHeight: 54,
      paddingHorizontal: 10,
      paddingVertical: 8,
      textAlignVertical: "top",
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    summaryText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    summaryTextMuted: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 2,
    },
    summaryTotal: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    summaryTotalValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 14,
    },
    summaryTotalPanel: {
      backgroundColor: theme.mode === "dark" ? "#14314a" : "#eef7ff",
      borderColor: theme.colors.borderStrong,
    },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: contentHorizontal,
      paddingTop: theme.spacing.xs,
      paddingBottom: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
      gap: theme.spacing.xs,
      shadowColor: "#000",
      shadowOpacity: theme.mode === "dark" ? 0.35 : 0.08,
      shadowOffset: { width: 0, height: -3 },
      shadowRadius: 8,
      elevation: 6,
    },
    footerReview: {
      borderTopColor: theme.colors.borderStrong,
      shadowOpacity: theme.mode === "dark" ? 0.38 : 0.1,
      elevation: 7,
    },
    footerMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    footerMetaLeft: {
      flex: 1,
      gap: 1,
    },
    footerMetaText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 13.5 : 13,
    },
    footerMetaHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    footerMetaValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    footerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    footerActionsReview: {
      gap: theme.spacing.sm,
    },
    footerActionItem: {
      flex: 1,
    },
    pressed: {
      opacity: 0.78,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    successText: {
      flex: 1,
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
