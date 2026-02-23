import { Ionicons } from "@expo/vector-icons";
import type { NavigationProp, RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { listCustomers } from "../../features/customers/customerApi";
import { formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { createOrder, listOrders } from "../../features/orders/orderApi";
import { listServices } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { Customer } from "../../types/customer";
import type { OrderSummary } from "../../types/order";
import type { ServiceCatalogItem } from "../../types/service";

type Step = "customer" | "services" | "review";
type Direction = -1 | 1;

const STEP_ORDER: Step[] = ["customer", "services", "review"];
const CUSTOMER_LIMIT = 100;
const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
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
  const footerBottomPadding = Math.max(insets.bottom, isCompactLandscape ? theme.spacing.xs : theme.spacing.sm);

  const navigation = useNavigation<NavigationProp<AppTabParamList>>();
  const route = useRoute<RouteProp<AppTabParamList, "QuickActionTab">>();
  const { session, selectedOutlet, refreshSession } = useSession();

  const roles = session?.roles ?? [];
  const canCreateOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [step, setStep] = useState<Step>("customer");

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceKeyword, setServiceKeyword] = useState("");
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerOrdersPreview, setCustomerOrdersPreview] = useState<OrderSummary[]>([]);
  const [loadingCustomerOrdersPreview, setLoadingCustomerOrdersPreview] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOutlet || !canCreateOrder) {
      setServices([]);
      setLoadingServices(false);
      return;
    }

    void loadServices(true);
  }, [selectedOutlet?.id, canCreateOrder]);

  useEffect(() => {
    if (!route.params?.openCreateStamp || !canCreateOrder) {
      return;
    }

    openCreateFlow();
  }, [route.params?.openCreateStamp, canCreateOrder]);

  async function loadServices(forceRefresh = false): Promise<void> {
    if (!selectedOutlet) {
      setLoadingServices(false);
      return;
    }

    setLoadingServices(true);
    try {
      const data = await listServices({
        outletId: selectedOutlet.id,
        active: true,
        serviceType: ["regular", "package"],
        isGroup: false,
        forceRefresh,
      });
      setServices(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingServices(false);
    }
  }

  async function loadCustomers(forceRefresh = false): Promise<void> {
    setLoadingCustomers(true);
    try {
      const data = await listCustomers({
        limit: CUSTOMER_LIMIT,
        fetchAll: true,
        forceRefresh,
      });
      setCustomers(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingCustomers(false);
    }
  }

  function resetDraft(): void {
    setStep("customer");
    setServiceKeyword("");
    setMetrics({});
    setCustomerKeyword("");
    setSelectedCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setCustomerOrdersPreview([]);
    setLoadingCustomerOrdersPreview(false);
    setShippingFeeInput("");
    setDiscountInput("");
    setOrderNotes("");
  }

  function openCreateFlow(): void {
    resetDraft();
    setShowCreateForm(true);
    setErrorMessage(null);
    setActionMessage(null);

    if (customers.length === 0 && !loadingCustomers) {
      void loadCustomers();
    }
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

  function handleSelectCustomer(customer: Customer): void {
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
  const filteredCustomers = useMemo(() => {
    const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
    const keyword = customerKeyword.trim().toLowerCase();

    if (!keyword) {
      return sorted;
    }

    return sorted.filter((item) => {
      const profile = parseCustomerProfileMeta(item.notes);
      const haystack = `${item.name} ${item.phone_normalized} ${profile.note} ${profile.address}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [customers, customerKeyword]);

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

  const filteredServices = useMemo(() => {
    const keyword = serviceKeyword.trim().toLowerCase();
    if (!keyword) {
      return services;
    }

    return services.filter((service) => service.name.toLowerCase().includes(keyword));
  }, [services, serviceKeyword]);

  const selectedLines = useMemo(() => {
    return services
      .map((service) => {
        const metricValue = parseMetricInput(metrics[service.id] ?? "");
        const hasValidMetric = Number.isFinite(metricValue) && metricValue > 0;
        return {
          service,
          metricValue,
          hasValidMetric,
          subtotal: hasValidMetric ? Math.round(metricValue * (service.effective_price_amount ?? 0)) : 0,
        };
      })
      .filter((line) => line.hasValidMetric);
  }, [metrics, services]);

  const subtotal = useMemo(() => selectedLines.reduce((sum, line) => sum + line.subtotal, 0), [selectedLines]);

  const shippingFee = useMemo(() => {
    const parsed = Number.parseInt(shippingFeeInput.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [shippingFeeInput]);

  const discountAmount = useMemo(() => {
    const parsed = Number.parseInt(discountInput.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [discountInput]);

  const total = useMemo(() => Math.max(subtotal + shippingFee - discountAmount, 0), [subtotal, shippingFee, discountAmount]);

  const canCustomerNext = selectedCustomerId !== null;
  const canServicesNext = selectedLines.length > 0;

  function nextStep(): void {
    if (step === "customer") {
      if (!canCustomerNext) {
        setErrorMessage("Pilih konsumen dari daftar terlebih dulu.");
        return;
      }
      setStep("services");
      setErrorMessage(null);
      return;
    }

    if (step === "services") {
      if (!canServicesNext) {
        setErrorMessage("Pilih minimal satu layanan dengan qty/berat > 0.");
        return;
      }
      setStep("review");
      setErrorMessage(null);
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
      setStep("customer");
      setErrorMessage(null);
      return;
    }

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
      setErrorMessage("Pilih minimal satu layanan dengan qty/berat > 0.");
      setStep("services");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const created = await createOrder({
        outletId: selectedOutlet.id,
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
        shippingFeeAmount: shippingFee,
        discountAmount,
        notes: orderNotes,
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
    step === "customer" ? !canCustomerNext : step === "services" ? !canServicesNext : submitting || selectedLines.length === 0;

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const stepProgressPercent = ((currentStepIndex + 1) / STEP_ORDER.length) * 100;

  return (
    <AppScreen scroll={false}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={[styles.content, showCreateForm ? styles.contentWithFooter : null]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll}>
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
              {loadingServices ? (
                <View style={styles.skeletonWrap}>
                  <AppSkeletonBlock height={11} width="44%" />
                  <AppSkeletonBlock height={11} width="71%" />
                </View>
              ) : null}
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
                  <View style={styles.stepHeader}>
                    <View style={styles.stepHeaderIconWrap}>
                      <Ionicons color={theme.colors.info} name="people-outline" size={16} />
                    </View>
                    <View style={styles.stepHeaderTextWrap}>
                      <Text style={styles.stepHeaderTitle}>Data Konsumen</Text>
                      <Text style={styles.stepHeaderSubtitle}>Pilih konsumen dari daftar pelanggan.</Text>
                    </View>
                  </View>

                  <View style={styles.inlineActions}>
                    {selectedCustomer ? (
                      <Pressable onPress={handleReplaceSelectedCustomer} style={({ pressed }) => [styles.inlineAction, styles.inlineActionSingle, pressed ? styles.pressed : null]}>
                        <Ionicons color={theme.colors.info} name="swap-horizontal-outline" size={15} />
                        <Text style={styles.inlineActionText}>Ganti konsumen</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => void loadCustomers(true)} style={({ pressed }) => [styles.inlineAction, pressed ? styles.pressed : null]}>
                        <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={15} />
                        <Text style={styles.inlineActionText}>Muat ulang</Text>
                      </Pressable>
                    )}
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
                      <TextInput
                        onChangeText={setCustomerKeyword}
                        placeholder="Cari nama atau nomor"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.input}
                        value={customerKeyword}
                      />
                      {loadingCustomers ? (
                        <View style={styles.skeletonWrap}>
                          <AppSkeletonBlock height={11} width="52%" />
                          <AppSkeletonBlock height={11} width="70%" />
                        </View>
                      ) : filteredCustomers.length > 0 ? (
                        <ScrollView contentContainerStyle={styles.customerListContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.customerList}>
                          {filteredCustomers.map((customer) => {
                            const isSelected = customer.id === selectedCustomerId;
                            const profile = parseCustomerProfileMeta(customer.notes);
                            const address = profile.address.trim();
                            const email = profile.email.trim();
                            const note = profile.note.trim();
                            const gender = mapGenderLabel(profile.gender);
                            return (
                              <Pressable
                                key={customer.id}
                                onPress={() => handleSelectCustomer(customer)}
                                style={({ pressed }) => [styles.customerItem, isSelected ? styles.customerItemActive : null, pressed ? styles.pressed : null]}
                              >
                                <View style={styles.customerItemMain}>
                                  <Text numberOfLines={1} style={styles.customerItemName}>
                                    {customer.name}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.customerItemAddress, !address ? styles.customerItemAddressMuted : null]}>
                                    {address || "Alamat belum diisi"}
                                  </Text>
                                  {isSelected ? (
                                    <>
                                      <Text numberOfLines={1} style={styles.customerItemMeta}>
                                        {formatCustomerPhoneDisplay(customer.phone_normalized)}
                                      </Text>
                                      {email ? (
                                        <Text numberOfLines={1} style={styles.customerItemDetail}>
                                          {email}
                                        </Text>
                                      ) : null}
                                      {gender ? (
                                        <Text numberOfLines={1} style={styles.customerItemDetail}>
                                          {gender}
                                        </Text>
                                      ) : null}
                                      {note ? (
                                        <Text numberOfLines={1} style={styles.customerItemNote}>
                                          {note}
                                        </Text>
                                      ) : null}
                                    </>
                                  ) : null}
                                </View>
                                <Ionicons color={isSelected ? theme.colors.info : theme.colors.textMuted} name={isSelected ? "checkmark-circle" : "chevron-forward"} size={16} />
                              </Pressable>
                            );
                          })}
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
                  <View style={styles.stepHeader}>
                    <View style={styles.stepHeaderIconWrap}>
                      <Ionicons color={theme.colors.info} name="pricetag-outline" size={16} />
                    </View>
                    <View style={styles.stepHeaderTextWrap}>
                      <Text style={styles.stepHeaderTitle}>Pilih Layanan</Text>
                      <Text style={styles.stepHeaderSubtitle}>Isi qty/berat untuk layanan yang dipilih.</Text>
                    </View>
                  </View>

                  <TextInput onChangeText={setServiceKeyword} placeholder="Cari layanan" placeholderTextColor={theme.colors.textMuted} style={styles.input} value={serviceKeyword} />
                  {filteredServices.map((service) => {
                    const metricRaw = metrics[service.id] ?? "";
                    const metricValue = parseMetricInput(metricRaw);
                    const active = Number.isFinite(metricValue) && metricValue > 0;

                    return (
                      <View key={service.id} style={[styles.serviceCard, active ? styles.serviceCardActive : null]}>
                        <View style={styles.serviceHeader}>
                          <View style={styles.serviceInfo}>
                            <Text numberOfLines={1} style={styles.serviceName}>
                              {service.name}
                            </Text>
                            <View style={styles.serviceMetaRow}>
                              <Text style={styles.serviceMeta}>
                                {formatMoney(service.effective_price_amount)} / {service.unit_type.toUpperCase()}
                              </Text>
                              {active ? (
                                <View style={styles.serviceSelectedPill}>
                                  <Text style={styles.serviceSelectedPillText}>Dipilih</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          <View style={styles.stepperRow}>
                            <Pressable onPress={() => stepMetric(service, -1)} style={({ pressed }) => [styles.stepperButton, pressed ? styles.pressed : null]}>
                              <Text style={styles.stepperButtonText}>-</Text>
                            </Pressable>
                            <TextInput
                              keyboardType="numeric"
                              onChangeText={(value) => updateMetric(service.id, value)}
                              placeholder={isKgUnit(service.unit_type) ? "KG" : "QTY"}
                              placeholderTextColor={theme.colors.textMuted}
                              style={styles.metricInput}
                              value={metricRaw}
                            />
                            <Pressable onPress={() => stepMetric(service, 1)} style={({ pressed }) => [styles.stepperButton, pressed ? styles.pressed : null]}>
                              <Text style={styles.stepperButtonText}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                        {active ? <Text style={styles.serviceSubtotal}>Subtotal: {formatMoney(Math.round(metricValue * service.effective_price_amount))}</Text> : null}
                      </View>
                    );
                  })}
                  <View style={styles.metaBar}>
                    <View style={styles.metaLeft}>
                      <Text style={styles.metaLabel}>Subtotal layanan</Text>
                      <Text style={styles.metaHint}>{selectedLines.length} layanan dipilih</Text>
                    </View>
                    <Text style={styles.metaValue}>{formatMoney(subtotal)}</Text>
                  </View>
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
                    <Text style={styles.summaryTitle}>Konsumen</Text>
                    <Text style={styles.summaryText}>{customerName || "-"}</Text>
                    <Text style={styles.summaryTextMuted}>{customerPhone || "-"}</Text>
                  </AppPanel>

                  <AppPanel style={styles.summaryPanel}>
                    <Text style={styles.summaryTitle}>Item Layanan</Text>
                    {selectedLines.map((line) => (
                      <View key={line.service.id} style={styles.summaryRow}>
                        <Text style={styles.summaryText}>
                          {line.service.name} ({line.metricValue} {line.service.unit_type})
                        </Text>
                        <Text style={styles.summaryValue}>{formatMoney(line.subtotal)}</Text>
                      </View>
                    ))}
                  </AppPanel>

                  <TextInput keyboardType="numeric" onChangeText={setShippingFeeInput} placeholder="Ongkir (opsional)" placeholderTextColor={theme.colors.textMuted} style={styles.input} value={shippingFeeInput} />
                  <TextInput keyboardType="numeric" onChangeText={setDiscountInput} placeholder="Diskon (opsional)" placeholderTextColor={theme.colors.textMuted} style={styles.input} value={discountInput} />
                  <TextInput multiline onChangeText={setOrderNotes} placeholder="Catatan order (opsional)" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.notesInput]} value={orderNotes} />

                  <AppPanel style={styles.summaryPanel}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Subtotal</Text>
                      <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Ongkir</Text>
                      <Text style={styles.summaryValue}>{formatMoney(shippingFee)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Diskon</Text>
                      <Text style={styles.summaryValue}>- {formatMoney(discountAmount)}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryTotal}>Total Estimasi</Text>
                      <Text style={styles.summaryTotalValue}>{formatMoney(total)}</Text>
                    </View>
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

        {showCreateForm ? (
          <View style={[styles.footer, { paddingBottom: footerBottomPadding }]}>
            <View style={styles.footerMetaRow}>
              <View style={styles.footerMetaLeft}>
                <Text style={styles.footerMetaText}>Langkah {currentStepIndex + 1} dari 3</Text>
                <Text style={styles.footerMetaHint}>{selectedLines.length} layanan aktif</Text>
              </View>
              <Text style={styles.footerMetaValue}>{formatMoney(total)}</Text>
            </View>
            <View style={styles.footerActions}>
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
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  const contentHorizontal = isTablet ? theme.spacing.xl : theme.spacing.lg;
  const contentTop = isCompactLandscape ? theme.spacing.md : theme.spacing.lg;

  return StyleSheet.create({
    root: {
      flex: 1,
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
    contentWithFooter: {
      paddingBottom: theme.spacing.xl,
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
      padding: 10,
      gap: theme.spacing.xs,
    },
    customerList: {
      maxHeight: isTablet ? 300 : 220,
    },
    customerListContent: {
      gap: 6,
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
      paddingHorizontal: 11,
      paddingVertical: 9,
      gap: 2,
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
    serviceCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 6,
    },
    serviceCardActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    serviceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    serviceInfo: {
      flex: 1,
      gap: 1,
    },
    serviceName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 18,
    },
    serviceMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    serviceMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    serviceSelectedPill: {
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    serviceSelectedPillText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    serviceSubtotal: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 16,
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    stepperButton: {
      width: 30,
      height: 30,
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
      minWidth: 64,
      maxWidth: 78,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textAlign: "center",
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    metaBar: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    metaLeft: {
      flex: 1,
      gap: 1,
    },
    metaLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    metaHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    metaValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 12.5,
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
    notesInput: {
      minHeight: isTablet ? 84 : 72,
      textAlignVertical: "top",
    },
    skeletonWrap: {
      gap: 6,
      marginTop: 2,
    },
    summaryPanel: {
      gap: 6,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    summaryTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
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
    footer: {
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
