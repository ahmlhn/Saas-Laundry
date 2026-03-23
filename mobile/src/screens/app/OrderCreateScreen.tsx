import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import type { RouteProp } from "@react-navigation/native";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { readCustomerDeviceCache, writeCustomerDeviceCache } from "../../features/customers/customerDeviceCache";
import { formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { createOrder, getOrderDetail, listOrders, updateOrder } from "../../features/orders/orderApi";
import { listPromotionSections } from "../../features/promotions/promoApi";
import { listServices } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { Customer } from "../../types/customer";
import type { OrderDetail, OrderSummary } from "../../types/order";
import type { Promotion, PromotionSections, PromotionVoucher } from "../../types/promotion";
import type { ServiceCatalogItem } from "../../types/service";

type Step = "customer" | "services" | "review" | "payment";
type Direction = -1 | 1;
type ReviewPanelKey = "perfume" | "promo" | "discount" | "notes";
type ReviewFocusableInputKey = "voucher" | "shippingFee" | "discount" | "notes";
type InputVisibilityMode = "visible" | "comfort";
type ScheduleField = "pickup";
type EditStartStep = "customer" | "services" | "review";

const STEP_ORDER: Step[] = ["customer", "services", "review"];
const CUSTOMER_LIMIT = 40;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 260;
const CUSTOMER_PROGRESSIVE_DELAY_MS = 70;
const SERVICE_RENDER_BATCH = 40;
const MAX_MONEY_INPUT_DIGITS = 9;
const MAX_DISCOUNT_PERCENT = 100;
const QUICK_ACTION_ALERT_AUTO_HIDE_MS = 4000;
const VOUCHER_PROMO_SELECTION_KEY = "__voucher_option__";
const SCHEDULE_DAY_OPTION_COUNT = 14;
const currencyFormatter = new Intl.NumberFormat("id-ID");
let customerListClientCache: Customer[] = [];
let customerListAutoLoadedOnce = false;

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function resolveServiceIcon(
  iconName: string | null | undefined,
  fallback: keyof typeof Ionicons.glyphMap = "shirt-outline",
): keyof typeof Ionicons.glyphMap {
  if (iconName && iconName in Ionicons.glyphMap) {
    return iconName as keyof typeof Ionicons.glyphMap;
  }

  return fallback;
}

function isPerfumeServiceType(serviceType: string | null | undefined): boolean {
  return String(serviceType ?? "").trim().toLowerCase() === "perfume";
}

function findMatchingPerfumeServiceId(
  perfumeServices: ServiceCatalogItem[],
  perfumeServiceId: string | null | undefined,
  perfumeServiceName: string | null | undefined,
): string | null {
  const normalizedId = typeof perfumeServiceId === "string" && perfumeServiceId.trim() !== "" ? perfumeServiceId.trim() : null;
  if (normalizedId && perfumeServices.some((service) => service.id === normalizedId)) {
    return normalizedId;
  }

  const normalizedName = typeof perfumeServiceName === "string" ? perfumeServiceName.trim().toLowerCase() : "";
  if (!normalizedName) {
    return null;
  }

  const matchedByName = perfumeServices.find((service) => service.name.trim().toLowerCase() === normalizedName);
  return matchedByName?.id ?? null;
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

function normalizeDiscountPercentInput(raw: string): string {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  const withoutLeadingZeros = digitsOnly.replace(/^0+(?=\d)/, "");
  if (!withoutLeadingZeros) {
    return "";
  }

  const parsed = Number.parseInt(withoutLeadingZeros.slice(0, 3), 10);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return `${Math.min(Math.max(parsed, 0), MAX_DISCOUNT_PERCENT)}`;
}

function parseDiscountPercentInput(raw: string): number {
  const normalized = normalizeDiscountPercentInput(raw);
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(Math.max(parsed, 0), MAX_DISCOUNT_PERCENT);
}

type PromoSource = "automatic" | "selection" | "voucher";
type ManualDiscountType = "amount" | "percent";
type PaymentFlowType = "later" | "now";

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

interface CustomerListEntry {
  customer: Customer;
  profile: ReturnType<typeof parseCustomerProfileMeta>;
  address: string;
}

interface CustomerPackageSummary {
  activeCount: number;
  remainingQuotaLabel: string;
}

interface QuickActionDraftSnapshot {
  step: Step;
  serviceKeyword: string;
  showServiceSearch: boolean;
  activeServiceGroupKey: string | null;
  selectedServiceIds: string[];
  selectedPerfumeServiceId: string | null;
  metrics: Record<string, string>;
  selectedPromoId: string | null;
  promoVoucherCodeInput: string;
  selectedCustomerId: string | null;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  requiresPickup: boolean;
  requiresDelivery: boolean;
  isPickupDelivery?: boolean;
  pickupScheduleInput: string;
  deliveryScheduleInput: string;
  pickupAddressDraft: string;
  deliveryAddressDraft: string;
  shippingFeeInput: string;
  discountInput: string;
  manualDiscountType?: ManualDiscountType;
  paymentFlowType?: PaymentFlowType;
  orderNotes: string;
  showReviewPromoPanel: boolean;
  showReviewPerfumePanel: boolean;
  showReviewDiscountPanel: boolean;
  showReviewNotesPanel: boolean;
}

let quickActionDraftCache: QuickActionDraftSnapshot | null = null;

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

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveCustomerPackageSummary(customer: Customer | null): CustomerPackageSummary | null {
  if (!customer) {
    return null;
  }

  const record = customer as unknown as Record<string, unknown>;

  const nestedCandidates = [
    record.package_summary,
    record.packageSummary,
    record.customer_package_summary,
    record.customerPackageSummary,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const source = candidate as Record<string, unknown>;
    const activeCount =
      toNonNegativeInt(source.active_count) ??
      toNonNegativeInt(source.activeCount) ??
      toNonNegativeInt(source.package_active_count) ??
      toNonNegativeInt(source.packageActiveCount) ??
      toNonNegativeInt(source.packages_active) ??
      toNonNegativeInt(source.packagesActive);

    const remainingQuotaLabel =
      toText(source.remaining_quota_label) ||
      toText(source.remainingQuotaLabel) ||
      toText(source.remaining_quota) ||
      toText(source.remainingQuota) ||
      toText(source.quota_remaining) ||
      toText(source.quotaRemaining);

    if ((activeCount ?? 0) > 0 || remainingQuotaLabel !== "") {
      return {
        activeCount: activeCount ?? 0,
        remainingQuotaLabel: remainingQuotaLabel || "-",
      };
    }
  }

  const flatActiveCount =
    toNonNegativeInt(record.package_active_count) ??
    toNonNegativeInt(record.packageActiveCount) ??
    toNonNegativeInt(record.packages_active) ??
    toNonNegativeInt(record.packagesActive);

  const flatRemainingQuotaLabel =
    toText(record.package_remaining_quota_label) ||
    toText(record.packageRemainingQuotaLabel) ||
    toText(record.package_remaining_quota) ||
    toText(record.packageRemainingQuota);

  if ((flatActiveCount ?? 0) > 0 || flatRemainingQuotaLabel !== "") {
    return {
      activeCount: flatActiveCount ?? 0,
      remainingQuotaLabel: flatRemainingQuotaLabel || "-",
    };
  }

  return null;
}

function readOrderMetaText(source: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!source) {
    return "";
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function formatScheduleDisplayValue(dateToken: string): string {
  const [yearRaw, monthRaw, dayRaw] = dateToken.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateToken;
  }

  const date = new Date(year, month - 1, day);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(date);
  const normalizedDay = String(day).padStart(2, "0");
  const normalizedMonth = String(month).padStart(2, "0");

  return `${weekday}, ${normalizedDay}-${normalizedMonth}-${year}`;
}

function buildDateToken(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getStepDisplayLabel(step: Step): string {
  if (step === "customer") {
    return "Pelanggan";
  }

  if (step === "services") {
    return "Layanan";
  }

  if (step === "review") {
    return "Review";
  }

  return "Pembayaran";
}

function getStepDisplayIcon(step: Step): keyof typeof Ionicons.glyphMap {
  if (step === "customer") {
    return "person-outline";
  }

  if (step === "services") {
    return "shirt-outline";
  }

  if (step === "review") {
    return "receipt-outline";
  }

  return "wallet-outline";
}

function getRoleSummaryLabel(roles: string[]): string {
  const uniqueRoles = Array.from(new Set(roles));
  const labels = uniqueRoles
    .map((role) => {
      if (role === "owner") {
        return "Owner";
      }

      if (role === "admin") {
        return "Admin";
      }

      if (role === "cashier") {
        return "Kasir";
      }

      if (role === "worker") {
        return "Pekerja";
      }

      if (role === "courier") {
        return "Kurir";
      }

      return role.charAt(0).toUpperCase() + role.slice(1);
    })
    .filter((label) => label !== "");

  return labels.length > 0 ? labels.join(" / ") : "Tanpa role";
}

function parseScheduleSelection(raw: string): { dateToken: string } | null {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return {
    dateToken: `${year}-${month}-${day}`,
  };
}

export function OrderCreateScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);

  const navigation = useNavigation<NativeStackNavigationProp<AppRootStackParamList, "OrderCreate">>();
  const route = useRoute<RouteProp<AppRootStackParamList, "OrderCreate">>();
  const isFocused = useIsFocused();
  const { session, selectedOutlet, refreshSession } = useSession();
  const tenantId = session?.user.tenant_id ?? null;

  const roles = session?.roles ?? [];
  const canCreateOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [step, setStep] = useState<Step>("customer");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderReference, setEditingOrderReference] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [perfumeServices, setPerfumeServices] = useState<ServiceCatalogItem[]>([]);
  const [serviceGroupNamesById, setServiceGroupNamesById] = useState<Record<string, string>>({});
  const [serviceGroupIconsById, setServiceGroupIconsById] = useState<Record<string, string | null>>({});
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceKeyword, setServiceKeyword] = useState("");
  const [showServiceSearch, setShowServiceSearch] = useState(false);
  const [activeServiceGroupKey, setActiveServiceGroupKey] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedPerfumeServiceId, setSelectedPerfumeServiceId] = useState<string | null>(null);
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
  const [requiresPickup, setRequiresPickup] = useState(false);
  const [requiresDelivery, setRequiresDelivery] = useState(false);
  const [pickupScheduleInput, setPickupScheduleInput] = useState("");
  const [deliveryScheduleInput, setDeliveryScheduleInput] = useState("");
  const [pickupAddressDraft, setPickupAddressDraft] = useState("");
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState("");
  const [schedulePickerField, setSchedulePickerField] = useState<ScheduleField | null>(null);
  const [schedulePickerDateToken, setSchedulePickerDateToken] = useState("");

  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [manualDiscountType, setManualDiscountType] = useState<ManualDiscountType>("amount");
  const [paymentFlowType, setPaymentFlowType] = useState<PaymentFlowType>("later");
  const [orderNotes, setOrderNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);
  const [createFormFooterDockHeight, setCreateFormFooterDockHeight] = useState(0);
  const [focusedMetricServiceId, setFocusedMetricServiceId] = useState<string | null>(null);
  const [highlightedServiceId, setHighlightedServiceId] = useState<string | null>(null);
  const [pendingSearchRevealServiceId, setPendingSearchRevealServiceId] = useState<string | null>(null);
  const [pendingSearchFocusServiceId, setPendingSearchFocusServiceId] = useState<string | null>(null);
  const [focusedReviewInputKey, setFocusedReviewInputKey] = useState<ReviewFocusableInputKey | null>(null);
  const [visibleServiceLimit, setVisibleServiceLimit] = useState(SERVICE_RENDER_BATCH);
  const [showServiceItemValidation, setShowServiceItemValidation] = useState(false);
  const [showReviewPerfumePanel, setShowReviewPerfumePanel] = useState(false);
  const [showReviewPromoPanel, setShowReviewPromoPanel] = useState(false);
  const [showReviewDiscountPanel, setShowReviewDiscountPanel] = useState(false);
  const [showReviewNotesPanel, setShowReviewNotesPanel] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(() => quickActionDraftCache !== null);
  const [exitDraftModalVisible, setExitDraftModalVisible] = useState(false);
  const customerRequestSeqRef = useRef(0);
  const customerCacheTenantRef = useRef<string | null>(null);
  const contentScrollRef = useRef<ScrollView | null>(null);
  const serviceInputRefs = useRef<Record<string, TextInput | null>>({});
  const serviceItemRefs = useRef<Record<string, View | null>>({});
  const serviceSearchInputRef = useRef<TextInput | null>(null);
  const pendingServiceSearchFocusRef = useRef(false);
  const metricVisibilityRequestSeqRef = useRef(0);
  const reviewInputRefs = useRef<Record<ReviewFocusableInputKey, TextInput | null>>({
    voucher: null,
    shippingFee: null,
    discount: null,
    notes: null,
  });
  const selectedPerfumeServiceIdRef = useRef<string | null>(null);
  const scrollYRef = useRef(0);
  const reviewPanelOffsetsRef = useRef<Record<ReviewPanelKey, number | null>>({
    perfume: null,
    promo: null,
    discount: null,
    notes: null,
  });
  const pendingReviewFocusPanelRef = useRef<ReviewPanelKey | null>(null);

  useEffect(() => {
    selectedPerfumeServiceIdRef.current = selectedPerfumeServiceId;
  }, [selectedPerfumeServiceId]);

  useEffect(() => {
    if (customerCacheTenantRef.current === tenantId) {
      return;
    }

    customerCacheTenantRef.current = tenantId;
    customerRequestSeqRef.current += 1;
    customerListClientCache = [];
    customerListAutoLoadedOnce = false;
    setCustomers([]);
    setLoadingCustomers(false);
    setLoadingMoreCustomers(false);
  }, [tenantId]);

  useEffect(() => {
    if (!selectedOutlet || !canCreateOrder) {
      setServices([]);
      setPerfumeServices([]);
      setServiceGroupNamesById({});
      setServiceGroupIconsById({});
      setLoadingServices(false);
      return;
    }

    void loadServices(true);
  }, [selectedOutlet?.id, canCreateOrder]);

  useEffect(() => {
    if (!isFocused || !selectedOutlet || !canCreateOrder) {
      return;
    }

    void loadServices(true);
  }, [isFocused, selectedOutlet?.id, canCreateOrder]);

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
    if (!isFocused || !canCreateOrder || showCreateForm || actionMessage || route.params?.editOrderId || (!loadingServices && services.length === 0)) {
      return;
    }

    openCreateFlow();
  }, [isFocused, canCreateOrder, showCreateForm, actionMessage, route.params?.editOrderId, loadingServices, services.length]);

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
    const editOrderId = route.params?.editOrderId;
    const editStartStep = route.params?.editStartStep;
    if (!editOrderId || !canCreateOrder || loadingServices) {
      return;
    }

    let active = true;

    void openEditFlow(editOrderId, editStartStep === "customer" || editStartStep === "services" || editStartStep === "review" ? editStartStep : "review").finally(() => {
      if (active) {
        navigation.setParams({
          editOrderId: undefined,
          editStartStep: undefined,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [route.params?.editOrderId, route.params?.editStartStep, canCreateOrder, loadingServices, navigation, selectedOutlet?.id]);

  useEffect(() => {
    if (!actionMessage && !errorMessage) {
      return;
    }

    if (showCreateForm) {
      return;
    }

    contentScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [actionMessage, errorMessage, showCreateForm]);

  useEffect(() => {
    if (!showCreateForm || (!actionMessage && !errorMessage)) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setActionMessage(null);
      setErrorMessage(null);
    }, QUICK_ACTION_ALERT_AUTO_HIDE_MS);

    return () => clearTimeout(timeoutId);
  }, [actionMessage, errorMessage, showCreateForm]);

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
        hydrateDeviceCache: true,
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
      const [serviceItems, serviceGroups, perfumeItems] = await Promise.all([
        listServices({
          outletId: selectedOutlet.id,
          active: true,
          serviceType: ["regular", "package", "item"],
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
        listServices({
          outletId: selectedOutlet.id,
          active: true,
          serviceType: ["perfume"],
          isGroup: false,
          forceRefresh,
        }),
      ]);

      const groupNameMap = serviceGroups.reduce<Record<string, string>>((result, item) => {
        result[item.id] = item.name;
        return result;
      }, {});
      const groupIconMap = serviceGroups.reduce<Record<string, string | null>>((result, item) => {
        result[item.id] = item.image_icon ?? null;
        return result;
      }, {});

      setServices(serviceItems.filter((item) => item.show_in_cashier !== false));
      setPerfumeServices(perfumeItems.filter((item) => item.show_in_cashier !== false));
      setServiceGroupNamesById(groupNameMap);
      setServiceGroupIconsById(groupIconMap);
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
      hydrateDeviceCache?: boolean;
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
      const canHydrateDeviceCache =
        fetchAll &&
        keyword === "" &&
        options?.hydrateDeviceCache !== false &&
        typeof tenantId === "string" &&
        tenantId.length > 0 &&
        customerListClientCache.length === 0;

      if (canHydrateDeviceCache) {
        const cachedCustomers = await readCustomerDeviceCache(tenantId);
        if (requestSeq !== customerRequestSeqRef.current) {
          return;
        }

        if (cachedCustomers && cachedCustomers.length > 0) {
          applyCustomerState(cachedCustomers);
          setLoadingCustomers(false);
          setLoadingMoreCustomers(true);
        }
      }

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
        if (keyword === "" && typeof tenantId === "string" && tenantId.length > 0) {
          void writeCustomerDeviceCache(tenantId, data);
        }
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
    pendingReviewFocusPanelRef.current = null;
    reviewPanelOffsetsRef.current = {
      perfume: null,
      promo: null,
      discount: null,
      notes: null,
    };
    setStep("customer");
    setServiceKeyword("");
    setShowServiceSearch(false);
    setActiveServiceGroupKey(null);
    setSelectedServiceIds([]);
    setSelectedPerfumeServiceId(null);
    setSelectedPromoId(null);
    setPromoVoucherCodeInput("");
    setPromoErrorMessage(null);
    setShowServiceItemValidation(false);
    setShowReviewPerfumePanel(false);
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
    setRequiresPickup(false);
    setRequiresDelivery(false);
    setSchedulePickerField(null);
    setPickupScheduleInput("");
    setDeliveryScheduleInput("");
    setPickupAddressDraft("");
    setDeliveryAddressDraft("");
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setLoadingCustomers(false);
    setLoadingMoreCustomers(false);
    setFocusedMetricServiceId(null);
    setFocusedReviewInputKey(null);
    setVisibleServiceLimit(SERVICE_RENDER_BATCH);
    setShippingFeeInput("");
    setDiscountInput("");
    setManualDiscountType("amount");
    setPaymentFlowType("later");
    setOrderNotes("");
  }

  function applyDraftSnapshot(draft: QuickActionDraftSnapshot): void {
    customerRequestSeqRef.current += 1;
    pendingReviewFocusPanelRef.current = null;
    const draftActiveReviewPanel: ReviewPanelKey | null = draft.showReviewPerfumePanel
      ? "perfume"
      : draft.showReviewPromoPanel
        ? "promo"
        : draft.showReviewDiscountPanel
          ? "discount"
          : draft.showReviewNotesPanel
            ? "notes"
            : null;
    setStep(draft.step === "payment" ? "review" : draft.step);
    setServiceKeyword(draft.serviceKeyword);
    setShowServiceSearch(draft.showServiceSearch);
    setActiveServiceGroupKey(draft.activeServiceGroupKey);
    setSelectedServiceIds([...draft.selectedServiceIds]);
    setSelectedPerfumeServiceId(draft.selectedPerfumeServiceId);
    setSelectedPromoId(draft.selectedPromoId);
    setPromoVoucherCodeInput(draft.promoVoucherCodeInput);
    setPromoErrorMessage(null);
    setShowServiceItemValidation(false);
    setShowReviewPerfumePanel(draftActiveReviewPanel === "perfume");
    setShowReviewPromoPanel(draftActiveReviewPanel === "promo");
    setShowReviewDiscountPanel(draftActiveReviewPanel === "discount");
    setShowReviewNotesPanel(draftActiveReviewPanel === "notes");
    setMetrics({ ...draft.metrics });
    setCustomerKeyword("");
    setSelectedCustomerId(draft.selectedCustomerId);
    setPendingAutoSelectCustomerId(null);
    setCustomerName(draft.customerName);
    setCustomerPhone(draft.customerPhone);
    setCustomerNotes(draft.customerNotes);
    const draftRequiresPickup = typeof draft.requiresPickup === "boolean" ? draft.requiresPickup : Boolean(draft.isPickupDelivery);
    const draftRequiresDelivery = typeof draft.requiresDelivery === "boolean" ? draft.requiresDelivery : Boolean(draft.isPickupDelivery);
    setRequiresPickup(draftRequiresPickup);
    setRequiresDelivery(draftRequiresDelivery);
    setPickupScheduleInput(draft.pickupScheduleInput);
    setDeliveryScheduleInput("");
    setPickupAddressDraft(draft.pickupAddressDraft);
    setDeliveryAddressDraft(draft.deliveryAddressDraft);
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setLoadingCustomers(false);
    setLoadingMoreCustomers(false);
    setFocusedMetricServiceId(null);
    setFocusedReviewInputKey(null);
    setVisibleServiceLimit(SERVICE_RENDER_BATCH);
    setShippingFeeInput(draft.shippingFeeInput);
    setDiscountInput(draft.discountInput);
    setManualDiscountType(draft.manualDiscountType === "percent" ? "percent" : "amount");
    setPaymentFlowType(draft.paymentFlowType === "now" ? "now" : "later");
    setOrderNotes(draft.orderNotes);
  }

  function buildDraftSnapshot(): QuickActionDraftSnapshot {
    return {
      step,
      serviceKeyword,
      showServiceSearch,
      activeServiceGroupKey,
      selectedServiceIds: [...selectedServiceIds],
      selectedPerfumeServiceId,
      metrics: { ...metrics },
      selectedPromoId,
      promoVoucherCodeInput,
      selectedCustomerId,
      customerName,
      customerPhone,
      customerNotes,
      requiresPickup,
      requiresDelivery,
      pickupScheduleInput,
      deliveryScheduleInput,
      pickupAddressDraft,
      deliveryAddressDraft,
      shippingFeeInput,
      discountInput,
      manualDiscountType,
      paymentFlowType,
      orderNotes,
      showReviewPerfumePanel,
      showReviewPromoPanel,
      showReviewDiscountPanel,
      showReviewNotesPanel,
    };
  }

  function saveDraftSnapshot(): void {
    quickActionDraftCache = buildDraftSnapshot();
    setHasSavedDraft(true);
  }

  function clearSavedDraftSnapshot(): void {
    quickActionDraftCache = null;
    setHasSavedDraft(false);
  }

  function applyEditOrderSnapshot(order: OrderDetail, startStep: EditStartStep = "review"): void {
    const fallbackServices: ServiceCatalogItem[] = [];
    const fallbackPerfumeServices: ServiceCatalogItem[] = [];
    const knownServiceIds = new Set(services.map((item) => item.id));
    const knownPerfumeServiceIds = new Set(perfumeServices.map((item) => item.id));
    const nextSelectedServiceIds: string[] = [];
    let nextSelectedPerfumeServiceId: string | null = null;
    const nextMetrics: Record<string, string> = {};

    for (const item of order.items ?? []) {
      if (!item.service_id) {
        continue;
      }

      const resolvedServiceType = item.service?.service_type ?? null;
      const isPerfumeItem = isPerfumeServiceType(typeof resolvedServiceType === "string" ? resolvedServiceType : null);

      if (isPerfumeItem) {
        nextSelectedPerfumeServiceId = item.service_id;

        if (!knownPerfumeServiceIds.has(item.service_id)) {
          knownPerfumeServiceIds.add(item.service_id);
          fallbackPerfumeServices.push({
            id: item.service_id,
            tenant_id: order.tenant_id,
            name: item.service_name_snapshot,
            service_type: "perfume",
            parent_service_id: null,
            is_group: false,
            unit_type: item.unit_type_snapshot === "kg" ? "kg" : item.unit_type_snapshot === "meter" ? "meter" : "pcs",
            display_unit: item.unit_type_snapshot === "kg" ? "kg" : item.unit_type_snapshot === "meter" ? "meter" : "pcs",
            base_price_amount: item.unit_price_amount,
            duration_days: item.service?.duration_days ?? null,
            duration_hours: item.service?.duration_hours ?? 0,
            package_quota_value: null,
            package_quota_unit: null,
            package_valid_days: null,
            package_accumulation_mode: null,
            active: true,
            show_in_cashier: true,
            show_to_customer: true,
            sort_order: 9_999,
            image_icon: null,
            effective_price_amount: item.unit_price_amount,
            outlet_override: null,
            process_tags: [],
            process_summary: null,
            children: [],
          });
        }

        continue;
      }

      nextSelectedServiceIds.push(item.service_id);

      if (!knownServiceIds.has(item.service_id)) {
        knownServiceIds.add(item.service_id);
        fallbackServices.push({
          id: item.service_id,
          tenant_id: order.tenant_id,
          name: item.service_name_snapshot,
          service_type: "regular",
          parent_service_id: null,
          is_group: false,
          unit_type: item.unit_type_snapshot === "kg" ? "kg" : item.unit_type_snapshot === "meter" ? "meter" : "pcs",
          display_unit: item.unit_type_snapshot === "kg" ? "kg" : item.unit_type_snapshot === "meter" ? "meter" : "pcs",
          base_price_amount: item.unit_price_amount,
          duration_days: item.service?.duration_days ?? null,
          duration_hours: item.service?.duration_hours ?? 0,
          package_quota_value: null,
          package_quota_unit: null,
          package_valid_days: null,
          package_accumulation_mode: null,
          active: true,
          show_in_cashier: true,
          show_to_customer: true,
          sort_order: 9_999,
          image_icon: null,
          effective_price_amount: item.unit_price_amount,
          outlet_override: null,
          process_tags: [],
          process_summary: null,
          children: [],
        });
      }

      const rawMetric = item.unit_type_snapshot === "kg" ? item.weight_kg : item.qty;
      const parsedMetric = typeof rawMetric === "number" ? rawMetric : Number.parseFloat(`${rawMetric ?? ""}`.replace(",", "."));
      if (Number.isFinite(parsedMetric) && parsedMetric > 0) {
        nextMetrics[item.service_id] = formatMetricValue(parsedMetric, item.unit_type_snapshot);
      }
    }

    if (fallbackServices.length > 0) {
      setServices((previous) => [...previous, ...fallbackServices.filter((service) => !previous.some((current) => current.id === service.id))]);
    }
    if (fallbackPerfumeServices.length > 0) {
      setPerfumeServices((previous) => [...previous, ...fallbackPerfumeServices.filter((service) => !previous.some((current) => current.id === service.id))]);
    }

    const customerId = order.customer?.id ?? order.customer_id;
    const customerNote = order.customer?.notes?.trim() ?? "";
    if (order.customer) {
      const editableCustomer: Customer = {
        id: customerId,
        tenant_id: order.tenant_id,
        name: order.customer.name,
        phone_normalized: order.customer.phone_normalized,
        notes: customerNote || null,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };

      setCustomers((previous) => {
        const existingIndex = previous.findIndex((item) => item.id === editableCustomer.id);
        if (existingIndex === -1) {
          return [editableCustomer, ...previous];
        }

        const next = [...previous];
        next[existingIndex] = {
          ...next[existingIndex],
          ...editableCustomer,
        };
        return next;
      });
      customerListClientCache = customerListClientCache.some((item) => item.id === editableCustomer.id)
        ? customerListClientCache.map((item) => (item.id === editableCustomer.id ? { ...item, ...editableCustomer } : item))
        : [editableCustomer, ...customerListClientCache];
    }

    const fallbackAddress = order.customer ? parseCustomerProfileMeta(order.customer.notes ?? null).address.trim() : "";
    setPickupAddressDraft(readOrderMetaText(order.pickup ?? null, ["address_short", "address"]) || fallbackAddress);
    setDeliveryAddressDraft(readOrderMetaText(order.delivery ?? null, ["address_short", "address"]) || fallbackAddress);
    setPickupScheduleInput(readOrderMetaText(order.pickup ?? null, ["slot", "schedule_slot", "date"]));
    setDeliveryScheduleInput(readOrderMetaText(order.delivery ?? null, ["slot", "schedule_slot", "date"]));
    setEditingOrderId(order.id);
    setEditingOrderReference(order.order_code || order.invoice_no || order.id);
    setStep(startStep);
    setSelectedServiceIds(nextSelectedServiceIds);
    setSelectedPerfumeServiceId(nextSelectedPerfumeServiceId);
    setMetrics(nextMetrics);
    setSelectedPromoId(null);
    setPromoVoucherCodeInput("");
    setPromoErrorMessage(null);
    setShowServiceItemValidation(false);
    setShowReviewPerfumePanel(false);
    setShowReviewPromoPanel(false);
    setShowReviewDiscountPanel(false);
    setShowReviewNotesPanel(false);
    setCustomerKeyword("");
    setSelectedCustomerId(customerId);
    setPendingAutoSelectCustomerId(null);
    setCustomerName(order.customer?.name ?? "");
    setCustomerPhone(order.customer?.phone_normalized ?? "");
    setCustomerNotes(customerNote);
    const resolvedRequiresPickup = typeof order.requires_pickup === "boolean" ? order.requires_pickup : Boolean(order.is_pickup_delivery);
    const resolvedRequiresDelivery = typeof order.requires_delivery === "boolean" ? order.requires_delivery : Boolean(order.is_pickup_delivery);
    setRequiresPickup(resolvedRequiresPickup);
    setRequiresDelivery(resolvedRequiresDelivery);
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setFocusedMetricServiceId(null);
    setFocusedReviewInputKey(null);
    setVisibleServiceLimit(SERVICE_RENDER_BATCH);
    setShippingFeeInput(order.shipping_fee_amount && order.shipping_fee_amount > 0 ? normalizeMoneyInput(`${order.shipping_fee_amount}`) : "");
    setDiscountInput(order.discount_amount && order.discount_amount > 0 ? normalizeMoneyInput(`${order.discount_amount}`) : "");
    setManualDiscountType("amount");
    setPaymentFlowType("later");
    setOrderNotes(order.notes?.trim() ?? "");
  }

  function openCreateFlow(): void {
    setEditingOrderId(null);
    setEditingOrderReference(null);
    if (quickActionDraftCache) {
      applyDraftSnapshot(quickActionDraftCache);
    } else {
      resetDraft();
    }
    setShowCreateForm(true);
    setExitDraftModalVisible(false);
    setErrorMessage(null);
    setActionMessage(null);
  }

  async function openEditFlow(orderId: string, startStep: EditStartStep = "review"): Promise<void> {
    if (!selectedOutlet) {
      setErrorMessage("Pilih outlet terlebih dulu sebelum mengedit pesanan.");
      return;
    }

    setShowCreateForm(true);
    setExitDraftModalVisible(false);
    clearSavedDraftSnapshot();
    resetDraft();
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const order = await getOrderDetail(orderId);

      if (order.outlet_id !== selectedOutlet.id) {
        setShowCreateForm(false);
        setErrorMessage("Pesanan ini berasal dari outlet lain.");
        return;
      }

      applyEditOrderSnapshot(order, startStep);
    } catch (error) {
      setShowCreateForm(false);
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function closeCreateFlow(): void {
    setShowCreateForm(false);
    setExitDraftModalVisible(false);
    setEditingOrderId(null);
    setEditingOrderReference(null);
    resetDraft();
    setErrorMessage(null);
  }

  function dismissOrderCreate(): void {
    closeCreateFlow();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    resetToOrdersToday();
  }

  function resetToMainTabs(target?: AppRootStackParamList["MainTabs"]): void {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: "MainTabs",
          params: target,
        },
      ],
    });
  }

  function resetToOrdersToday(): void {
    resetToMainTabs({
      screen: "OrdersTab",
      params: {
        screen: "OrdersToday",
      },
    });
  }

  function resetToOrderDetail(orderId: string, returnToOrders = false): void {
    resetToMainTabs({
      screen: "OrdersTab",
      params: {
        screen: "OrderDetail",
        params: {
          orderId,
          returnToOrders,
        },
      },
    });
  }

  function requestExitCreateFlow(): void {
    if (!canPersistDraft) {
      dismissOrderCreate();
      return;
    }

    setExitDraftModalVisible(true);
  }

  function toggleCreateFlow(): void {
    if (showCreateForm) {
      closeCreateFlow();
      return;
    }

    openCreateFlow();
  }

  function openCreateCustomerForm(): void {
    if (hasDraftChanges) {
      saveDraftSnapshot();
    }

    resetToMainTabs({
      screen: "AccountTab",
      params: {
        screen: "CustomerForm",
        params: {
          mode: "create",
          returnToQuickAction: true,
        },
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
    setPickupAddressDraft(profile.address);
    setDeliveryAddressDraft(profile.address);
    setSelectedPerfumeServiceId(null);
    setShowReviewPerfumePanel(false);
    setCustomerKeyword("");
    setErrorMessage(null);
  }

  function handleReplaceSelectedCustomer(): void {
    setSelectedCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setSelectedPerfumeServiceId(null);
    setShowReviewPerfumePanel(false);
    setPickupScheduleInput("");
    setDeliveryScheduleInput("");
    setPickupAddressDraft("");
    setDeliveryAddressDraft("");
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setCustomerKeyword("");
    setErrorMessage(null);
  }

  function openSchedulePicker(): void {
    const parsed = parseScheduleSelection(pickupScheduleInput);
    const now = new Date();
    const fallbackDateToken = buildDateToken(now);

    setSchedulePickerField("pickup");
    setSchedulePickerDateToken(parsed?.dateToken ?? fallbackDateToken);
  }

  function closeSchedulePicker(): void {
    setSchedulePickerField(null);
  }

  function clearScheduleValue(): void {
    setPickupScheduleInput("");
  }

  function applySchedulePicker(): void {
    if (!schedulePickerField || !schedulePickerDateToken) {
      return;
    }

    const nextValue = formatScheduleDisplayValue(schedulePickerDateToken);
    setPickupScheduleInput(nextValue);

    setSchedulePickerField(null);
  }

  useEffect(() => {
    if (!schedulePickerField) {
      return;
    }

    if (schedulePickerField === "pickup" && !requiresPickup) {
      setSchedulePickerField(null);
    }
  }, [requiresPickup, schedulePickerField]);

  useEffect(() => {
    if (!requiresPickup || editingOrderId !== null || pickupScheduleInput.trim() !== "") {
      return;
    }

    setPickupScheduleInput(formatScheduleDisplayValue(buildDateToken(new Date())));
  }, [editingOrderId, pickupScheduleInput, requiresPickup]);

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
      setPickupAddressDraft(profile.address);
      setDeliveryAddressDraft(profile.address);
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

  function handleManualDiscountTypeChange(nextType: ManualDiscountType): void {
    if (nextType === manualDiscountType) {
      return;
    }

    setManualDiscountType(nextType);
    setDiscountInput((current) => {
      if (!current.trim()) {
        return "";
      }

      return nextType === "percent" ? normalizeDiscountPercentInput(current) : normalizeMoneyInput(current);
    });
  }

  function handleDiscountChange(value: string): void {
    setDiscountInput(manualDiscountType === "percent" ? normalizeDiscountPercentInput(value) : normalizeMoneyInput(value));
  }

  function handlePaymentFlowChange(next: PaymentFlowType): void {
    setPaymentFlowType(next);
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
  const hasCourierFlow = requiresPickup || requiresDelivery;
  const courierModeLabel = useMemo(() => {
    if (requiresPickup && requiresDelivery) {
      return "Jemput + Antar";
    }

    if (requiresPickup) {
      return "Jemput";
    }

    if (requiresDelivery) {
      return "Antar";
    }

    return "Datang Sendiri";
  }, [requiresDelivery, requiresPickup]);
  const resolvedPickupAddress = useMemo(() => {
    const fromDraft = pickupAddressDraft.trim();
    if (fromDraft) {
      return fromDraft;
    }

    return selectedCustomerProfile?.address?.trim() ?? "";
  }, [pickupAddressDraft, selectedCustomerProfile?.address]);
  const resolvedDeliveryAddress = useMemo(() => {
    const fromDraft = deliveryAddressDraft.trim();
    if (fromDraft) {
      return fromDraft;
    }

    return selectedCustomerProfile?.address?.trim() ?? "";
  }, [deliveryAddressDraft, selectedCustomerProfile?.address]);
  const pickupPayload = useMemo(() => {
    if (!requiresPickup) {
      return undefined;
    }

    const address = resolvedPickupAddress;
    const slot = pickupScheduleInput.trim();
    if (!address && !slot) {
      return undefined;
    }

    return {
      address: address || undefined,
      address_short: address || undefined,
      slot: slot || undefined,
    };
  }, [pickupScheduleInput, requiresPickup, resolvedPickupAddress]);
  const deliveryPayload = useMemo(() => {
    if (!requiresDelivery) {
      return undefined;
    }

    const address = resolvedDeliveryAddress;
    const slot = editingOrderId ? deliveryScheduleInput.trim() : "";
    if (!address && !slot) {
      return undefined;
    }

    return {
      address: address || undefined,
      address_short: address || undefined,
      ...(slot ? { slot } : {}),
    };
  }, [deliveryScheduleInput, editingOrderId, requiresDelivery, resolvedDeliveryAddress]);
  const customerPackageSummary = useMemo(() => resolveCustomerPackageSummary(selectedCustomer), [selectedCustomer]);

  useEffect(() => {
    if (!selectedOutlet || !showCreateForm || !selectedCustomer) {
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

        if (!editingOrderId && selectedPerfumeServiceId === null && filtered.length > 0) {
          try {
            const latestOrderDetail = await getOrderDetail(filtered[0].id);
            if (!active) {
              return;
            }

            const latestPerfumeItem = (latestOrderDetail.items ?? []).find((item) => isPerfumeServiceType(item.service?.service_type ?? null) && Boolean(item.service_id));
            if (latestPerfumeItem?.service_id && selectedPerfumeServiceIdRef.current === null) {
              setSelectedPerfumeServiceId(latestPerfumeItem.service_id);
            }
          } catch {
            // Ignore perfume history resolution failures to keep customer flow fast.
          }
        }
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
  }, [editingOrderId, selectedCustomer, selectedOutlet, showCreateForm]);

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
  const perfumeServiceById = useMemo(() => {
    const map = new Map<string, ServiceCatalogItem>();
    for (const item of perfumeServices) {
      map.set(item.id, item);
    }
    return map;
  }, [perfumeServices]);

  const selectedServiceIdSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds]);

  const groupedServices = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; imageIcon: string | null; items: ServiceCatalogItem[] }>();

    for (const service of services) {
      const groupKey = service.parent_service_id ?? "__ungrouped";
      const groupLabel = service.parent_service_id ? serviceGroupNamesById[service.parent_service_id] ?? "Tanpa Group" : "Tanpa Group";
      const groupImageIcon = service.parent_service_id ? serviceGroupIconsById[service.parent_service_id] ?? null : null;
      const current = buckets.get(groupKey);
      if (current) {
        if (!current.imageIcon && groupImageIcon) {
          current.imageIcon = groupImageIcon;
        }
        current.items.push(service);
      } else {
        buckets.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          imageIcon: groupImageIcon,
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
  }, [services, serviceGroupIconsById, serviceGroupNamesById]);

  const visibleServiceGroups = useMemo(() => {
    const keyword = serviceKeyword.trim().toLowerCase();
    if (!keyword) {
      return groupedServices;
    }

    return groupedServices.filter((group) =>
      group.label.toLowerCase().includes(keyword) || group.items.some((service) => service.name.toLowerCase().includes(keyword)),
    );
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

  const crossGroupServiceSearchResults = useMemo(() => {
    const keyword = serviceKeyword.trim().toLowerCase();
    if (!keyword || activeServiceGroup) {
      return [];
    }

    const results: Array<{
      service: ServiceCatalogItem;
      groupKey: string;
      groupLabel: string;
      groupIcon: string | null;
    }> = [];
    const seenServiceIds = new Set<string>();

    for (const group of groupedServices) {
      const groupMatches = group.label.toLowerCase().includes(keyword);
      const matchedServices = groupMatches ? group.items : group.items.filter((service) => service.name.toLowerCase().includes(keyword));

      for (const service of matchedServices) {
        if (seenServiceIds.has(service.id)) {
          continue;
        }

        seenServiceIds.add(service.id);
        results.push({
          service,
          groupKey: group.key,
          groupLabel: group.label,
          groupIcon: group.imageIcon,
        });
      }
    }

    return results;
  }, [activeServiceGroup, groupedServices, serviceKeyword]);

  useEffect(() => {
    if (!activeServiceGroup) {
      setVisibleServiceLimit(SERVICE_RENDER_BATCH);
      return;
    }

    let highestSelectedIndex = -1;
    let revealIndex = -1;
    for (let index = 0; index < activeServiceGroup.items.length; index += 1) {
      const service = activeServiceGroup.items[index];
      if (selectedServiceIdSet.has(service.id)) {
        highestSelectedIndex = index;
      }
      if (service.id === pendingSearchRevealServiceId) {
        revealIndex = index;
      }
    }

    setVisibleServiceLimit(Math.max(SERVICE_RENDER_BATCH, highestSelectedIndex + 1, revealIndex + 1));
  }, [activeServiceGroup, pendingSearchRevealServiceId, selectedServiceIdSet, serviceKeyword]);

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
    if (!pendingSearchRevealServiceId || !activeServiceGroup) {
      return;
    }

    const existsInActiveGroup = activeServiceGroup.items.some((service) => service.id === pendingSearchRevealServiceId);
    if (!existsInActiveGroup) {
      return;
    }

    const targetServiceId = pendingSearchRevealServiceId;
    const retryDelays = [40, 120, 220, 360];
    const timeoutIds = retryDelays.map((delay) =>
      setTimeout(() => {
        scrollServiceItemIntoView(targetServiceId);
      }, delay),
    );
    const cleanupId = setTimeout(() => {
      setPendingSearchRevealServiceId((current) => (current === targetServiceId ? null : current));
    }, 420);

    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      clearTimeout(cleanupId);
    };
  }, [activeServiceGroup, pendingSearchRevealServiceId, visibleServiceLimit]);

  useEffect(() => {
    if (!pendingSearchFocusServiceId || !activeServiceGroup) {
      return;
    }

    const existsInActiveGroup = activeServiceGroup.items.some((service) => service.id === pendingSearchFocusServiceId);
    if (!existsInActiveGroup) {
      return;
    }

    const targetServiceId = pendingSearchFocusServiceId;
    const timeoutIds = [120, 260].map((delay) =>
      setTimeout(() => {
        setFocusedMetricServiceId(targetServiceId);
        focusServiceMetricInput(targetServiceId, { focus: true });
      }, delay),
    );
    const cleanupId = setTimeout(() => {
      setPendingSearchFocusServiceId((current) => (current === targetServiceId ? null : current));
    }, 520);

    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      clearTimeout(cleanupId);
    };
  }, [activeServiceGroup, pendingSearchFocusServiceId, visibleServiceLimit]);

  useEffect(() => {
    if (!highlightedServiceId) {
      return;
    }

    const targetServiceId = highlightedServiceId;
    const timeoutId = setTimeout(() => {
      setHighlightedServiceId((current) => (current === targetServiceId ? null : current));
    }, 1800);

    return () => clearTimeout(timeoutId);
  }, [highlightedServiceId]);

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

  const isPickupBookingFlow = requiresPickup && editingOrderId === null;
  const selectedLines = useMemo(
    () => (isPickupBookingFlow ? [] : selectedServiceDrafts.filter((line) => line.hasValidMetric)),
    [isPickupBookingFlow, selectedServiceDrafts],
  );
  const selectedPerfumeService = useMemo(
    () => (isPickupBookingFlow || !selectedPerfumeServiceId ? null : perfumeServiceById.get(selectedPerfumeServiceId) ?? null),
    [isPickupBookingFlow, perfumeServiceById, selectedPerfumeServiceId],
  );
  const selectedPerfumeAmount = useMemo(
    () => Math.max(selectedPerfumeService?.effective_price_amount ?? 0, 0),
    [selectedPerfumeService],
  );
  const selectedReviewItemCount = useMemo(
    () => selectedLines.length + (selectedPerfumeService ? 1 : 0),
    [selectedLines.length, selectedPerfumeService],
  );

  const subtotal = useMemo(() => selectedLines.reduce((sum, line) => sum + line.subtotal, selectedPerfumeAmount), [selectedLines, selectedPerfumeAmount]);
  const promoVoucherCodeNormalized = promoVoucherCodeInput.trim().toUpperCase();

  const shippingFee = useMemo(() => {
    return parseMoneyInput(shippingFeeInput);
  }, [shippingFeeInput]);

  const manualDiscountPercent = useMemo(() => {
    return parseDiscountPercentInput(discountInput);
  }, [discountInput]);

  const discountAmount = useMemo(() => {
    if (manualDiscountType === "percent") {
      return Math.round((subtotal * manualDiscountPercent) / 100);
    }

    return parseMoneyInput(discountInput);
  }, [discountInput, manualDiscountPercent, manualDiscountType, subtotal]);

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
    const comparePromotionPriority = (a: PromotionDiscountDraft, b: PromotionDiscountDraft): number =>
      b.promo.priority - a.promo.priority || b.discountAmount - a.discountAmount || a.promo.name.localeCompare(b.promo.name, "id-ID");
    const selectedAutomatic = [...automatic].sort(comparePromotionPriority)[0] ?? null;

    const selection = promotionSections.selection
      .map((promo) => buildPromoDraft(promo, "selection"))
      .filter((draft): draft is PromotionDiscountDraft => draft !== null);

    const selectedSelection =
      selectedPromoId && selectedPromoId !== VOUCHER_PROMO_SELECTION_KEY ? selection.find((draft) => draft.promo.id === selectedPromoId) ?? null : null;

    const voucher = (() => {
      if (selectedPromoId !== VOUCHER_PROMO_SELECTION_KEY || !promoVoucherCodeNormalized) {
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

    const candidates: PromotionDiscountDraft[] = [];
    if (selectedAutomatic) {
      candidates.push(selectedAutomatic);
    }
    if (selectedSelection) {
      candidates.push(selectedSelection);
    }
    if (voucher) {
      candidates.push(voucher);
    }

    const applied = (() => {
      // Voucher diperlakukan sebagai promo manual: jika valid dan dipilih,
      // voucher diprioritaskan saat bentrok dengan promo eksklusif lain.
      if (voucher) {
        const nonVoucherCandidates = candidates.filter((item) => item.source !== "voucher");
        if (voucher.promo.stack_mode === "exclusive") {
          return [voucher];
        }

        const hasExclusiveNonVoucher = nonVoucherCandidates.some((item) => item.promo.stack_mode === "exclusive");
        if (hasExclusiveNonVoucher) {
          return [voucher];
        }

        return [...nonVoucherCandidates, voucher];
      }

      const exclusiveCandidates = candidates.filter((item) => item.promo.stack_mode === "exclusive");
      if (exclusiveCandidates.length > 0) {
        return [
          [...exclusiveCandidates].sort(comparePromotionPriority)[0],
        ];
      }

      return candidates;
    })();

    const hasVoucherTyped = selectedPromoId === VOUCHER_PROMO_SELECTION_KEY && promoVoucherCodeNormalized.length > 0;
    const voucherRejected = hasVoucherTyped && voucher === null;

    return {
      automatic,
      selectedAutomatic,
      selection,
      selectedSelection,
      voucher,
      applied,
      voucherRejected,
    };
  }, [promotionSections.automatic, promotionSections.selection, promotionSections.voucher, promoVoucherCodeNormalized, selectedLines, selectedOutlet, selectedPromoId, subtotal]);

  const automaticPromoDraftList = automaticPromoDrafts.automatic;
  const selectedAutomaticPromoDraft = automaticPromoDrafts.selectedAutomatic;
  const selectionPromoDrafts = automaticPromoDrafts.selection;
  const voucherPromoDraft = automaticPromoDrafts.voucher;
  const appliedPromoDrafts = automaticPromoDrafts.applied;
  const voucherCodeRejected = automaticPromoDrafts.voucherRejected;
  const appliedPromoIdSet = useMemo(() => new Set(appliedPromoDrafts.map((item) => item.promo.id)), [appliedPromoDrafts]);
  const selectedAutomaticPromoId = selectedAutomaticPromoDraft?.promo.id ?? null;
  const automaticPromoDraftById = useMemo(() => {
    const map = new Map<string, PromotionDiscountDraft>();
    automaticPromoDraftList.forEach((item) => {
      map.set(item.promo.id, item);
    });
    return map;
  }, [automaticPromoDraftList]);
  const automaticPromoList = useMemo(
    () =>
      promotionSections.automatic.map((promo) => {
        const draft = automaticPromoDraftById.get(promo.id) ?? null;
        return {
          promo,
          draft,
          eligible: draft !== null,
          applied: appliedPromoIdSet.has(promo.id),
          optionType: "automatic" as const,
          autoSelected: selectedAutomaticPromoId === promo.id,
        };
      }),
    [promotionSections.automatic, automaticPromoDraftById, appliedPromoIdSet, selectedAutomaticPromoId],
  );
  const selectionPromoDraftById = useMemo(() => {
    const map = new Map<string, PromotionDiscountDraft>();
    selectionPromoDrafts.forEach((item) => {
      map.set(item.promo.id, item);
    });
    return map;
  }, [selectionPromoDrafts]);
  const selectionPromoList = useMemo(
    () =>
      promotionSections.selection.map((promo) => {
        const draft = selectionPromoDraftById.get(promo.id) ?? null;
        return {
          promo,
          draft,
          eligible: draft !== null,
          applied: appliedPromoIdSet.has(promo.id),
          optionType: "selection" as const,
          autoSelected: false,
        };
      }),
    [promotionSections.selection, selectionPromoDraftById, appliedPromoIdSet],
  );
  const promoOptionList = useMemo(() => [...automaticPromoList, ...selectionPromoList], [automaticPromoList, selectionPromoList]);
  const hasAutomaticPromotions = promotionSections.automatic.length > 0;
  const hasVoucherPromotions = promotionSections.voucher.length > 0;
  const voucherOptionSelected = selectedPromoId === VOUCHER_PROMO_SELECTION_KEY;
  const selectablePromoCount = promoOptionList.length + (hasVoucherPromotions ? 1 : 0);
  const selectedPromoNotApplied = selectedPromoId !== null && selectedPromoId !== VOUCHER_PROMO_SELECTION_KEY && !appliedPromoIdSet.has(selectedPromoId);

  useEffect(() => {
    if (!selectedPromoId) {
      return;
    }

    if (selectedPromoId === VOUCHER_PROMO_SELECTION_KEY) {
      if (!hasVoucherPromotions) {
        setSelectedPromoId(null);
      }
      return;
    }

    const stillExists = promotionSections.selection.some((promo) => promo.id === selectedPromoId);
    if (!stillExists) {
      setSelectedPromoId(null);
    }
  }, [selectedPromoId, promotionSections.selection, hasVoucherPromotions]);

  const promoDiscountAmount = useMemo(() => appliedPromoDrafts.reduce((sum, item) => sum + item.discountAmount, 0), [appliedPromoDrafts]);
  const totalDiscountAmount = discountAmount + promoDiscountAmount;
  const manualDiscountSummaryLabel = manualDiscountType === "percent" ? `Diskon Manual (${manualDiscountPercent}%)` : "Diskon Manual";
  const effectiveShippingFee = hasCourierFlow ? shippingFee : 0;
  const discountLimitBaseAmount = subtotal + effectiveShippingFee;
  const total = useMemo(() => Math.max(discountLimitBaseAmount - totalDiscountAmount, 0), [discountLimitBaseAmount, totalDiscountAmount]);
  const discountExceedsLimit = totalDiscountAmount > discountLimitBaseAmount;
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
      setActiveReviewPanel("promo", { focus: false });
      return;
    }

    if (discountExceedsLimit) {
      setActiveReviewPanel("discount", { focus: false });
    }
  }, [step, voucherCodeRejected, promoErrorMessage, discountExceedsLimit]);

  const canCustomerNext = selectedCustomerId !== null;
  const canServicesNext = isPickupBookingFlow || selectedLines.length > 0;
  const requiresItemInputNow = !isPickupBookingFlow;
  const hasDraftChanges = useMemo(() => {
    if (selectedCustomerId !== null || selectedServiceIds.length > 0 || selectedPerfumeServiceId !== null || requiresPickup || requiresDelivery || selectedPromoId !== null) {
      return true;
    }

    if (Object.keys(metrics).length > 0) {
      return true;
    }

    if (promoVoucherCodeInput.trim() !== "") {
      return true;
    }

    if (shippingFeeInput.trim() !== "" || discountInput.trim() !== "") {
      return true;
    }

    if (paymentFlowType === "now") {
      return true;
    }

    return orderNotes.trim() !== "";
  }, [
    discountInput,
    metrics,
    orderNotes,
    paymentFlowType,
    promoVoucherCodeInput,
    requiresDelivery,
    requiresPickup,
    selectedCustomerId,
    selectedPerfumeServiceId,
    selectedPromoId,
    selectedServiceIds,
    shippingFeeInput,
  ]);
  const canPersistDraft = hasDraftChanges || hasSavedDraft;

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

  function ensureTextInputVisible(inputRef: TextInput | null, mode: InputVisibilityMode = "visible"): void {
    const scrollRef = contentScrollRef.current;
    if (!inputRef || !scrollRef) {
      return;
    }

    const inputNode = findNodeHandle(inputRef);
    const scrollResponder = scrollRef as unknown as {
      scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, additionalOffset?: number, preventNegativeScrollOffset?: boolean) => void;
    };
    if (mode === "visible" && typeof inputNode === "number" && typeof scrollResponder.scrollResponderScrollNativeHandleToKeyboard === "function") {
      scrollResponder.scrollResponderScrollNativeHandleToKeyboard(inputNode, theme.spacing.lg, true);
      return;
    }

    const fallbackKeyboardTop = height - (keyboardHeight > 0 ? keyboardHeight : Math.round(height * 0.42));
    const keyboardTop = keyboardTopY ?? fallbackKeyboardTop;
    const footerReserve = mode === "comfort" ? Math.max(createFormFooterDockHeight + theme.spacing.sm, theme.spacing.xl) : theme.spacing.md;
    const visibleBottom = keyboardTop - footerReserve;
    const visibleTop = insets.top + theme.spacing.lg;

    inputRef.measureInWindow((_x, y, _w, inputHeight) => {
      const inputCenter = y + inputHeight / 2;

      if (mode === "comfort") {
        const visibleHeight = visibleBottom - visibleTop;
        if (visibleHeight <= 0) {
          return;
        }

        const safeTop = visibleTop + visibleHeight * 0.25;
        const safeBottom = visibleBottom - visibleHeight * 0.3;

        let delta = 0;
        if (inputCenter < safeTop) {
          delta = inputCenter - safeTop;
        } else if (inputCenter > safeBottom) {
          delta = inputCenter - safeBottom;
        }

        if (Math.abs(delta) <= 8) {
          return;
        }

        const maxStep = Math.min(Math.max(visibleHeight * 0.38, 88), 168);
        const clampedDelta = Math.max(Math.min(delta, maxStep), -maxStep);
        const nextY = Math.max(scrollYRef.current + clampedDelta, 0);
        scrollRef.scrollTo({ y: nextY, animated: true });
        return;
      }

      const inputBottom = y + inputHeight;
      if (inputBottom <= visibleBottom) {
        return;
      }

      const delta = inputBottom - visibleBottom + theme.spacing.sm;
      const nextY = Math.max(scrollYRef.current + delta, 0);
      scrollRef.scrollTo({ y: nextY, animated: true });
    });
  }

  function ensureFocusedMetricVisible(serviceId: string): void {
    ensureTextInputVisible(serviceInputRefs.current[serviceId], "comfort");
  }

  function focusServiceMetricInput(serviceId: string, options?: { focus?: boolean }): void {
    const shouldFocus = options?.focus === true;
    const requestSeq = metricVisibilityRequestSeqRef.current + 1;
    metricVisibilityRequestSeqRef.current = requestSeq;

    if (shouldFocus) {
      serviceInputRefs.current[serviceId]?.focus();
    }

    if (keyboardHeight > 0) {
      const settleDelay = Platform.OS === "ios" ? 70 : 100;
      setTimeout(() => {
        if (metricVisibilityRequestSeqRef.current !== requestSeq) {
          return;
        }

        ensureFocusedMetricVisible(serviceId);
      }, settleDelay);
    }
  }

  function scrollServiceItemIntoView(serviceId: string): void {
    const scrollRef = contentScrollRef.current;
    const itemRef = serviceItemRefs.current[serviceId];
    if (!scrollRef || !itemRef) {
      return;
    }

    const targetTop = insets.top + 132;
    itemRef.measureInWindow((_x, y) => {
      const delta = y - targetTop;
      if (Math.abs(delta) <= 10) {
        return;
      }

      const nextY = Math.max(scrollYRef.current + delta, 0);
      scrollRef.scrollTo({ y: nextY, animated: true });
    });
  }

  function openServiceSearchResult(serviceId: string, groupKey: string): void {
    const targetGroup = groupedServices.find((group) => group.key === groupKey);
    if (!targetGroup) {
      return;
    }

    const serviceIndex = targetGroup.items.findIndex((service) => service.id === serviceId);
    setShowServiceItemValidation(false);
    setFocusedMetricServiceId(serviceId);
    setPendingSearchFocusServiceId(serviceId);
    if (!selectedServiceIdSet.has(serviceId)) {
      setSelectedServiceIds((previous) => (previous.includes(serviceId) ? previous : [...previous, serviceId]));
    }
    setActiveServiceGroupKey(groupKey);
    setPendingSearchRevealServiceId(serviceId);
    setHighlightedServiceId(serviceId);
    setShowServiceSearch(false);
    setServiceKeyword("");
    serviceSearchInputRef.current?.blur();
    if (serviceIndex >= 0) {
      setVisibleServiceLimit(Math.max(SERVICE_RENDER_BATCH, serviceIndex + 1));
    }
  }

  function focusReviewInput(inputKey: ReviewFocusableInputKey): void {
    setFocusedReviewInputKey(inputKey);
    pendingReviewFocusPanelRef.current = null;
    const retryDelays = [90, 210, 340];
    for (const delay of retryDelays) {
      setTimeout(() => ensureTextInputVisible(reviewInputRefs.current[inputKey], "comfort"), delay);
    }
  }

  function scrollToReviewPanel(panel: ReviewPanelKey): void {
    const scrollRef = contentScrollRef.current;
    const sectionOffset = reviewPanelOffsetsRef.current[panel];
    if (!scrollRef || sectionOffset === null) {
      return;
    }

    const targetY = Math.max(sectionOffset - theme.spacing.sm, 0);
    scrollRef.scrollTo({ y: targetY, animated: true });
    pendingReviewFocusPanelRef.current = null;
  }

  function requestReviewPanelFocus(panel: ReviewPanelKey): void {
    pendingReviewFocusPanelRef.current = panel;
    const retryDelays = [0, 90, 180];
    for (const delay of retryDelays) {
      setTimeout(() => {
        if (pendingReviewFocusPanelRef.current !== panel) {
          return;
        }
        scrollToReviewPanel(panel);
      }, delay);
    }
  }

  function setActiveReviewPanel(panel: ReviewPanelKey | null, options?: { focus?: boolean }): void {
    const activePanel: ReviewPanelKey | null = showReviewPerfumePanel ? "perfume" : showReviewPromoPanel ? "promo" : showReviewDiscountPanel ? "discount" : showReviewNotesPanel ? "notes" : null;
    if (panel === activePanel) {
      return;
    }

    setFocusedReviewInputKey(null);
    setShowReviewPerfumePanel(panel === "perfume");
    setShowReviewPromoPanel(panel === "promo");
    setShowReviewDiscountPanel(panel === "discount");
    setShowReviewNotesPanel(panel === "notes");
    if (panel && options?.focus !== false && !keyboardVisible) {
      requestReviewPanelFocus(panel);
    } else {
      pendingReviewFocusPanelRef.current = null;
    }
  }

  function toggleReviewPanel(panel: ReviewPanelKey): void {
    const isOpen = panel === "perfume" ? showReviewPerfumePanel : panel === "promo" ? showReviewPromoPanel : panel === "discount" ? showReviewDiscountPanel : showReviewNotesPanel;
    if (isOpen) {
      setActiveReviewPanel(null);
      return;
    }

    if (panel === "promo") {
      void loadPromotions(true);
    }

    setActiveReviewPanel(panel);
  }

  function handleReviewPanelLayout(panel: ReviewPanelKey, event: LayoutChangeEvent): void {
    reviewPanelOffsetsRef.current[panel] = event.nativeEvent.layout.y;
    if (pendingReviewFocusPanelRef.current === panel) {
      setTimeout(() => scrollToReviewPanel(panel), 0);
    }
  }

  useEffect(() => {
    if (!focusedMetricServiceId || keyboardHeight <= 0) {
      return;
    }

    const requestSeq = metricVisibilityRequestSeqRef.current + 1;
    metricVisibilityRequestSeqRef.current = requestSeq;
    const settleDelay = Platform.OS === "ios" ? 110 : 150;
    const timeoutId = setTimeout(() => {
      if (metricVisibilityRequestSeqRef.current !== requestSeq) {
        return;
      }

      ensureFocusedMetricVisible(focusedMetricServiceId);
    }, settleDelay);
    return () => clearTimeout(timeoutId);
  }, [focusedMetricServiceId, keyboardHeight, keyboardTopY, createFormFooterDockHeight]);

  useEffect(() => {
    if (focusedMetricServiceId !== null) {
      return;
    }

    metricVisibilityRequestSeqRef.current += 1;
  }, [focusedMetricServiceId]);

  useEffect(() => {
    if (!focusedReviewInputKey || step !== "review" || keyboardHeight <= 0) {
      return;
    }

    const timeoutId = setTimeout(() => ensureTextInputVisible(reviewInputRefs.current[focusedReviewInputKey], "comfort"), 90);
    return () => clearTimeout(timeoutId);
  }, [focusedReviewInputKey, step, keyboardHeight, keyboardTopY]);

  useEffect(() => {
    if (!showCreateForm || step !== "services" || !showServiceSearch || !pendingServiceSearchFocusRef.current) {
      return;
    }

    const focusSearchInput = () => {
      serviceSearchInputRef.current?.focus();
    };

    pendingServiceSearchFocusRef.current = false;
    const retryDelays = Platform.OS === "ios" ? [30, 110] : [60, 160];
    const animationFrameId = requestAnimationFrame(focusSearchInput);
    const timeoutIds = retryDelays.map((delay) => setTimeout(focusSearchInput, delay));

    return () => {
      cancelAnimationFrame(animationFrameId);
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [showCreateForm, showServiceSearch, step]);

  async function refreshServicesFromServer(): Promise<void> {
    if (loadingServices) {
      return;
    }

    setErrorMessage(null);
    await loadServices(true);
  }

  function openServiceSearch(): void {
    pendingServiceSearchFocusRef.current = true;
    setShowServiceSearch(true);
  }

  function closeServiceSearch(): void {
    pendingServiceSearchFocusRef.current = false;
    setShowServiceSearch(false);
    setServiceKeyword("");
    serviceSearchInputRef.current?.blur();
  }

  function goToReviewStep(): void {
    setShowServiceItemValidation(false);
    setActiveReviewPanel(null);
    setStep("review");
    setErrorMessage(null);
  }

  function goToPaymentStep(): void {
    setStep("payment");
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
      if (isPickupBookingFlow) {
        goToReviewStep();
      } else {
        setStep("services");
        setErrorMessage(null);
      }
      return;
    }

    if (step === "services") {
      if (isPickupBookingFlow) {
        goToReviewStep();
        return;
      }

      if (selectedServiceDrafts.length === 0) {
        setErrorMessage("Pilih minimal satu layanan terlebih dulu.");
        return;
      }

      if (!canServicesNext) {
        setErrorMessage("Isi qty/berat minimal satu layanan untuk diproses.");
        const firstInvalidServiceId = selectedServiceDrafts[0]?.service.id;
        if (firstInvalidServiceId) {
          setFocusedMetricServiceId(firstInvalidServiceId);
          focusServiceMetricInput(firstInvalidServiceId);
        }
        return;
      }

      goToReviewStep();
      return;
    }

    if (step === "review") {
      if (voucherCodeRejected || discountExceedsLimit) {
        setErrorMessage(null);
        return;
      }

      void submitOrder();
    }
  }

  function exitCreateFlow(): void {
    dismissOrderCreate();
  }

  function closeExitDraftModal(): void {
    setExitDraftModalVisible(false);
  }

  function handleSaveDraftAndExit(): void {
    if (!canPersistDraft) {
      closeExitDraftModal();
      exitCreateFlow();
      return;
    }

    if (hasDraftChanges) {
      saveDraftSnapshot();
    }

    setActionMessage("Draft pesanan tersimpan. Anda bisa lanjutkan kapan saja.");
    closeExitDraftModal();
    exitCreateFlow();
  }

  function handleDeleteDraftAndExit(): void {
    const hadAnyDraft = canPersistDraft;
    clearSavedDraftSnapshot();
    setActionMessage(hadAnyDraft ? "Draft pesanan dihapus." : "Keluar tanpa menyimpan draft.");
    closeExitDraftModal();
    exitCreateFlow();
  }

  function previousStep(): void {
    if (step === "customer") {
      requestExitCreateFlow();
      return;
    }

    if (step === "services") {
      setShowServiceItemValidation(false);
      setStep("customer");
      setErrorMessage(null);
      return;
    }

    if (step === "payment") {
      setStep("review");
      setErrorMessage(null);
      return;
    }

    setShowServiceItemValidation(false);
    setStep(isPickupBookingFlow ? "customer" : "services");
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

    if (isPickupBookingFlow && !pickupScheduleInput.trim()) {
      setErrorMessage("Jadwal jemput wajib diisi untuk pesanan jemput.");
      setStep("customer");
      return;
    }

    if (requiresItemInputNow && !canServicesNext) {
      if (selectedServiceDrafts.length === 0) {
        setErrorMessage("Pilih minimal satu layanan terlebih dulu.");
      } else {
        setErrorMessage("Isi qty/berat minimal satu layanan untuk diproses.");
        const firstInvalidServiceId = selectedServiceDrafts[0]?.service.id;
        if (firstInvalidServiceId) {
          setFocusedMetricServiceId(firstInvalidServiceId);
        }
      }
      setStep("services");
      return;
    }

    if (voucherCodeRejected) {
      setErrorMessage(null);
      setStep("review");
      setActiveReviewPanel("promo", { focus: false });
      return;
    }

    if (discountExceedsLimit) {
      setErrorMessage(null);
      setStep("review");
      setActiveReviewPanel("discount", { focus: false });
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const payload = {
        outletId: selectedOutlet.id,
        requiresPickup,
        requiresDelivery,
        isPickupDelivery: hasCourierFlow,
        pickup: pickupPayload,
        delivery: deliveryPayload,
        customerId: selectedCustomerId ?? undefined,
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          notes: customerNotes,
        },
        items: isPickupBookingFlow
          ? []
          : [
              ...selectedLines.map((line) => ({
                serviceId: line.service.id,
                qty: isKgUnit(line.service.unit_type) ? undefined : line.metricValue,
                weightKg: isKgUnit(line.service.unit_type) ? line.metricValue : undefined,
              })),
              ...(selectedPerfumeService
                ? [
                    {
                      serviceId: selectedPerfumeService.id,
                      qty: 1,
                      weightKg: undefined,
                    },
                  ]
                : []),
            ],
        shippingFeeAmount: effectiveShippingFee,
        discountAmount: totalDiscountAmount,
        notes: orderNotesWithPromo,
      };
      const savedOrder = editingOrderId ? await updateOrder(editingOrderId, payload) : await createOrder(payload);

      const savedTotalAmount = Math.max(savedOrder.total_amount ?? 0, 0);

      await refreshSession();
      setActionMessage(null);
      setShowCreateForm(false);
      setEditingOrderId(null);
      setEditingOrderReference(null);
      clearSavedDraftSnapshot();
      resetDraft();

      if (editingOrderId) {
        resetToOrderDetail(savedOrder.id);
        return;
      }

      if (isPickupBookingFlow) {
        resetToOrderDetail(savedOrder.id);
        return;
      }

      navigation.reset({
        index: 1,
        routes: [
          {
            name: "MainTabs",
            params: {
              screen: "OrdersTab",
              params: {
                screen: "OrderDetail",
                params: {
                  orderId: savedOrder.id,
                  returnToOrders: true,
                },
              },
            },
          },
          {
            name: "OrderPayment",
            params: {
              orderId: savedOrder.id,
              source: "create",
              flow: "payment",
              initialAmount: savedTotalAmount > 0 ? 0 : undefined,
            },
          },
        ],
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handlePrimaryAction(): void {
    if (step === "review" || step === "payment") {
      void submitOrder();
      return;
    }

    nextStep();
  }

  const primaryDisabled =
    step === "customer"
      ? !canCustomerNext
      : step === "services"
        ? requiresItemInputNow && selectedServiceDrafts.length === 0
        : step === "review"
          ? !canServicesNext || discountExceedsLimit || voucherCodeRejected
          : submitting || !canServicesNext || discountExceedsLimit || voucherCodeRejected;
  const primaryButtonBusy = submitting && (step === "review" || step === "payment");
  const primaryActionDisabled = primaryDisabled || primaryButtonBusy;
  const secondaryButtonTitle = step === "customer" ? "Keluar" : "Kembali";
  const secondaryButtonIconName: keyof typeof Ionicons.glyphMap = step === "customer" ? "close-outline" : "arrow-back-outline";
  const primaryButtonTitle =
    step === "review"
      ? editingOrderId
        ? "Simpan Perubahan"
        : isPickupBookingFlow
          ? "Simpan Pesanan Jemput"
          : "Simpan & Ke Pembayaran"
      : step === "payment"
        ? editingOrderId
          ? "Simpan Perubahan"
          : "Simpan & Ke Pembayaran"
        : "Lanjut";
  const primaryButtonIconName: keyof typeof Ionicons.glyphMap =
    step === "customer" || step === "services"
      ? "arrow-forward-outline"
      : editingOrderId
        ? "save-outline"
        : paymentFlowType === "now"
          ? "card-outline"
          : "checkmark-outline";
  const primaryDisabledHint = useMemo(() => {
    if (!primaryActionDisabled) {
      return "";
    }

    if (step === "customer") {
      return isPickupBookingFlow ? "Pilih konsumen dulu untuk lanjut ke review pesanan jemput." : "Pilih konsumen dulu untuk lanjut ke layanan.";
    }

    if (step === "services") {
      return "Pilih minimal satu layanan untuk lanjut ke ringkasan.";
    }

    if (step === "review") {
      if (voucherCodeRejected) {
        return "Perbaiki voucher dulu sebelum menyimpan pesanan.";
      }

      if (discountExceedsLimit) {
        return "Total potongan melebihi batas. Cek diskon manual atau promo.";
      }

      return "Lengkapi ringkasan dulu sebelum menyimpan pesanan.";
    }

    if (submitting) {
      return "Menyimpan pesanan...";
    }

    if (voucherCodeRejected) {
      return "Voucher belum valid. Kembali ke ringkasan untuk perbaiki voucher.";
    }

    if (discountExceedsLimit) {
      return "Total potongan melebihi batas. Cek diskon manual atau promo.";
    }

    if (editingOrderId) {
      return "Simpan perubahan pesanan dulu.";
    }

    return isPickupBookingFlow ? "Simpan pesanan jemput dulu." : "Simpan pesanan dulu untuk lanjut ke halaman pembayaran.";
  }, [discountExceedsLimit, editingOrderId, isPickupBookingFlow, primaryActionDisabled, primaryDisabled, step, submitting, voucherCodeRejected]);
  const startCreateTitle = hasSavedDraft ? "Lanjutkan Draft" : "Buat Pesanan Baru";
  const startCreateIconName: keyof typeof Ionicons.glyphMap = hasSavedDraft ? "document-text-outline" : "bag-add-outline";

  const currentStepIndex = step === "payment" ? STEP_ORDER.length - 1 : Math.max(STEP_ORDER.indexOf(step), 0);
  const createFormPanelMinHeight = viewportHeight > 0 ? Math.max(viewportHeight - (isCompactLandscape ? theme.spacing.md : theme.spacing.lg) - theme.spacing.sm, 0) : 0;
  const serviceSearchVisible = showServiceSearch || serviceKeyword.trim().length > 0;
  const keyboardVisible = keyboardHeight > 0;
  const scrollKeyboardDismissMode = step === "review" || step === "payment" ? "none" : "on-drag";
  const isEditingOrder = editingOrderId !== null;
  const currentStepLabel = getStepDisplayLabel(step);
  const currentStepIconName = getStepDisplayIcon(step);
  const roleSummaryLabel = getRoleSummaryLabel(roles);
  const quotaSummaryLabel = session?.quota.orders_remaining === null ? "Kuota fleksibel" : `${session?.quota.orders_remaining ?? 0} order tersisa`;
  const serviceAvailabilityLabel = loadingServices ? "Memuat layanan..." : `${groupedServices.length} grup layanan aktif`;
  const launchIntroSummary = hasSavedDraft
    ? "Draft pesanan masih tersimpan. Lanjutkan tanpa kehilangan item, promo, dan catatan sebelumnya."
    : "Quick Action ini dipakai untuk entry order operasional tercepat: pelanggan, layanan, lalu review total.";
  const launchHighlights = [
    {
      icon: "git-branch-outline" as const,
      label: "Alur",
      value: "3 langkah ringkas",
    },
    {
      icon: "grid-outline" as const,
      label: "Layanan",
      value: serviceAvailabilityLabel,
    },
    {
      icon: hasSavedDraft ? ("document-text-outline" as const) : ("speedometer-outline" as const),
      label: hasSavedDraft ? "Draft" : "Status",
      value: hasSavedDraft ? "Siap dilanjutkan" : quotaSummaryLabel,
    },
  ];
  const scheduleDateOptions = useMemo(() => {
    return Array.from({ length: SCHEDULE_DAY_OPTION_COUNT }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + index);
      const token = buildDateToken(date);
      const dayLabel = new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date);
      const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

      return {
        token,
        dayLabel,
        dateLabel,
      };
    });
  }, []);

  function handleViewportLayout(event: LayoutChangeEvent): void {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight !== viewportHeight) {
      setViewportHeight(nextHeight);
    }
  }

  function handleCreateFormFooterDockLayout(event: LayoutChangeEvent): void {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight !== createFormFooterDockHeight) {
      setCreateFormFooterDockHeight(nextHeight);
    }
  }

  const launchHeader = (
    <View style={styles.bodyHeader}>
      <Text style={styles.titleEyebrow}>{isEditingOrder ? "Mode edit pesanan" : "Transaksi baru"}</Text>
      <Text style={styles.title}>{isEditingOrder ? "Edit Pesanan" : "Tambah Pesanan Baru"}</Text>
      <Text style={styles.titleSubtitle}>{launchIntroSummary}</Text>
      <View style={styles.headerMetaRow}>
        {isEditingOrder && editingOrderReference ? (
          <View style={styles.headerMetaChip}>
            <Ionicons color={theme.colors.textMuted} name="document-text-outline" size={13} />
            <Text numberOfLines={1} style={styles.headerMetaChipText}>
              {editingOrderReference}
            </Text>
          </View>
        ) : null}
        <View style={styles.headerMetaChip}>
          <Ionicons color={theme.colors.textMuted} name="person-circle-outline" size={13} />
          <Text numberOfLines={1} style={styles.headerMetaChipText}>
            {roleSummaryLabel}
          </Text>
        </View>
        {hasSavedDraft ? (
          <View style={[styles.headerMetaChip, styles.headerMetaChipSuccess]}>
            <Ionicons color={theme.colors.success} name="save-outline" size={13} />
            <Text numberOfLines={1} style={styles.headerMetaChipSuccessText}>
              Draft tersedia
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const screenTopBar = (
    <View style={styles.screenTopBar}>
      <Pressable accessibilityRole="button" onPress={showCreateForm ? requestExitCreateFlow : dismissOrderCreate} style={({ pressed }) => [styles.screenTopBarButton, pressed ? styles.pressed : null]}>
        <Ionicons color={theme.colors.textPrimary} name="close-outline" size={20} />
      </Pressable>
      <View style={styles.screenTopBarTitleSlot}>
        {showCreateForm ? (
          <Text numberOfLines={1} style={styles.screenTopBarTitle}>
            {isEditingOrder ? "Edit Pesanan" : "Tambah Pesanan Baru"}
          </Text>
        ) : null}
      </View>
      <View style={showCreateForm ? styles.screenTopBarSideSlot : styles.screenTopBarMeta}>
        {!showCreateForm && hasSavedDraft ? (
          <View style={[styles.screenTopBarChip, styles.screenTopBarChipSuccess]}>
            <Ionicons color={theme.colors.success} name="save-outline" size={13} />
            <Text numberOfLines={1} style={[styles.screenTopBarChipText, styles.screenTopBarChipTextSuccess]}>
              Draft
            </Text>
          </View>
        ) : null}
        {!showCreateForm && !hasSavedDraft ? <View style={styles.screenTopBarSpacer} /> : null}
        {showCreateForm ? <View style={styles.screenTopBarSpacer} /> : null}
      </View>
    </View>
  );

  const messageBanners = (
    <>
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
    </>
  );

  return (
    <AppScreen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} onLayout={handleViewportLayout} style={styles.root}>
        {!showCreateForm ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode={scrollKeyboardDismissMode}
            keyboardShouldPersistTaps="always"
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
            ref={contentScrollRef}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            {messageBanners}
            <View style={styles.launchShell}>
              {screenTopBar}
              {launchHeader}
              <View style={styles.launchHighlightsGrid}>
                {launchHighlights.map((item) => (
                  <View key={item.label} style={styles.launchHighlightCard}>
                    <View style={styles.launchHighlightIconWrap}>
                      <Ionicons color={theme.colors.info} name={item.icon} size={15} />
                    </View>
                    <Text style={styles.launchHighlightLabel}>{item.label}</Text>
                    <Text style={styles.launchHighlightValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.actionList}>
                <AppButton
                  disabled={!canCreateOrder || loadingServices || services.length === 0}
                  leftElement={<Ionicons color={theme.colors.primaryContrast} name={startCreateIconName} size={18} />}
                  onPress={toggleCreateFlow}
                  title={startCreateTitle}
                />
                <AppButton
                  leftElement={<Ionicons color={theme.colors.info} name="person-add-outline" size={18} />}
                  onPress={() =>
                    resetToMainTabs({
                      screen: "AccountTab",
                      params: {
                        screen: "Customers",
                      },
                    })
                  }
                  title="Tambah Pelanggan"
                  variant="secondary"
                />
              </View>
              {!canCreateOrder ? <Text style={styles.infoText}>Role Anda tidak memiliki akses membuat order.</Text> : null}
              {!loadingServices && canCreateOrder && services.length === 0 ? <Text style={styles.infoText}>Belum ada layanan aktif untuk outlet ini.</Text> : null}
              {loadingServices ? <ActivityIndicator color={theme.colors.info} size="small" /> : null}
            </View>
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.contentCreateForm, styles.createFormViewport]}>
            <View style={[styles.createFormShell, createFormPanelMinHeight > 0 ? { minHeight: createFormPanelMinHeight } : null]}>
              <View style={styles.createFormHeaderDock}>
                {screenTopBar}
                <View style={styles.stepLegendRow}>
                  {STEP_ORDER.map((stepKey, index) => {
                    const active = index === currentStepIndex;
                    const done = index < currentStepIndex;

                    return (
                      <View key={stepKey} style={[styles.stepLegendChip, active ? styles.stepLegendChipActive : null, done ? styles.stepLegendChipDone : null]}>
                        <View style={[styles.stepLegendNumberWrap, active ? styles.stepLegendNumberWrapActive : null, done ? styles.stepLegendNumberWrapDone : null]}>
                          <Text style={[styles.stepLegendNumber, active ? styles.stepLegendNumberActive : null, done ? styles.stepLegendNumberDone : null]}>{index + 1}</Text>
                        </View>
                        <Text style={[styles.stepLegendLabel, active ? styles.stepLegendLabelActive : null, done ? styles.stepLegendLabelDone : null]}>
                          {getStepDisplayLabel(stepKey)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {step === "payment" ? (
                  <View style={styles.stepModeBanner}>
                    <Ionicons color={theme.colors.info} name="wallet-outline" size={14} />
                    <Text style={styles.stepModeBannerText}>Tahap pembayaran aktif setelah review final.</Text>
                  </View>
                ) : null}
              </View>

              <ScrollView
                contentContainerStyle={styles.panelBodyScrollContent}
                keyboardDismissMode={scrollKeyboardDismissMode}
                keyboardShouldPersistTaps="always"
                onScroll={(event) => {
                  scrollYRef.current = event.nativeEvent.contentOffset.y;
                }}
                ref={contentScrollRef}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.panelBodyScroll}
              >
                <View style={styles.panelBody}>
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
                      <View style={styles.selectedCustomerTagRow}>
                        <View style={styles.selectedCustomerTag}>
                          <Ionicons color={theme.colors.info} name="sparkles-outline" size={12} />
                          <Text style={styles.selectedCustomerTagText}>{courierModeLabel}</Text>
                        </View>
                        {customerPackageSummary ? (
                          <View style={styles.selectedCustomerTag}>
                            <Ionicons color={theme.colors.success} name="cube-outline" size={12} />
                            <Text style={styles.selectedCustomerTagText}>{customerPackageSummary.activeCount} paket aktif</Text>
                          </View>
                        ) : null}
                        {customerTransactionSummary.unpaidCount > 0 ? (
                          <View style={[styles.selectedCustomerTag, styles.selectedCustomerTagWarning]}>
                            <Ionicons color={theme.colors.warning} name="alert-circle-outline" size={12} />
                            <Text style={[styles.selectedCustomerTagText, styles.selectedCustomerTagWarningText]}>
                              {customerTransactionSummary.unpaidCount} order belum lunas
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.selectedCustomerInfoRow}>
                        <View style={styles.selectedCustomerInfoIconWrap}>
                          <Ionicons color={theme.colors.textSecondary} name="person-outline" size={14} />
                        </View>
                        <Text style={styles.selectedCustomerDetailValue}>{selectedCustomer.name}</Text>
                      </View>
                      <View style={styles.selectedCustomerInfoRow}>
                        <View style={styles.selectedCustomerInfoIconWrap}>
                          <Ionicons color={theme.colors.textSecondary} name="call-outline" size={14} />
                        </View>
                        <Text style={styles.selectedCustomerDetailValue}>{formatCustomerPhoneDisplay(selectedCustomer.phone_normalized)}</Text>
                      </View>
                      <View style={styles.selectedCustomerInfoRow}>
                        <View style={styles.selectedCustomerInfoIconWrap}>
                          <Ionicons color={theme.colors.textSecondary} name="location-outline" size={14} />
                        </View>
                        <Text style={[styles.selectedCustomerDetailValue, !selectedCustomerProfile?.address?.trim() ? styles.selectedCustomerDetailValueMuted : null]}>
                          {selectedCustomerProfile?.address?.trim() || "Belum diisi"}
                        </Text>
                      </View>
                      <View style={styles.selectedCustomerInfoRow}>
                        <View style={styles.selectedCustomerInfoIconWrap}>
                          <Ionicons color={theme.colors.textSecondary} name="document-text-outline" size={14} />
                        </View>
                        <Text style={[styles.selectedCustomerDetailValue, !selectedCustomerProfile?.note?.trim() ? styles.selectedCustomerDetailValueMuted : null]}>
                          {selectedCustomerProfile?.note?.trim() || "Tidak ada catatan"}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {selectedCustomer ? (
                    <View style={styles.deliveryModePanel}>
                      <View style={styles.deliveryModeHeader}>
                        <Text style={styles.deliveryModeTitle}>Metode Pesanan</Text>
                        <Text style={styles.deliveryModeValue}>{courierModeLabel}</Text>
                      </View>
                      <View style={styles.deliveryModeOptions}>
                        <Pressable
                          onPress={() => setRequiresPickup((current) => !current)}
                          style={({ pressed }) => [styles.deliveryModeOption, requiresPickup ? styles.deliveryModeOptionActive : null, pressed ? styles.pressed : null]}
                        >
                          <Ionicons color={requiresPickup ? theme.colors.info : theme.colors.textMuted} name={requiresPickup ? "checkbox-outline" : "square-outline"} size={14} />
                          <Text style={[styles.deliveryModeOptionText, requiresPickup ? styles.deliveryModeOptionTextActive : null]}>Jemput</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setRequiresDelivery((current) => !current)}
                          style={({ pressed }) => [styles.deliveryModeOption, requiresDelivery ? styles.deliveryModeOptionActive : null, pressed ? styles.pressed : null]}
                        >
                          <Ionicons color={requiresDelivery ? theme.colors.info : theme.colors.textMuted} name={requiresDelivery ? "checkbox-outline" : "square-outline"} size={14} />
                          <Text style={[styles.deliveryModeOptionText, requiresDelivery ? styles.deliveryModeOptionTextActive : null]}>Antar</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.deliveryModeHint}>
                        {requiresPickup
                          ? resolvedPickupAddress
                            ? requiresDelivery
                              ? "Isi jadwal jemput. Jadwal antar otomatis saat layanan ditimbang dan diinput."
                              : "Isi jadwal jemput. Item layanan diinput setelah barang dijemput."
                            : "Alamat pelanggan belum diisi. Lengkapi alamat untuk memudahkan jadwal jemput/antar."
                          : requiresDelivery
                            ? "Pelanggan datang sendiri lalu minta diantar saat selesai. Jadwal antar otomatis diisi sistem."
                            : "Pelanggan datang dan ambil sendiri. Tanpa ongkir."}
                      </Text>
                      {hasCourierFlow ? (
                        <>
                          <View style={styles.deliveryScheduleGrid}>
                            {requiresPickup ? (
                              <View style={styles.deliveryScheduleCard}>
                                <Text style={styles.deliveryScheduleLabel}>Jemput</Text>
                                <Text style={[styles.deliveryScheduleAddress, !resolvedPickupAddress ? styles.deliveryScheduleAddressMuted : null]}>
                                  {resolvedPickupAddress || "Alamat belum tersedia"}
                                </Text>
                                <View style={styles.deliveryScheduleActionRow}>
                                  <Pressable onPress={openSchedulePicker} style={({ pressed }) => [styles.deliverySchedulePickerButton, pressed ? styles.pressed : null]}>
                                    <Ionicons color={theme.colors.info} name="calendar-outline" size={14} />
                                    <Text style={[styles.deliverySchedulePickerValue, !pickupScheduleInput.trim() ? styles.deliverySchedulePickerPlaceholder : null]}>
                                      {pickupScheduleInput.trim() || "Pilih tanggal"}
                                    </Text>
                                  </Pressable>
                                  {pickupScheduleInput.trim() ? (
                                    <Pressable hitSlop={6} onPress={clearScheduleValue} style={({ pressed }) => [styles.deliveryScheduleClearButton, pressed ? styles.pressed : null]}>
                                      <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            ) : null}
                            {requiresDelivery ? (
                              <View style={styles.deliveryScheduleCard}>
                                <Text style={styles.deliveryScheduleLabel}>Antar</Text>
                                <Text style={[styles.deliveryScheduleAddress, !resolvedDeliveryAddress ? styles.deliveryScheduleAddressMuted : null]}>
                                  {resolvedDeliveryAddress || "Alamat belum tersedia"}
                                </Text>
                                <View style={styles.deliveryScheduleActionRow}>
                                  <View style={styles.deliverySchedulePickerButton}>
                                    <Ionicons color={theme.colors.info} name="time-outline" size={14} />
                                    <Text style={styles.deliverySchedulePickerValue}>
                                      {deliveryScheduleInput.trim() || "Otomatis oleh sistem"}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        </>
                      ) : null}
                    </View>
                  ) : null}

                  {selectedCustomer ? (
                    <View style={styles.customerInsightStack}>
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

                      {customerPackageSummary ? (
                        <AppPanel style={styles.customerInsightPanel}>
                          <Text style={styles.customerInsightTitle}>Data Paket</Text>
                          <View style={styles.customerMetricGrid}>
                            <View style={styles.customerMetricItem}>
                              <Text style={styles.customerMetricValue}>{customerPackageSummary.activeCount}</Text>
                              <Text style={styles.customerMetricLabel}>Paket aktif</Text>
                            </View>
                            <View style={styles.customerMetricItem}>
                              <Text style={styles.customerMetricValue}>{customerPackageSummary.remainingQuotaLabel}</Text>
                              <Text style={styles.customerMetricLabel}>Sisa kuota</Text>
                            </View>
                          </View>
                        </AppPanel>
                      ) : null}
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
                        <FlashList
                          contentContainerStyle={styles.customerListContent}
                          data={customerListEntries}
                          drawDistance={280}
                          keyboardShouldPersistTaps="handled"
                          keyExtractor={(entry) => entry.customer.id}
                          nestedScrollEnabled
                          renderItem={({ item: entry }) => (
                            <Pressable onPress={() => handleSelectCustomer(entry.customer)} style={({ pressed }) => [styles.customerItem, pressed ? styles.pressed : null]}>
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
                          )}
                          ItemSeparatorComponent={() => <View style={styles.customerListSeparator} />}
                          showsVerticalScrollIndicator={false}
                          style={styles.customerList}
                        />
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
                      <Text style={styles.servicesTopSubtitle}>
                        {isPickupBookingFlow ? "Mode jemput: item layanan diinput setelah barang dijemput. Anda bisa langsung lanjut ke review." : "Pilih group dulu, lanjut pilih layanan dan isi qty/berat."}
                      </Text>
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
                        placeholder={activeServiceGroup ? "Cari layanan di group ini" : "Cari group atau varian layanan"}
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
                      {serviceKeyword.trim() ? (
                        <>
                          <View style={styles.serviceSearchResultsHeader}>
                            <Text style={styles.serviceSearchResultsTitle}>Hasil layanan</Text>
                            <Text style={styles.serviceSearchResultsMeta}>{crossGroupServiceSearchResults.length} cocok</Text>
                          </View>
                          {crossGroupServiceSearchResults.length === 0 ? <Text style={styles.infoText}>Layanan atau group tidak ditemukan.</Text> : null}
                          <View style={styles.serviceGroupList}>
                            {crossGroupServiceSearchResults.map(({ service, groupIcon, groupKey, groupLabel }) => {
                              const selectedDraft = selectedServiceDraftById[service.id];
                              const selected = selectedServiceIdSet.has(service.id);
                              const hasValidMetric = selectedDraft?.hasValidMetric ?? false;

                              return (
                                <Pressable
                                  key={service.id}
                                  onPress={() => openServiceSearchResult(service.id, groupKey)}
                                  style={({ pressed }) => [styles.serviceSearchResultItem, selected ? styles.serviceSearchResultItemSelected : null, pressed ? styles.pressed : null]}
                                >
                                  <View style={styles.serviceSearchResultLead}>
                                    <View style={styles.serviceSearchResultIconWrap}>
                                      <Ionicons color={theme.colors.textSecondary} name={resolveServiceIcon(service.image_icon, "search-outline")} size={16} />
                                    </View>
                                    <View style={styles.serviceSearchResultMain}>
                                      <Text numberOfLines={1} style={styles.serviceSearchResultName}>
                                        {service.name}
                                      </Text>
                                      <View style={styles.serviceSearchResultMetaRow}>
                                        <Text style={styles.serviceSearchResultPrice}>
                                          {formatMoney(service.effective_price_amount)} / {service.unit_type.toUpperCase()}
                                        </Text>
                                        <View style={styles.serviceSearchResultGroupBadge}>
                                          <Ionicons color={theme.colors.textMuted} name={resolveServiceIcon(groupIcon, "grid-outline")} size={11} />
                                          <Text numberOfLines={1} style={styles.serviceSearchResultGroupBadgeText}>
                                            {groupLabel}
                                          </Text>
                                        </View>
                                        {selected ? (
                                          <View style={[styles.serviceSearchResultStateBadge, hasValidMetric ? styles.serviceSearchResultStateBadgeActive : null]}>
                                            <Text style={[styles.serviceSearchResultStateBadgeText, hasValidMetric ? styles.serviceSearchResultStateBadgeTextActive : null]}>
                                              {hasValidMetric ? "Dipilih" : "Belum lengkap"}
                                            </Text>
                                          </View>
                                        ) : null}
                                      </View>
                                    </View>
                                  </View>
                                  <Ionicons color={theme.colors.textMuted} name="arrow-forward" size={16} />
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : (
                        <>
                          {visibleServiceGroups.length === 0 ? <Text style={styles.infoText}>Group/varian layanan tidak ditemukan.</Text> : null}
                          <View style={styles.serviceGroupList}>
                            {visibleServiceGroups.map((group) => {
                              const validCount = validSelectedCountByGroup[group.key] ?? 0;
                              const groupMeta = `${group.items.length} layanan`;
                              return (
                                <Pressable
                                  key={group.key}
                                  onPress={() => {
                                    setActiveServiceGroupKey(group.key);
                                    closeServiceSearch();
                                  }}
                                  style={({ pressed }) => [styles.serviceGroupPickerItem, pressed ? styles.pressed : null]}
                                >
                                  <View style={styles.serviceGroupPickerLead}>
                                    <View style={styles.serviceGroupPickerIconWrap}>
                                      <Ionicons color={theme.colors.textSecondary} name={resolveServiceIcon(group.imageIcon, "grid-outline")} size={16} />
                                    </View>
                                    <View style={styles.serviceGroupPickerMain}>
                                      <Text numberOfLines={1} style={styles.serviceGroupPickerName}>
                                        {group.label}
                                      </Text>
                                      <View style={styles.serviceGroupPickerMetaRow}>
                                        <Text style={styles.serviceGroupPickerMeta}>{groupMeta}</Text>
                                        {validCount > 0 ? (
                                          <View style={[styles.serviceGroupPickerCountBadge, styles.serviceGroupPickerCountBadgeActive]}>
                                            <Text style={[styles.serviceGroupPickerCountBadgeText, styles.serviceGroupPickerCountBadgeTextActive]}>{validCount} dipilih</Text>
                                          </View>
                                        ) : null}
                                      </View>
                                    </View>
                                  </View>
                                  <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      )}
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
                          <Text style={styles.activeGroupBackLinkText}>Semua group</Text>
                        </Pressable>
                        <ScrollView
                          contentContainerStyle={styles.activeGroupSwitchRow}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          {groupedServices.map((group) => {
                            const active = group.key === activeServiceGroup.key;
                            const validCount = validSelectedCountByGroup[group.key] ?? 0;

                            return (
                              <Pressable
                                key={group.key}
                                onPress={() => {
                                  setActiveServiceGroupKey(group.key);
                                  closeServiceSearch();
                                }}
                                style={({ pressed }) => [
                                  styles.activeGroupSwitchChip,
                                  active ? styles.activeGroupSwitchChipActive : null,
                                  pressed ? styles.pressed : null,
                                ]}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={[styles.activeGroupSwitchLabel, active ? styles.activeGroupSwitchLabelActive : null]}
                                >
                                  {group.label}
                                </Text>
                                {validCount > 0 ? (
                                  <View
                                    style={[
                                      styles.activeGroupSwitchBadge,
                                      styles.activeGroupSwitchBadgeSelected,
                                      active ? styles.activeGroupSwitchBadgeActive : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.activeGroupSwitchBadgeText,
                                        styles.activeGroupSwitchBadgeTextSelected,
                                        active ? styles.activeGroupSwitchBadgeTextActive : null,
                                      ]}
                                    >
                                      {validCount} dipilih
                                    </Text>
                                  </View>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
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
                              <View
                                key={service.id}
                                ref={(ref) => {
                                  serviceItemRefs.current[service.id] = ref;
                                }}
                                style={[
                                  styles.servicePickerBlock,
                                  selected ? styles.servicePickerItemSelected : null,
                                  highlightedServiceId === service.id ? styles.servicePickerBlockHighlighted : null,
                                ]}
                              >
                                <Pressable
                                  onPress={() => toggleServiceSelection(service.id)}
                                  style={({ pressed }) => [styles.servicePickerItem, pressed ? styles.pressed : null]}
                                >
                                  <View style={styles.servicePickerLead}>
                                    <View style={[styles.servicePickerIconWrap, selected ? styles.servicePickerIconWrapSelected : null]}>
                                      <Ionicons
                                        color={selected ? theme.colors.info : theme.colors.textSecondary}
                                        name={resolveServiceIcon(service.image_icon)}
                                        size={16}
                                      />
                                    </View>
                                    <View style={styles.servicePickerMain}>
                                      <Text numberOfLines={1} style={styles.servicePickerName}>
                                        {service.name}
                                      </Text>
                                      <Text style={styles.servicePickerMeta}>
                                        {formatMoney(service.effective_price_amount)} / {service.unit_type.toUpperCase()}
                                      </Text>
                                    </View>
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
                      <Text style={styles.stepHeaderSubtitle}>
                        {isPickupBookingFlow ? "Cek jadwal jemput dan catatan sebelum simpan booking." : "Cek total dan catatan sebelum lanjut ke pembayaran."}
                      </Text>
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
                      <Text style={styles.reviewCustomerMethod}>{courierModeLabel}</Text>
                    </View>
                    {hasCourierFlow ? (
                      <View style={styles.reviewScheduleStack}>
                        {requiresPickup ? <Text style={styles.reviewScheduleText}>Jemput: {pickupScheduleInput.trim() || "Belum diatur"}</Text> : null}
                        {requiresDelivery ? (
                          <Text style={styles.reviewScheduleText}>
                            Antar: {deliveryScheduleInput.trim() || "Otomatis oleh sistem"}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </AppPanel>

                  <AppPanel style={[styles.summaryPanel, styles.summaryTotalPanel]}>
                    <View style={styles.summaryHeroRow}>
                      <View style={styles.summaryHeroTextWrap}>
                        <Text style={styles.summaryHeroEyebrow}>Ringkasan akhir</Text>
                        <Text style={styles.summaryHeroHeadline}>
                          {paymentFlowType === "now" ? "Siap diteruskan ke pembayaran" : "Siap disimpan sebagai bayar nanti"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.summarySectionHeader}>
                      <Text style={styles.summaryTitle}>Item Layanan</Text>
                      <Text style={styles.summarySectionMeta}>{selectedReviewItemCount} item</Text>
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
                      {selectedPerfumeService ? (
                        <View key={selectedPerfumeService.id} style={styles.summaryItemCard}>
                          <View style={styles.summaryItemTopRow}>
                            <Text numberOfLines={1} style={styles.summaryItemName}>
                              {selectedPerfumeService.name}
                            </Text>
                            <Text style={styles.summaryItemSubtotal}>{formatMoney(selectedPerfumeAmount)}</Text>
                          </View>
                          <Text style={styles.summaryItemMeta}>Parfum pilihan x 1 PCS</Text>
                        </View>
                      ) : null}
                      {selectedReviewItemCount === 0 ? (
                        <Text style={styles.infoText}>
                          {isPickupBookingFlow ? "Item layanan akan diinput setelah barang dijemput." : "Belum ada item layanan."}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Subtotal</Text>
                      <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
                    </View>
                    {hasCourierFlow ? (
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
                      <Text style={styles.summaryText}>{manualDiscountSummaryLabel}</Text>
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

                  {showReviewPerfumePanel ? (
                    <View onLayout={(event) => handleReviewPanelLayout("perfume", event)}>
                      <AppPanel style={styles.summaryPanel}>
                        <View style={styles.reviewSectionHeader}>
                          <Text style={styles.summaryTitle}>Parfum</Text>
                          {selectedPerfumeService ? <Text style={styles.reviewSectionValue}>+ {formatMoney(selectedPerfumeAmount)}</Text> : null}
                        </View>
                        {perfumeServices.length > 0 ? (
                          <View style={styles.reviewPromoBlock}>
                            <Pressable
                              onPress={() => setSelectedPerfumeServiceId(null)}
                              style={({ pressed }) => [
                                styles.reviewPromoRow,
                                styles.reviewPromoSelectableRow,
                                selectedPerfumeServiceId === null ? styles.reviewPromoRowActive : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <View style={styles.reviewPromoRowMain}>
                                <Text numberOfLines={1} style={styles.reviewPromoName}>
                                  Tanpa Parfum
                                </Text>
                                <Text style={styles.reviewPromoMeta}>Lanjutkan pesanan tanpa layanan parfum tambahan.</Text>
                              </View>
                              <View style={styles.reviewPromoSelectionRight}>
                                <Text style={[styles.reviewPromoValue, styles.reviewPromoValueMuted]}>{formatMoney(0)}</Text>
                                <Text style={[styles.reviewPromoEligibilityText, selectedPerfumeServiceId === null ? styles.reviewPromoStateTextActive : styles.reviewPromoStateTextMuted]}>
                                  {selectedPerfumeServiceId === null ? "Dipilih" : "Pilih"}
                                </Text>
                              </View>
                            </Pressable>
                            {perfumeServices.map((service) => {
                              const active = selectedPerfumeServiceId === service.id;
                              return (
                                <Pressable
                                  key={service.id}
                                  onPress={() => setSelectedPerfumeServiceId(active ? null : service.id)}
                                  style={({ pressed }) => [styles.reviewPromoRow, styles.reviewPromoSelectableRow, active ? styles.reviewPromoRowActive : null, pressed ? styles.pressed : null]}
                                >
                                  <View style={styles.reviewPromoRowMain}>
                                    <Text numberOfLines={1} style={styles.reviewPromoName}>
                                      {service.name}
                                    </Text>
                                    <Text style={styles.reviewPromoMeta}>Tambahan parfum untuk pesanan ini.</Text>
                                  </View>
                                  <View style={styles.reviewPromoSelectionRight}>
                                    <Text style={styles.reviewPromoValue}>+ {formatMoney(Math.max(service.effective_price_amount ?? 0, 0))}</Text>
                                    <Text style={[styles.reviewPromoEligibilityText, active ? styles.reviewPromoStateTextActive : styles.reviewPromoStateTextMuted]}>
                                      {active ? "Dipilih" : "Pilih"}
                                    </Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.infoText}>Belum ada layanan parfum aktif di outlet ini.</Text>
                        )}
                      </AppPanel>
                    </View>
                  ) : null}

                  {showReviewPromoPanel ? (
                    <View onLayout={(event) => handleReviewPanelLayout("promo", event)}>
                      <AppPanel style={styles.summaryPanel}>
                        <View style={styles.reviewSectionHeader}>
                          <Text style={styles.summaryTitle}>Promo</Text>
                          {promoDiscountAmount > 0 ? <Text style={styles.reviewSectionValue}>- {formatMoney(promoDiscountAmount)}</Text> : null}
                        </View>
                        {promoErrorMessage ? <Text style={styles.reviewFieldError}>{promoErrorMessage}</Text> : null}

                        {selectablePromoCount > 0 ? (
                          <View style={styles.reviewPromoBlock}>
                            <Text style={styles.reviewAmountLabel}>Pilih Promo ({selectablePromoCount})</Text>
                            {promoOptionList.map(({ promo, draft, eligible, applied, optionType, autoSelected }) => {
                              const active = optionType === "selection" ? selectedPromoId === promo.id : applied;
                              const statusLabel = eligible
                                ? optionType === "automatic"
                                  ? applied
                                    ? "Dipilih Otomatis"
                                    : "Memenuhi Syarat"
                                  : "Memenuhi Syarat"
                                : "Belum Memenuhi";
                              const statusTextStyle = eligible
                                ? applied
                                  ? styles.reviewPromoStateTextActive
                                  : styles.reviewPromoEligibilityTextEligible
                                : styles.reviewPromoEligibilityTextPending;
                              const rowContent = (
                                <>
                                  <View style={styles.reviewPromoRowMain}>
                                    <Text numberOfLines={1} style={styles.reviewPromoName}>
                                      {promo.name}
                                    </Text>
                                    <Text style={styles.reviewPromoMeta}>
                                      {formatPromotionTypeLabel(promo.promo_type)} • {formatPromotionRuleSummary(promo)}
                                    </Text>
                                  </View>
                                  <View style={styles.reviewPromoSelectionRight}>
                                    <Text style={[styles.reviewPromoValue, !eligible ? styles.reviewPromoValueMuted : null]}>
                                      {draft ? `- ${formatMoney(draft.discountAmount)}` : "Belum ada potongan"}
                                    </Text>
                                    <Text style={[styles.reviewPromoEligibilityText, statusTextStyle]}>{statusLabel}</Text>
                                  </View>
                                </>
                              );

                              if (optionType === "automatic") {
                                return (
                                  <View key={`${optionType}-${promo.id}`} style={[styles.reviewPromoRow, styles.reviewPromoSelectableRow, active ? styles.reviewPromoRowActive : null]}>
                                    {rowContent}
                                  </View>
                                );
                              }

                              return (
                                <Pressable
                                  key={`${optionType}-${promo.id}`}
                                  onPress={() => setSelectedPromoId(active ? null : promo.id)}
                                  style={({ pressed }) => [styles.reviewPromoRow, styles.reviewPromoSelectableRow, active ? styles.reviewPromoRowActive : null, pressed ? styles.pressed : null]}
                                >
                                  {rowContent}
                                </Pressable>
                              );
                            })}
                            {hasVoucherPromotions ? (
                              <Pressable
                                onPress={() => setSelectedPromoId(voucherOptionSelected ? null : VOUCHER_PROMO_SELECTION_KEY)}
                                style={({ pressed }) => [styles.reviewPromoRow, styles.reviewPromoSelectableRow, voucherOptionSelected ? styles.reviewPromoRowActive : null, pressed ? styles.pressed : null]}
                              >
                                <View style={styles.reviewPromoRowMain}>
                                  <Text numberOfLines={1} style={styles.reviewPromoName}>
                                    Voucher
                                  </Text>
                                  <Text style={styles.reviewPromoMeta}>Gunakan kode voucher untuk cek promo voucher yang tersedia.</Text>
                                </View>
                                <View style={styles.reviewPromoSelectionRight}>
                                  <Text style={[styles.reviewPromoValue, !voucherPromoDraft ? styles.reviewPromoValueMuted : null]}>
                                    {voucherPromoDraft ? `- ${formatMoney(voucherPromoDraft.discountAmount)}` : "Masukkan kode"}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.reviewPromoEligibilityText,
                                      voucherPromoDraft
                                        ? styles.reviewPromoEligibilityTextEligible
                                        : voucherOptionSelected
                                          ? styles.reviewPromoStateTextActive
                                          : styles.reviewPromoStateTextMuted,
                                    ]}
                                  >
                                    {voucherPromoDraft ? "Memenuhi Syarat" : voucherOptionSelected ? "Dipilih" : "Pilih"}
                                  </Text>
                                </View>
                              </Pressable>
                            ) : null}
                            {hasAutomaticPromotions ? <Text style={styles.reviewPromoHint}>Promo otomatis dipilih berdasarkan prioritas tertinggi saat memenuhi syarat, kecuali voucher manual dipilih.</Text> : null}
                            {selectedPromoNotApplied ? <Text style={styles.reviewPromoHint}>Promo pilihan belum terpakai karena ada promo eksklusif yang diprioritaskan.</Text> : null}
                          </View>
                        ) : null}

                        {hasVoucherPromotions && voucherOptionSelected ? (
                          <View style={styles.reviewPromoBlock}>
                            <Text style={styles.reviewAmountLabel}>Input Kode Voucher</Text>
                            <TextInput
                              autoCapitalize="characters"
                              onChangeText={handlePromoVoucherCodeChange}
                              onBlur={() => setFocusedReviewInputKey(null)}
                              onFocus={() => focusReviewInput("voucher")}
                              placeholder="Masukkan kode voucher"
                              placeholderTextColor={theme.colors.textMuted}
                              ref={(node) => {
                                reviewInputRefs.current.voucher = node;
                              }}
                              style={[styles.input, styles.reviewAmountInput, voucherCodeRejected ? styles.inputInvalid : null]}
                              value={promoVoucherCodeInput}
                            />
                            {promoVoucherCodeInput.trim() ? (
                              voucherPromoDraft ? (
                                <Text style={styles.reviewPromoHint}>
                                  Voucher aktif: {voucherPromoDraft.promo.name} • Potongan {formatMoney(voucherPromoDraft.discountAmount)}
                                </Text>
                              ) : (
                                <Text style={styles.reviewFieldError}>Kode voucher belum cocok. Cek kode dan syarat minimum promo.</Text>
                              )
                            ) : (
                              <Text style={styles.reviewPromoHint}>Masukkan kode voucher untuk cek kelayakan promo.</Text>
                            )}
                          </View>
                        ) : null}

                      </AppPanel>
                    </View>
                  ) : null}

                  {showReviewDiscountPanel ? (
                    <View onLayout={(event) => handleReviewPanelLayout("discount", event)}>
                      <AppPanel style={styles.summaryPanel}>
                        <View style={styles.reviewSectionHeader}>
                          <Text style={styles.summaryTitle}>Diskon</Text>
                          {totalDiscountAmount > 0 ? <Text style={styles.reviewSectionValue}>- {formatMoney(totalDiscountAmount)}</Text> : null}
                        </View>
                        <View style={styles.reviewAdjustmentsGrid}>
                          {hasCourierFlow ? (
                            <View style={styles.reviewAmountField}>
                              <Text style={styles.reviewAmountLabel}>Ongkir</Text>
                              <TextInput
                                keyboardType="numeric"
                                onChangeText={handleShippingFeeChange}
                                onBlur={() => setFocusedReviewInputKey(null)}
                                onFocus={() => focusReviewInput("shippingFee")}
                                placeholder="0"
                                placeholderTextColor={theme.colors.textMuted}
                                ref={(node) => {
                                  reviewInputRefs.current.shippingFee = node;
                                }}
                                style={[styles.input, styles.reviewAmountInput]}
                                value={shippingFeeInput}
                              />
                              <Text style={styles.reviewAmountHint}>{formatMoney(shippingFee)}</Text>
                            </View>
                          ) : null}
                          <View style={styles.reviewAmountField}>
                            <Text style={styles.reviewAmountLabel}>Diskon Manual</Text>
                            <View style={styles.reviewDiscountModeRow}>
                              <Pressable
                                onPress={() => handleManualDiscountTypeChange("amount")}
                                style={({ pressed }) => [styles.reviewPromoChip, manualDiscountType === "amount" ? styles.reviewPromoChipActive : null, pressed ? styles.pressed : null]}
                              >
                                <Text style={[styles.reviewPromoChipText, manualDiscountType === "amount" ? styles.reviewPromoChipTextActive : null]}>Nominal</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleManualDiscountTypeChange("percent")}
                                style={({ pressed }) => [styles.reviewPromoChip, manualDiscountType === "percent" ? styles.reviewPromoChipActive : null, pressed ? styles.pressed : null]}
                              >
                                <Text style={[styles.reviewPromoChipText, manualDiscountType === "percent" ? styles.reviewPromoChipTextActive : null]}>Persen</Text>
                              </Pressable>
                            </View>
                            <TextInput
                              keyboardType="numeric"
                              onChangeText={handleDiscountChange}
                              onBlur={() => setFocusedReviewInputKey(null)}
                              onFocus={() => focusReviewInput("discount")}
                              placeholder={manualDiscountType === "percent" ? "0 - 100" : "0"}
                              placeholderTextColor={theme.colors.textMuted}
                              ref={(node) => {
                                reviewInputRefs.current.discount = node;
                              }}
                              style={[styles.input, styles.reviewAmountInput, discountExceedsLimit ? styles.inputInvalid : null]}
                              value={discountInput}
                            />
                            {manualDiscountType === "percent" ? (
                              <>
                                <Text style={styles.reviewAmountHint}>
                                  {manualDiscountPercent}% = - {formatMoney(discountAmount)}
                                </Text>
                                <Text style={styles.reviewPromoHint}>Persen dihitung dari subtotal layanan.</Text>
                              </>
                            ) : (
                              <Text style={styles.reviewAmountHint}>- {formatMoney(discountAmount)}</Text>
                            )}
                          </View>
                        </View>
                        {discountExceedsLimit ? (
                          <Text style={styles.reviewFieldError}>
                            Total potongan (promo + manual) melebihi {hasCourierFlow ? "subtotal + ongkir" : "subtotal"}.
                          </Text>
                        ) : null}
                      </AppPanel>
                    </View>
                  ) : null}

                  {showReviewNotesPanel ? (
                    <View onLayout={(event) => handleReviewPanelLayout("notes", event)}>
                      <AppPanel style={styles.summaryPanel}>
                        <View style={styles.reviewSectionHeader}>
                          <Text style={styles.summaryTitle}>Catatan</Text>
                        </View>
                        <TextInput
                          multiline
                          onChangeText={setOrderNotes}
                          onBlur={() => setFocusedReviewInputKey(null)}
                          onFocus={() => focusReviewInput("notes")}
                          placeholder="Catatan order (opsional)"
                          placeholderTextColor={theme.colors.textMuted}
                          ref={(node) => {
                            reviewInputRefs.current.notes = node;
                          }}
                          style={[styles.input, styles.reviewNotesInput]}
                          value={orderNotes}
                        />
                      </AppPanel>
                    </View>
                  ) : null}

                  <View style={styles.reviewActionButtonsRow}>
                    <Pressable
                      onPress={() => toggleReviewPanel("perfume")}
                      style={({ pressed }) => [styles.reviewActionButton, showReviewPerfumePanel ? styles.reviewActionButtonActive : null, pressed ? styles.reviewActionButtonPressed : null]}
                    >
                      <View style={styles.reviewActionButtonTop}>
                        <View style={styles.reviewActionButtonLeft}>
                          <View style={[styles.reviewActionButtonIconBadge, showReviewPerfumePanel ? styles.reviewActionButtonIconBadgeActive : null]}>
                            <Ionicons color={showReviewPerfumePanel ? theme.colors.info : theme.colors.textMuted} name="flask-outline" size={14} />
                          </View>
                          <Text style={[styles.reviewActionButtonLabel, showReviewPerfumePanel ? styles.reviewActionButtonLabelActive : null]}>Parfum</Text>
                        </View>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.reviewActionButtonMeta, showReviewPerfumePanel ? styles.reviewActionButtonMetaActive : null]}
                      >
                        {selectedPerfumeService?.name ?? "Tanpa parfum"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleReviewPanel("promo")}
                      style={({ pressed }) => [styles.reviewActionButton, showReviewPromoPanel ? styles.reviewActionButtonActive : null, pressed ? styles.reviewActionButtonPressed : null]}
                    >
                      <View style={styles.reviewActionButtonTop}>
                        <View style={styles.reviewActionButtonLeft}>
                          <View style={[styles.reviewActionButtonIconBadge, showReviewPromoPanel ? styles.reviewActionButtonIconBadgeActive : null]}>
                            <Ionicons color={showReviewPromoPanel ? theme.colors.info : theme.colors.textMuted} name="pricetags-outline" size={14} />
                          </View>
                          <Text style={[styles.reviewActionButtonLabel, showReviewPromoPanel ? styles.reviewActionButtonLabelActive : null]}>Promo</Text>
                        </View>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => toggleReviewPanel("discount")}
                      style={({ pressed }) => [styles.reviewActionButton, showReviewDiscountPanel ? styles.reviewActionButtonActive : null, pressed ? styles.reviewActionButtonPressed : null]}
                    >
                      <View style={styles.reviewActionButtonTop}>
                        <View style={styles.reviewActionButtonLeft}>
                          <View style={[styles.reviewActionButtonIconBadge, showReviewDiscountPanel ? styles.reviewActionButtonIconBadgeActive : null]}>
                            <Ionicons color={showReviewDiscountPanel ? theme.colors.info : theme.colors.textMuted} name="cash-outline" size={14} />
                          </View>
                          <Text style={[styles.reviewActionButtonLabel, showReviewDiscountPanel ? styles.reviewActionButtonLabelActive : null]}>Diskon</Text>
                        </View>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => toggleReviewPanel("notes")}
                      style={({ pressed }) => [styles.reviewActionButton, showReviewNotesPanel ? styles.reviewActionButtonActive : null, pressed ? styles.reviewActionButtonPressed : null]}
                    >
                      <View style={styles.reviewActionButtonTop}>
                        <View style={styles.reviewActionButtonLeft}>
                          <View style={[styles.reviewActionButtonIconBadge, showReviewNotesPanel ? styles.reviewActionButtonIconBadgeActive : null]}>
                            <Ionicons color={showReviewNotesPanel ? theme.colors.info : theme.colors.textMuted} name="document-text-outline" size={14} />
                          </View>
                          <Text style={[styles.reviewActionButtonLabel, showReviewNotesPanel ? styles.reviewActionButtonLabelActive : null]}>Catatan</Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>

                  </View>
                ) : null}

                {step === "payment" ? (
                  <View style={styles.sectionWrap}>
                  <View style={styles.stepHeader}>
                    <View style={styles.stepHeaderIconWrap}>
                      <Ionicons color={theme.colors.info} name="wallet-outline" size={16} />
                    </View>
                    <View style={styles.stepHeaderTextWrap}>
                      <Text style={styles.stepHeaderTitle}>Pembayaran</Text>
                      <Text style={styles.stepHeaderSubtitle}>Tentukan bayar sekarang atau bayar nanti.</Text>
                    </View>
                  </View>

                  <AppPanel style={[styles.summaryPanel, styles.summaryTotalPanel]}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryTotal}>Total Tagihan</Text>
                      <Text style={styles.summaryTotalValue}>{formatMoney(total)}</Text>
                    </View>
                  </AppPanel>

                  <AppPanel style={styles.summaryPanel}>
                    <View style={styles.reviewSectionHeader}>
                      <Text style={styles.summaryTitle}>Arahkan Pembayaran</Text>
                    </View>

                    <View style={styles.reviewPaymentModeRow}>
                      <Pressable
                        onPress={() => handlePaymentFlowChange("later")}
                        style={({ pressed }) => [
                          styles.reviewPaymentChip,
                          paymentFlowType === "later" ? styles.reviewPaymentChipActive : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Ionicons color={paymentFlowType === "later" ? theme.colors.info : theme.colors.textMuted} name="time-outline" size={14} />
                        <Text style={[styles.reviewPaymentChipText, paymentFlowType === "later" ? styles.reviewPaymentChipTextActive : null]}>Bayar Nanti</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handlePaymentFlowChange("now")}
                        style={({ pressed }) => [
                          styles.reviewPaymentChip,
                          paymentFlowType === "now" ? styles.reviewPaymentChipActive : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Ionicons color={paymentFlowType === "now" ? theme.colors.info : theme.colors.textMuted} name="flash-outline" size={14} />
                        <Text style={[styles.reviewPaymentChipText, paymentFlowType === "now" ? styles.reviewPaymentChipTextActive : null]}>Bayar Sekarang</Text>
                      </Pressable>
                    </View>

                    {paymentFlowType === "now" ? (
                      <>
                        <Text style={styles.reviewPromoHint}>
                          Setelah pesanan disimpan, aplikasi akan membuka layar pembayaran khusus dengan keypad custom untuk mencatat nominal, cetak nota, dan kirim ke WhatsApp.
                        </Text>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryText}>Nominal yang Akan Ditagih</Text>
                          <Text style={[styles.summaryValue, total > 0 ? styles.summaryDueValue : null]}>{formatMoney(total)}</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.reviewPromoHint}>Pesanan disimpan sebagai bayar nanti dengan sisa tagihan {formatMoney(total)}.</Text>
                    )}
                  </AppPanel>
                  </View>
                ) : null}
                </View>
              </ScrollView>

              <View onLayout={handleCreateFormFooterDockLayout} style={styles.createFormFooterDock}>
                {primaryDisabledHint ? (
                  <View style={styles.panelFooterHintBox}>
                    <Ionicons color={theme.colors.warning} name="alert-circle-outline" size={15} />
                    <Text style={styles.panelFooterHint}>{primaryDisabledHint}</Text>
                  </View>
                ) : null}
                <View style={[styles.panelFooterActions, step === "review" || step === "payment" ? styles.panelFooterActionsReview : null]}>
                  <View style={styles.panelFooterActionItemSecondary}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={previousStep}
                      style={({ pressed }) => [styles.footerSecondaryButton, pressed ? styles.footerSecondaryButtonPressed : null]}
                    >
                      <Ionicons color={theme.colors.textPrimary} name={secondaryButtonIconName} size={18} />
                      <Text style={styles.footerSecondaryTitle}>{secondaryButtonTitle}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.panelFooterActionItemPrimary}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={primaryActionDisabled}
                      onPress={handlePrimaryAction}
                      style={({ pressed }) => [
                        styles.footerPrimaryButton,
                        primaryActionDisabled ? styles.footerPrimaryButtonDisabled : null,
                        pressed && !primaryActionDisabled ? styles.footerPrimaryButtonPressed : null,
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.footerPrimaryTitle, primaryActionDisabled ? styles.footerPrimaryTitleDisabled : null]}>
                        {primaryButtonTitle}
                      </Text>
                      {primaryButtonBusy ? (
                        <ActivityIndicator color={theme.colors.primaryContrast} size="small" />
                      ) : (
                        <Ionicons color={theme.colors.primaryContrast} name={primaryButtonIconName} size={18} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {showCreateForm && (actionMessage || errorMessage) ? (
          <View pointerEvents="none" style={styles.createFormFloatingAlertDock}>
            {messageBanners}
          </View>
        ) : null}

        <Modal animationType="fade" onRequestClose={closeSchedulePicker} transparent visible={schedulePickerField !== null}>
          <Pressable onPress={closeSchedulePicker} style={[styles.scheduleModalBackdrop, { paddingBottom: insets.bottom + theme.spacing.md }]}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.scheduleModalCard}>
              <View style={styles.scheduleModalHandle} />
              <Text style={styles.scheduleModalTitle}>Atur Jadwal Jemput</Text>
              <Text style={styles.scheduleModalHint}>Pilih tanggal tanpa mengetik manual.</Text>

              <View style={styles.scheduleModalSection}>
                <Text style={styles.scheduleModalSectionTitle}>Tanggal</Text>
                <ScrollView contentContainerStyle={styles.scheduleOptionRow} horizontal showsHorizontalScrollIndicator={false}>
                  {scheduleDateOptions.map((option) => {
                    const active = option.token === schedulePickerDateToken;
                    return (
                      <Pressable
                        key={option.token}
                        onPress={() => setSchedulePickerDateToken(option.token)}
                        style={({ pressed }) => [styles.scheduleOptionChip, active ? styles.scheduleOptionChipActive : null, pressed ? styles.pressed : null]}
                      >
                        <Text style={[styles.scheduleOptionChipTitle, active ? styles.scheduleOptionChipTitleActive : null]}>{option.dayLabel}</Text>
                        <Text style={[styles.scheduleOptionChipMeta, active ? styles.scheduleOptionChipMetaActive : null]}>{option.dateLabel}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.scheduleModalActionRow}>
                <Pressable onPress={closeSchedulePicker} style={({ pressed }) => [styles.scheduleModalGhostButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.scheduleModalGhostButtonText}>Batal</Text>
                </Pressable>
                <Pressable onPress={applySchedulePicker} style={({ pressed }) => [styles.scheduleModalPrimaryButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.scheduleModalPrimaryButtonText}>Pakai Jadwal</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal animationType="fade" onRequestClose={closeExitDraftModal} transparent visible={exitDraftModalVisible}>
          <Pressable onPress={closeExitDraftModal} style={[styles.exitModalBackdrop, { paddingBottom: insets.bottom + theme.spacing.md }]}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.exitModalCard}>
              <View style={styles.exitModalHandle} />
              <View style={styles.exitModalHeader}>
                <View style={styles.exitModalIconWrap}>
                  <Ionicons color={theme.colors.info} name="document-text-outline" size={19} />
                </View>
                <Text style={styles.exitModalTitle}>Simpan Draft Pesanan?</Text>
              </View>
              <Text style={styles.exitModalBody}>
                {hasDraftChanges
                  ? "Simpan draft agar data tidak hilang dan bisa dilanjutkan lagi kapan saja."
                  : hasSavedDraft
                    ? "Draft tersimpan sudah tersedia. Anda bisa tetap menyimpan atau hapus draft sebelum keluar."
                    : "Belum ada data draft yang bisa disimpan. Anda tetap bisa keluar sekarang."}
              </Text>

              <View style={styles.exitModalPrimaryActions}>
                <Pressable onPress={handleDeleteDraftAndExit} style={({ pressed }) => [styles.exitModalDangerCta, pressed ? styles.pressed : null]}>
                  <Ionicons color={theme.colors.danger} name="trash-outline" size={16} />
                  <Text style={styles.exitModalDangerCtaText}>Hapus Draft</Text>
                </Pressable>
                <Pressable
                  disabled={!canPersistDraft}
                  onPress={handleSaveDraftAndExit}
                  style={({ pressed }) => [styles.exitModalPrimaryCta, !canPersistDraft ? styles.exitModalPrimaryCtaDisabled : null, pressed && canPersistDraft ? styles.pressed : null]}
                >
                  <Ionicons color={theme.colors.primaryContrast} name="save-outline" size={16} />
                  <Text style={styles.exitModalPrimaryCtaText}>Simpan Draft</Text>
                </Pressable>
              </View>

              <Pressable onPress={closeExitDraftModal} style={({ pressed }) => [styles.exitModalGhostCta, pressed ? styles.pressed : null]}>
                <Text style={styles.exitModalGhostCtaText}>Lanjut Edit</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
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
    content: {
      flexGrow: 1,
      paddingHorizontal: contentHorizontal,
      paddingTop: contentTop,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    contentCreateForm: {
      paddingBottom: 0,
    },
    createFormViewport: {
      flex: 1,
    },
    launchShell: {
      gap: theme.spacing.lg,
      paddingTop: theme.spacing.xs,
    },
    createFormFloatingAlertDock: {
      position: "absolute",
      top: contentTop,
      left: contentHorizontal,
      right: contentHorizontal,
      gap: theme.spacing.sm,
      zIndex: 8,
    },
    bodyHeader: {
      gap: 2,
    },
    screenTopBar: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    screenTopBarButton: {
      width: 42,
      height: 42,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(57,89,116,0.78)" : "rgba(201,220,236,0.96)",
      backgroundColor: theme.mode === "dark" ? "rgba(12,33,50,0.82)" : "rgba(255,255,255,0.86)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.16 : 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    screenTopBarTitleSlot: {
      flex: 1,
      minHeight: 42,
      justifyContent: "center",
      alignItems: "center",
    },
    screenTopBarTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
      lineHeight: isTablet ? 20 : 18,
      letterSpacing: 0.12,
      textAlign: "center",
    },
    screenTopBarMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      flexShrink: 0,
    },
    screenTopBarSideSlot: {
      minWidth: 42,
      minHeight: 42,
      alignItems: "flex-end",
      justifyContent: "center",
      flexShrink: 0,
    },
    screenTopBarSpacer: {
      width: 42,
      height: 42,
    },
    screenTopBarChip: {
      maxWidth: "58%",
      minHeight: 32,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(57,89,116,0.7)" : "rgba(201,220,236,0.92)",
      backgroundColor: theme.mode === "dark" ? "rgba(12,33,50,0.7)" : "rgba(255,255,255,0.82)",
      paddingHorizontal: 11,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    screenTopBarChipSuccess: {
      borderColor: theme.mode === "dark" ? "rgba(56,211,133,0.34)" : "rgba(31,158,99,0.22)",
      backgroundColor: theme.mode === "dark" ? "rgba(18,58,42,0.78)" : "rgba(237,249,241,0.94)",
    },
    screenTopBarChipText: {
      flexShrink: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 13,
    },
    screenTopBarChipTextSuccess: {
      color: theme.colors.success,
    },
    titleEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 14,
      letterSpacing: 0.9,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 23 : 20,
      lineHeight: isTablet ? 28 : 24,
      letterSpacing: 0.08,
    },
    titleSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    headerMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginTop: theme.spacing.sm,
    },
    headerMetaChip: {
      minHeight: 28,
      maxWidth: "100%",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    headerMetaChipSuccess: {
      borderColor: theme.mode === "dark" ? "#2f7054" : "#bfe7cf",
      backgroundColor: theme.mode === "dark" ? "#123a2a" : "#edf9f1",
    },
    headerMetaChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
      flexShrink: 1,
    },
    headerMetaChipSuccessText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
    },
    createFormShell: {
      minHeight: 0,
      flex: 1,
      gap: 0,
    },
    createFormHeaderDock: {
      gap: theme.spacing.xs,
      paddingTop: theme.spacing.xs,
      paddingHorizontal: 2,
      paddingBottom: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: "transparent",
    },
    actionList: {
      gap: theme.spacing.sm,
    },
    launchHighlightsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    launchHighlightCard: {
      flexGrow: 1,
      minWidth: isTablet ? 160 : 140,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.mode === "dark" ? "#123149" : "#f3faff",
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 4,
    },
    launchHighlightIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    launchHighlightLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
      textTransform: "uppercase",
      letterSpacing: 0.25,
    },
    launchHighlightValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      lineHeight: 16,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 18,
    },
    stepLegendRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    stepLegendChip: {
      flex: 1,
      minWidth: 86,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 8,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    stepLegendChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    stepLegendChipDone: {
      borderColor: theme.mode === "dark" ? "#2f7054" : "#bfe7cf",
      backgroundColor: theme.mode === "dark" ? "#123a2a" : "#edf9f1",
    },
    stepLegendNumberWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    stepLegendNumberWrapActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.surface,
    },
    stepLegendNumberWrapDone: {
      borderColor: theme.colors.success,
      backgroundColor: theme.colors.success,
    },
    stepLegendNumber: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      lineHeight: 12,
    },
    stepLegendNumberActive: {
      color: theme.colors.info,
    },
    stepLegendNumberDone: {
      color: theme.colors.primaryContrast,
    },
    stepLegendLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
      flexShrink: 1,
    },
    stepLegendLabelActive: {
      color: theme.colors.info,
    },
    stepLegendLabelDone: {
      color: theme.colors.success,
    },
    stepModeBanner: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#11334d" : "#eef7ff",
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    stepModeBannerText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 16,
    },
    panelBody: {
      gap: theme.spacing.sm,
    },
    panelBodyScroll: {
      flex: 1,
      marginTop: theme.spacing.sm,
    },
    panelBodyScrollContent: {
      paddingBottom: theme.spacing.lg,
    },
    createFormFooterDock: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
      paddingTop: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(47,80,111,0.62)" : "rgba(208,224,238,0.9)",
      borderRadius: theme.radii.lg,
      backgroundColor: theme.mode === "dark" ? "rgba(12,31,47,0.9)" : "rgba(255,255,255,0.94)",
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.1 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    panelFooterHintBox: {
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "rgba(57,39,10,0.55)" : "rgba(255,247,230,0.88)",
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    panelFooterHint: {
      flex: 1,
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 15,
    },
    panelFooterActions: {
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-end",
      gap: theme.spacing.sm,
    },
    panelFooterActionsReview: {
      gap: theme.spacing.md,
    },
    panelFooterActionItemSecondary: {
      flexGrow: 0,
      flexShrink: 0,
      minWidth: isTablet ? 148 : 112,
      maxWidth: isTablet ? 176 : 132,
    },
    panelFooterActionItemPrimary: {
      flex: 1,
    },
    footerSecondaryButton: {
      minHeight: isTablet ? 54 : 50,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(53,86,113,0.82)" : "rgba(212,227,241,0.96)",
      backgroundColor: theme.mode === "dark" ? "rgba(17,43,65,0.92)" : "rgba(247,251,255,0.96)",
      paddingHorizontal: isTablet ? 16 : 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    footerSecondaryButtonPressed: {
      opacity: 0.9,
      transform: [{ translateY: 1 }, { scale: 0.992 }],
    },
    footerSecondaryTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 14 : 13.5,
      lineHeight: isTablet ? 17 : 16,
    },
    footerPrimaryButton: {
      minHeight: isTablet ? 54 : 50,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#55c4ff" : "#1396c7",
      backgroundColor: theme.colors.primaryStrong,
      paddingHorizontal: isTablet ? 18 : 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: theme.mode === "dark" ? "#031824" : theme.colors.primaryStrong,
      shadowOpacity: theme.mode === "dark" ? 0.24 : 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    footerPrimaryButtonDisabled: {
      backgroundColor: theme.mode === "dark" ? "#2a627e" : "#8fc8dc",
      borderColor: theme.mode === "dark" ? "#3b7592" : "#a3d1e1",
      shadowOpacity: 0,
      elevation: 0,
    },
    footerPrimaryButtonPressed: {
      transform: [{ translateY: 1 }, { scale: 0.995 }],
    },
    footerPrimaryTitle: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 15 : 14,
      lineHeight: isTablet ? 18 : 16,
    },
    footerPrimaryTitleDisabled: {
      color: theme.mode === "dark" ? "rgba(3,24,36,0.82)" : "rgba(255,255,255,0.86)",
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
      fontSize: 15,
      lineHeight: 19,
    },
    customerStepLeadSubtitleCompact: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
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
      fontSize: 13,
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
      fontSize: 15,
      lineHeight: 18,
    },
    stepHeaderSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
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
      fontSize: 13,
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
      fontSize: isTablet ? 16 : 15,
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
      fontSize: 13,
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
      fontSize: 13,
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
      fontSize: isTablet ? 16 : 15,
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
      fontSize: 13,
      lineHeight: 15,
    },
    customerFilterChipTextActive: {
      color: theme.colors.info,
    },
    customerCountText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
      paddingBottom: 2,
    },
    customerListSeparator: {
      height: 5,
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
      fontSize: 14,
      lineHeight: 18,
    },
    customerItemMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 16,
    },
    customerItemAddress: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    customerItemAddressMuted: {
      color: theme.colors.textMuted,
    },
    customerItemDetail: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    customerItemNote: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    selectedCustomerCard: {
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 9,
      gap: 8,
    },
    selectedCustomerHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    selectedCustomerTagRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    selectedCustomerTag: {
      minHeight: 28,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 9,
      paddingVertical: 5,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    selectedCustomerTagWarning: {
      borderColor: theme.mode === "dark" ? "#8b6330" : "#f4d39b",
      backgroundColor: theme.mode === "dark" ? "#3b2a18" : "#fff7e8",
    },
    selectedCustomerTagText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
    },
    selectedCustomerTagWarningText: {
      color: theme.colors.warning,
    },
    selectedCustomerBadge: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    selectedCustomerInfoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
    },
    selectedCustomerInfoIconWrap: {
      width: 23,
      height: 23,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    selectedCustomerDetailValue: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    selectedCustomerDetailValueMuted: {
      color: theme.colors.textMuted,
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
      fontSize: 13,
      lineHeight: 16,
    },
    deliveryModeValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
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
      fontSize: 12,
      lineHeight: 14,
    },
    deliveryModeOptionTextActive: {
      color: theme.colors.info,
    },
    deliveryModeHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    deliveryScheduleGrid: {
      gap: 8,
    },
    deliveryScheduleCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 5,
    },
    deliveryScheduleLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 15,
    },
    deliveryScheduleAddress: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 15,
    },
    deliveryScheduleAddressMuted: {
      color: theme.colors.textMuted,
    },
    deliveryScheduleActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    deliverySchedulePickerButton: {
      flex: 1,
      minHeight: 38,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    deliverySchedulePickerValue: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 16,
    },
    deliverySchedulePickerPlaceholder: {
      color: theme.colors.textMuted,
    },
    deliveryScheduleClearButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
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
      fontSize: 14,
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
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    customerInsightValue: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
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
      fontSize: 14,
      lineHeight: 17,
    },
    customerMetricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    customerInsightHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
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
      fontSize: 15,
      lineHeight: 19,
    },
    serviceGroupCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
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
      fontSize: 13,
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
    serviceGroupPickerLead: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    serviceGroupPickerIconWrap: {
      width: 30,
      height: 30,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    serviceGroupPickerMain: {
      flex: 1,
      gap: 3,
    },
    serviceGroupPickerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    serviceGroupPickerMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    serviceGroupPickerMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    serviceGroupPickerCountBadge: {
      minHeight: 22,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    serviceGroupPickerCountBadgeActive: {
      borderColor: theme.mode === "dark" ? "rgba(28,211,226,0.42)" : "rgba(42,124,226,0.28)",
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.12)" : "rgba(42,124,226,0.12)",
    },
    serviceGroupPickerCountBadgeText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 13,
    },
    serviceGroupPickerCountBadgeTextActive: {
      color: theme.colors.info,
    },
    serviceSearchResultsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: 2,
    },
    serviceSearchResultsTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    serviceSearchResultsMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    serviceSearchResultItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    serviceSearchResultItemSelected: {
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    serviceSearchResultLead: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    serviceSearchResultIconWrap: {
      width: 32,
      height: 32,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    serviceSearchResultMain: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    serviceSearchResultName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    serviceSearchResultMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    serviceSearchResultPrice: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    serviceSearchResultGroupBadge: {
      minHeight: 22,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      maxWidth: isTablet ? 220 : 170,
    },
    serviceSearchResultGroupBadgeText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 13,
      flexShrink: 1,
    },
    serviceSearchResultStateBadge: {
      minHeight: 22,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(222,180,67,0.16)" : "rgba(191,138,26,0.12)",
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    serviceSearchResultStateBadgeActive: {
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.16)" : "rgba(42,124,226,0.12)",
    },
    serviceSearchResultStateBadgeText: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 13,
    },
    serviceSearchResultStateBadgeTextActive: {
      color: theme.colors.info,
    },
    activeGroupBar: {
      gap: 6,
    },
    activeGroupBackLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      minHeight: 28,
      paddingRight: 4,
      paddingVertical: 2,
    },
    activeGroupBackLinkText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 15,
    },
    activeGroupSwitchRow: {
      gap: 8,
      paddingTop: 2,
      paddingRight: 2,
    },
    activeGroupSwitchChip: {
      minHeight: 34,
      maxWidth: isTablet ? 240 : 208,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingLeft: 12,
      paddingRight: 8,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    activeGroupSwitchChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    activeGroupSwitchLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      lineHeight: 15,
      flexShrink: 1,
    },
    activeGroupSwitchLabelActive: {
      color: theme.colors.info,
    },
    activeGroupSwitchBadge: {
      minHeight: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
      flexShrink: 0,
    },
    activeGroupSwitchBadgeSelected: {
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.12)" : "rgba(42,124,226,0.12)",
    },
    activeGroupSwitchBadgeActive: {
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.2)" : "rgba(42,124,226,0.18)",
    },
    activeGroupSwitchBadgeText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 13,
    },
    activeGroupSwitchBadgeTextSelected: {
      color: theme.colors.info,
    },
    activeGroupSwitchBadgeTextActive: {
      color: theme.colors.info,
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
    servicePickerBlockHighlighted: {
      borderColor: theme.colors.info,
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.12)" : "rgba(42,124,226,0.08)",
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
    servicePickerLead: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    servicePickerIconWrap: {
      width: 30,
      height: 30,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    servicePickerIconWrapSelected: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    servicePickerMain: {
      flex: 1,
      gap: 1,
    },
    servicePickerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    servicePickerMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
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
      fontSize: 13,
      lineHeight: 15,
    },
    serviceQtyHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 15,
    },
    serviceQtyErrorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
      fontSize: 15,
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
      fontSize: 15,
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
      fontSize: isTablet ? 16 : 15,
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
      fontSize: 13,
      lineHeight: 15,
    },
    summaryHeroRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    summaryHeroTextWrap: {
      flex: 1,
      gap: 2,
    },
    summaryHeroEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
      textTransform: "uppercase",
      letterSpacing: 0.25,
    },
    summaryHeroHeadline: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 19,
    },
    summaryTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
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
      fontSize: 14,
      lineHeight: 17,
    },
    reviewCustomerPhone: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    reviewCustomerMethod: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
    },
    reviewScheduleStack: {
      gap: 3,
      paddingTop: 4,
    },
    reviewScheduleText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 15,
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
      fontSize: 14,
      lineHeight: 17,
    },
    summaryItemSubtotal: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    summaryItemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    reviewActionButtonsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 9,
    },
    reviewActionButton: {
      flexGrow: 1,
      flexBasis: isTablet ? 0 : 110,
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.07,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation: 2,
    },
    reviewActionButtonActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
      shadowOpacity: theme.mode === "dark" ? 0.28 : 0.12,
      elevation: 4,
    },
    reviewActionButtonPressed: {
      opacity: 0.95,
      transform: [{ scale: 0.985 }],
    },
    reviewActionButtonTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    reviewActionButtonMeta: {
      marginTop: 3,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 13,
      textAlign: "center",
    },
    reviewActionButtonMetaActive: {
      color: theme.colors.info,
    },
    reviewActionButtonLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    reviewActionButtonIconBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "#ecf3fb",
    },
    reviewActionButtonIconBadgeActive: {
      backgroundColor: theme.mode === "dark" ? "rgba(138,199,255,0.24)" : "#d8ecff",
    },
    reviewActionButtonLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 17,
    },
    reviewActionButtonLabelActive: {
      color: theme.colors.info,
    },
    reviewSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    reviewSectionValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    reviewPaymentModeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    reviewPaymentChip: {
      flex: 1,
      minHeight: 40,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    reviewPaymentChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    reviewPaymentChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 16,
    },
    reviewPaymentChipTextActive: {
      color: theme.colors.info,
    },
    reviewPromoBlock: {
      gap: 5,
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
    reviewPromoSelectableRow: {
      minHeight: 48,
    },
    reviewPromoRowActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    reviewPromoRowMain: {
      flex: 1,
      gap: 1,
    },
    reviewPromoSelectionRight: {
      alignItems: "flex-end",
      gap: 4,
    },
    reviewPromoName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 16,
    },
    reviewPromoMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    reviewPromoValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    reviewPromoValueMuted: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    reviewPromoStateText: {
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 13,
    },
    reviewPromoStateTextActive: {
      color: theme.colors.info,
    },
    reviewPromoStateTextMuted: {
      color: theme.colors.textMuted,
    },
    reviewPromoEligibilityText: {
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 13,
    },
    reviewPromoEligibilityTextEligible: {
      color: theme.mode === "dark" ? "#7de7b6" : "#1f9e63",
    },
    reviewPromoEligibilityTextPending: {
      color: theme.colors.textMuted,
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
      fontSize: 12,
      lineHeight: 14,
    },
    reviewPromoChipTextActive: {
      color: theme.colors.info,
    },
    reviewPromoHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
    reviewDiscountModeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    reviewAmountLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 14,
    },
    reviewAmountInput: {
      minHeight: 42,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      backgroundColor: theme.colors.surface,
      borderColor: theme.mode === "dark" ? "#3b6284" : "#b5d1e8",
    },
    reviewAmountHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 14,
    },
    reviewFieldError: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 15,
    },
    reviewNotesInput: {
      minHeight: 54,
      paddingHorizontal: 10,
      paddingVertical: 8,
      textAlignVertical: "top",
      backgroundColor: theme.colors.surface,
      borderColor: theme.mode === "dark" ? "#3b6284" : "#b5d1e8",
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
      fontSize: 14,
      lineHeight: 17,
    },
    summaryTextMuted: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 16,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    summaryDueValue: {
      color: theme.colors.warning,
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
      fontSize: 15,
    },
    summaryTotalValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 15,
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
    footerCompact: {
      paddingTop: theme.spacing.xs,
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
    footerMetaHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    footerDisabledHint: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 15,
    },
    footerMetaValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    footerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    footerActionsReview: {
      gap: theme.spacing.sm,
    },
    footerActionsCompact: {
      justifyContent: "flex-end",
    },
    footerActionItem: {
      flex: 1,
    },
    footerActionPrimaryCompact: {
      flex: 1,
    },
    scheduleModalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.mode === "dark" ? "rgba(4, 10, 20, 0.78)" : "rgba(9, 16, 29, 0.4)",
      paddingHorizontal: contentHorizontal,
    },
    scheduleModalCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.xl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isTablet ? 18 : 15,
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: theme.mode === "dark" ? 0.42 : 0.18,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 20,
      elevation: 16,
    },
    scheduleModalHandle: {
      alignSelf: "center",
      width: 42,
      height: 4,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "#35506a" : "#d3e4f4",
      marginBottom: 2,
    },
    scheduleModalTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 16,
      lineHeight: 21,
    },
    scheduleModalHint: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 17,
    },
    scheduleModalSection: {
      gap: 7,
    },
    scheduleModalSectionTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    scheduleOptionRow: {
      gap: 8,
      paddingRight: theme.spacing.md,
    },
    scheduleOptionChip: {
      minWidth: 74,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    scheduleOptionChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    scheduleOptionChipTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    scheduleOptionChipTitleActive: {
      color: theme.colors.info,
    },
    scheduleOptionChipMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    scheduleOptionChipMetaActive: {
      color: theme.colors.info,
    },
    scheduleModalActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingTop: 4,
    },
    scheduleModalGhostButton: {
      flex: 1,
      minHeight: 42,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    scheduleModalGhostButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    scheduleModalPrimaryButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primaryStrong,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    scheduleModalPrimaryButtonText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    exitModalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.mode === "dark" ? "rgba(4, 10, 20, 0.78)" : "rgba(9, 16, 29, 0.4)",
      paddingHorizontal: contentHorizontal,
    },
    exitModalCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.xl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isTablet ? 18 : 15,
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: theme.mode === "dark" ? 0.42 : 0.18,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 20,
      elevation: 16,
    },
    exitModalHandle: {
      alignSelf: "center",
      width: 42,
      height: 4,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "#35506a" : "#d3e4f4",
      marginBottom: 2,
    },
    exitModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    exitModalIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    exitModalTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 16,
      lineHeight: 21,
    },
    exitModalBody: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 18,
    },
    exitModalPrimaryActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    exitModalDangerCta: {
      flex: 1,
      minHeight: 44,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#7a3647" : "#f0bbc5",
      backgroundColor: theme.mode === "dark" ? "#412633" : "#fff1f4",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 10,
    },
    exitModalDangerCtaText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    exitModalPrimaryCta: {
      flex: 1,
      minHeight: 44,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.primaryStrong,
      backgroundColor: theme.colors.primaryStrong,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 10,
    },
    exitModalPrimaryCtaDisabled: {
      opacity: 0.46,
    },
    exitModalPrimaryCtaText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    exitModalGhostCta: {
      minHeight: 40,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.78)",
    },
    exitModalGhostCtaText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.3,
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
      fontSize: 14,
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
      fontSize: 14,
      lineHeight: 18,
    },
  });
}
