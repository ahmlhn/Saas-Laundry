import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { extractCustomerPhoneDigits } from "../../features/customers/customerPhone";
import { addOrderPayment, getOrderDetail, updateCourierStatus, updateLaundryStatus } from "../../features/orders/orderApi";
import { buildOrderReceiptText, buildOrderWhatsAppMessage } from "../../features/orders/orderReceipt";
import { formatStatusLabel, getNextCourierStatus, getNextLaundryStatus, resolveCourierTone, resolveLaundryTone } from "../../features/orders/orderStatus";
import { isWaPlanEligible } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { OrdersStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrderDetail">;
type DetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;
type PaymentMethodType = "cash" | "transfer" | "other";

interface PaymentMethodOption {
  value: PaymentMethodType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const MAX_MONEY_INPUT_DIGITS = 9;
const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { value: "cash", label: "Tunai", icon: "cash-outline" },
  { value: "transfer", label: "Transfer", icon: "card-outline" },
  { value: "other", label: "Lainnya", icon: "wallet-outline" },
];

const currencyFormatter = new Intl.NumberFormat("id-ID");

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function formatItemMetric(weightKg: string | number | null, qty: string | number | null, unitType: string): string {
  if (unitType === "kg") {
    return `${weightKg ?? 0} kg`;
  }
  return `${qty ?? 0} pcs`;
}

function hasAnyRole(roles: string[], allowList: string[]): boolean {
  return roles.some((role) => allowList.includes(role));
}

export function OrderDetailScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const route = useRoute<DetailRoute>();
  const { session, selectedOutlet } = useSession();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingLaundry, setUpdatingLaundry] = useState(false);
  const [updatingCourier, setUpdatingCourier] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [paymentMethodType, setPaymentMethodType] = useState<PaymentMethodType>("cash");
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [sharingProductionReceipt, setSharingProductionReceipt] = useState(false);
  const [sharingCustomerReceipt, setSharingCustomerReceipt] = useState(false);
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);

  const roles = session?.roles ?? [];
  const canUpdateLaundry = hasAnyRole(roles, ["owner", "admin", "worker"]);
  const canUpdateCourier = hasAnyRole(roles, ["owner", "admin", "courier"]);
  const canManagePayment = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const waAutoEligible = isWaPlanEligible(session?.plan.key);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";

  useEffect(() => {
    void loadDetail();
  }, [route.params.orderId, selectedOutlet?.id]);

  useEffect(() => {
    if (!detail) {
      setPaymentAmountInput("");
      return;
    }

    setPaymentAmountInput((current) => {
      const normalizedCurrent = normalizeMoneyInput(current);
      if (normalizedCurrent !== "") {
        return normalizedCurrent;
      }

      if (detail.due_amount <= 0) {
        return "";
      }

      return normalizeMoneyInput(`${detail.due_amount}`);
    });
  }, [detail?.id, detail?.due_amount]);

  async function loadDetail(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await getOrderDetail(route.params.orderId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const nextLaundryStatus = useMemo(() => getNextLaundryStatus(detail?.laundry_status), [detail?.laundry_status]);
  const nextCourierStatus = useMemo(() => {
    const candidate = getNextCourierStatus(detail?.courier_status);
    if (!candidate) {
      return null;
    }

    if (candidate === "delivery_pending" && !["ready", "completed"].includes(detail?.laundry_status ?? "")) {
      return null;
    }

    return candidate;
  }, [detail?.courier_status, detail?.laundry_status]);
  const canShowStatusActions =
    (canUpdateLaundry && Boolean(nextLaundryStatus)) || (canUpdateCourier && Boolean(detail?.is_pickup_delivery) && Boolean(nextCourierStatus));
  const paymentTenderedAmount = useMemo(() => parseMoneyInput(paymentAmountInput), [paymentAmountInput]);
  const paymentAppliedAmount = useMemo(() => {
    if (!detail) {
      return 0;
    }

    return Math.min(paymentTenderedAmount, Math.max(detail.due_amount, 0));
  }, [detail, paymentTenderedAmount]);
  const paymentInputExceededDue = useMemo(() => {
    if (!detail) {
      return false;
    }

    return paymentTenderedAmount > Math.max(detail.due_amount, 0);
  }, [detail, paymentTenderedAmount]);
  const paymentMethodLabel = useMemo(() => PAYMENT_METHOD_OPTIONS.find((item) => item.value === paymentMethodType)?.label ?? "Tunai", [paymentMethodType]);

  async function handleNextLaundry(): Promise<void> {
    if (!detail || !nextLaundryStatus || updatingLaundry) {
      return;
    }

    setUpdatingLaundry(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await updateLaundryStatus({
        orderId: detail.id,
        status: nextLaundryStatus,
      });
      const latest = await getOrderDetail(detail.id);
      setDetail(latest);
      setActionMessage(`Laundry dipindah ke ${formatStatusLabel(nextLaundryStatus)}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUpdatingLaundry(false);
    }
  }

  async function handleNextCourier(): Promise<void> {
    if (!detail || !nextCourierStatus || updatingCourier) {
      return;
    }

    setUpdatingCourier(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await updateCourierStatus({
        orderId: detail.id,
        status: nextCourierStatus,
      });
      const latest = await getOrderDetail(detail.id);
      setDetail(latest);
      setActionMessage(`Kurir dipindah ke ${formatStatusLabel(nextCourierStatus)}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUpdatingCourier(false);
    }
  }

  function handlePaymentAmountChange(value: string): void {
    setPaymentAmountInput(normalizeMoneyInput(value));
    setErrorMessage(null);
    setActionMessage(null);
  }

  async function handleSubmitPayment(): Promise<void> {
    if (!detail || submittingPayment) {
      return;
    }

    if (detail.due_amount <= 0) {
      setErrorMessage("Order sudah lunas.");
      return;
    }

    if (paymentAppliedAmount <= 0) {
      setErrorMessage("Isi nominal bayar terlebih dulu.");
      return;
    }

    setSubmittingPayment(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      await addOrderPayment({
        orderId: detail.id,
        amount: paymentAppliedAmount,
        method: paymentMethodType,
      });

      const latest = await getOrderDetail(detail.id);
      setDetail(latest);

      if (latest.due_amount > 0) {
        setActionMessage(
          `Pembayaran ${formatMoney(paymentAppliedAmount)} tercatat (${paymentMethodLabel}), sisa tagihan ${formatMoney(latest.due_amount)}.`,
        );
      } else {
        setActionMessage(`Pembayaran ${formatMoney(paymentAppliedAmount)} tercatat dan order lunas.`);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleShareReceipt(kind: "production" | "customer"): Promise<void> {
    if (!detail) {
      return;
    }

    const setLoading = kind === "production" ? setSharingProductionReceipt : setSharingCustomerReceipt;

    setLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const receiptText = buildOrderReceiptText({
        kind,
        order: detail,
        outletLabel,
      });
      await Share.share({
        title: kind === "production" ? "Nota Produksi Laundry" : "Nota Konsumen Laundry",
        message: receiptText,
      });

      setActionMessage(
        kind === "production"
          ? "Nota produksi siap dibagikan. Pilih layanan print untuk cetak."
          : "Nota konsumen siap dibagikan. Pilih layanan print untuk cetak.",
      );
    } catch {
      setErrorMessage("Gagal membuka menu cetak atau bagikan nota.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenWhatsApp(): Promise<void> {
    if (!detail || openingWhatsApp) {
      return;
    }

    const customerPhone = extractCustomerPhoneDigits(detail.customer?.phone_normalized ?? "");
    if (!customerPhone) {
      setErrorMessage("Nomor WhatsApp pelanggan belum valid.");
      return;
    }

    setOpeningWhatsApp(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const waMessage = buildOrderWhatsAppMessage(detail, outletLabel);
      const url = `https://wa.me/${customerPhone}?text=${encodeURIComponent(waMessage)}`;
      await Linking.openURL(url);
      setActionMessage("WhatsApp dibuka. Silakan kirim pesannya dari aplikasi WA.");
    } catch {
      setErrorMessage("Gagal membuka WhatsApp di perangkat ini.");
    } finally {
      setOpeningWhatsApp(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Memuat detail order...</Text>
        </View>
      ) : detail ? (
        <View style={styles.stack}>
          <AppPanel style={styles.heroPanel}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
              </Pressable>
              <View style={styles.heroBadge}>
                <Ionicons color={theme.colors.info} name="receipt-outline" size={15} />
                <Text style={styles.heroBadgeText}>Order Detail</Text>
              </View>
              <Pressable onPress={() => void loadDetail()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
              </Pressable>
            </View>
            <Text style={styles.invoiceTitle}>{detail.invoice_no ?? detail.order_code}</Text>
            <Text numberOfLines={1} style={styles.customerText}>
              {detail.customer?.name ?? "-"}
            </Text>
            <Text numberOfLines={1} style={styles.heroMetaText}>
              {outletLabel}
            </Text>

            <View style={styles.statusRow}>
              <StatusPill label={`Laundry: ${formatStatusLabel(detail.laundry_status)}`} tone={resolveLaundryTone(detail.laundry_status)} />
              {detail.is_pickup_delivery ? (
                <StatusPill label={`Kurir: ${formatStatusLabel(detail.courier_status)}`} tone={resolveCourierTone(detail.courier_status)} />
              ) : (
                <StatusPill label="Pickup/Delivery: Tidak" tone="neutral" />
              )}
            </View>

            <View style={styles.heroMetaRow}>
              <Ionicons color={theme.colors.textMuted} name="time-outline" size={14} />
              <Text style={styles.metaText}>Dibuat: {formatDateTime(detail.created_at)}</Text>
            </View>
            <View style={styles.heroMetaRow}>
              <Ionicons color={theme.colors.textMuted} name="sync-outline" size={14} />
              <Text style={styles.metaText}>Terakhir update: {formatDateTime(detail.updated_at)}</Text>
            </View>
          </AppPanel>

          <AppPanel style={styles.summaryPanel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Ringkasan Pembayaran</Text>
              <Ionicons color={theme.colors.info} name="wallet-outline" size={16} />
            </View>
            <View style={styles.paymentStatGrid}>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Total</Text>
                <Text style={styles.paymentStatValue}>{formatMoney(detail.total_amount)}</Text>
              </View>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Sudah Bayar</Text>
                <Text style={styles.paymentStatValue}>{formatMoney(detail.paid_amount)}</Text>
              </View>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Sisa Bayar</Text>
                <Text style={[styles.paymentStatValue, detail.due_amount > 0 ? styles.dueValue : styles.successValue]}>
                  {formatMoney(detail.due_amount)}
                </Text>
              </View>
            </View>
          </AppPanel>

          <AppPanel style={styles.actionPanel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Nota & Notifikasi</Text>
              <Ionicons color={theme.colors.info} name="print-outline" size={16} />
            </View>

            <View style={[styles.actionStack, isTablet || isCompactLandscape ? styles.actionStackWide : null]}>
              <View style={styles.actionButtonWrap}>
                <AppButton
                  disabled={sharingProductionReceipt || sharingCustomerReceipt || openingWhatsApp}
                  leftElement={<Ionicons color={theme.colors.info} name="print-outline" size={17} />}
                  loading={sharingProductionReceipt}
                  onPress={() => void handleShareReceipt("production")}
                  title="Cetak Nota Produksi"
                  variant="secondary"
                />
              </View>
              <View style={styles.actionButtonWrap}>
                <AppButton
                  disabled={sharingProductionReceipt || sharingCustomerReceipt || openingWhatsApp}
                  leftElement={<Ionicons color={theme.colors.info} name="receipt-outline" size={17} />}
                  loading={sharingCustomerReceipt}
                  onPress={() => void handleShareReceipt("customer")}
                  title="Cetak Nota Konsumen"
                  variant="secondary"
                />
              </View>
            </View>

            <AppButton
              disabled={sharingProductionReceipt || sharingCustomerReceipt || openingWhatsApp}
              leftElement={<Ionicons color={theme.colors.textPrimary} name="logo-whatsapp" size={17} />}
              loading={openingWhatsApp}
              onPress={() => void handleOpenWhatsApp()}
              title="Kirim WA Pesanan"
              variant="ghost"
            />
            <Text style={styles.noteHint}>
              {waAutoEligible
                ? "Notifikasi WA order baru diproses otomatis jika provider WA aktif."
                : "Notifikasi WA otomatis tersedia pada plan Premium/Pro."}
            </Text>
          </AppPanel>

          {canManagePayment ? (
            <AppPanel style={styles.actionPanel}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Aksi Pembayaran</Text>
                <Ionicons color={theme.colors.info} name="wallet-outline" size={15} />
              </View>

              {detail.due_amount <= 0 ? (
                <Text style={styles.emptyText}>Order sudah lunas. Tidak ada pembayaran tambahan.</Text>
              ) : (
                <>
                  <Text style={styles.paymentInputLabel}>Nominal Dibayar</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={handlePaymentAmountChange}
                    placeholder="0"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.paymentInput}
                    value={paymentAmountInput}
                  />

                  <View style={styles.quickAmountRow}>
                    <Pressable onPress={() => setPaymentAmountInput(normalizeMoneyInput(`${detail.due_amount}`))} style={({ pressed }) => [styles.quickAmountChip, pressed ? styles.heroIconButtonPressed : null]}>
                      <Text style={styles.quickAmountChipText}>Lunas</Text>
                    </Pressable>
                    <Pressable onPress={() => setPaymentAmountInput(normalizeMoneyInput(`${Math.ceil(detail.due_amount / 2)}`))} style={({ pressed }) => [styles.quickAmountChip, pressed ? styles.heroIconButtonPressed : null]}>
                      <Text style={styles.quickAmountChipText}>50%</Text>
                    </Pressable>
                    <Pressable onPress={() => setPaymentAmountInput("")} style={({ pressed }) => [styles.quickAmountChip, pressed ? styles.heroIconButtonPressed : null]}>
                      <Text style={styles.quickAmountChipText}>Reset</Text>
                    </Pressable>
                  </View>

                  <View style={styles.paymentMethodRow}>
                    {PAYMENT_METHOD_OPTIONS.map((option) => {
                      const active = paymentMethodType === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setPaymentMethodType(option.value)}
                          style={({ pressed }) => [styles.paymentMethodChip, active ? styles.paymentMethodChipActive : null, pressed ? styles.heroIconButtonPressed : null]}
                        >
                          <Ionicons color={active ? theme.colors.info : theme.colors.textMuted} name={option.icon} size={13} />
                          <Text style={[styles.paymentMethodChipText, active ? styles.paymentMethodChipTextActive : null]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.paymentMetaGrid}>
                    <View style={styles.paymentMetaCard}>
                      <Text style={styles.paymentMetaLabel}>Nominal Tercatat</Text>
                      <Text style={styles.paymentMetaValue}>{formatMoney(paymentAppliedAmount)}</Text>
                    </View>
                    <View style={styles.paymentMetaCard}>
                      <Text style={styles.paymentMetaLabel}>Sisa Setelah Bayar</Text>
                      <Text style={[styles.paymentMetaValue, detail.due_amount - paymentAppliedAmount > 0 ? styles.dueValue : styles.successValue]}>
                        {formatMoney(Math.max(detail.due_amount - paymentAppliedAmount, 0))}
                      </Text>
                    </View>
                  </View>

                  {paymentInputExceededDue ? (
                    <Text style={styles.paymentHint}>Nominal di atas sisa tagihan. Sistem hanya akan mencatat maksimal {formatMoney(detail.due_amount)}.</Text>
                  ) : null}

                  <AppButton
                    disabled={submittingPayment || paymentAppliedAmount <= 0}
                    leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
                    loading={submittingPayment}
                    onPress={() => void handleSubmitPayment()}
                    title={`Catat Pembayaran (${paymentMethodLabel})`}
                  />
                </>
              )}
            </AppPanel>
          ) : null}

          {canShowStatusActions ? (
            <AppPanel style={styles.actionPanel}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Quick Action Status</Text>
                <Ionicons color={theme.colors.warning} name="flash-outline" size={16} />
              </View>
              <View style={[styles.actionStack, isTablet || isCompactLandscape ? styles.actionStackWide : null]}>
                {canUpdateLaundry && nextLaundryStatus ? (
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      disabled={updatingLaundry || updatingCourier}
                      leftElement={<Ionicons color={theme.colors.primaryContrast} name="color-wand-outline" size={17} />}
                      loading={updatingLaundry}
                      onPress={() => void handleNextLaundry()}
                      title={updatingLaundry ? "Memproses..." : `Laundry -> ${formatStatusLabel(nextLaundryStatus)}`}
                    />
                  </View>
                ) : null}

                {canUpdateCourier && detail.is_pickup_delivery && nextCourierStatus ? (
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      disabled={updatingLaundry || updatingCourier}
                      leftElement={<Ionicons color={theme.colors.info} name="bicycle-outline" size={17} />}
                      loading={updatingCourier}
                      onPress={() => void handleNextCourier()}
                      title={updatingCourier ? "Memproses..." : `Kurir -> ${formatStatusLabel(nextCourierStatus)}`}
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </View>
            </AppPanel>
          ) : null}

          {detail.items && detail.items.length > 0 ? (
            <AppPanel>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Item Laundry</Text>
                <Ionicons color={theme.colors.info} name="list-outline" size={16} />
              </View>
              <View style={styles.itemList}>
                {detail.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{item.service_name_snapshot}</Text>
                      <Text style={styles.itemMeta}>{formatItemMetric(item.weight_kg, item.qty, item.unit_type_snapshot)}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{formatMoney(item.subtotal_amount)}</Text>
                  </View>
                ))}
              </View>
            </AppPanel>
          ) : null}

          <AppPanel>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Pembayaran</Text>
              <Ionicons color={theme.colors.info} name="card-outline" size={16} />
            </View>
            {detail.payments && detail.payments.length > 0 ? (
              <View style={styles.paymentList}>
                {detail.payments.map((payment) => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View style={styles.paymentMain}>
                      <Text style={styles.paymentMethod}>{payment.method}</Text>
                      <Text style={styles.paymentMeta}>{formatDateTime(payment.paid_at)}</Text>
                    </View>
                    <Text style={styles.paymentAmount}>{formatMoney(payment.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>Belum ada pembayaran.</Text>
            )}
          </AppPanel>

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
        </View>
      ) : (
        <AppPanel style={styles.centeredState}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={20} />
          <Text style={styles.errorText}>Detail order tidak ditemukan.</Text>
          <AppButton
            leftElement={<Ionicons color={theme.colors.textPrimary} name="arrow-back-outline" size={17} />}
            onPress={() => navigation.goBack()}
            title="Kembali"
            variant="ghost"
          />
        </AppPanel>
      )}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    centeredState: {
      minHeight: 220,
      paddingVertical: 50,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    stack: {
      gap: theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.92)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    invoiceTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    customerText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    heroMetaText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    heroMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    summaryPanel: {
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    paymentInputLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      marginTop: 1,
    },
    paymentInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      minHeight: 42,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    quickAmountRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
    },
    quickAmountChip: {
      minHeight: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    quickAmountChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
    },
    paymentMethodRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
    },
    paymentMethodChip: {
      minHeight: 35,
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
    paymentMethodChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    paymentMethodChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 14,
    },
    paymentMethodChipTextActive: {
      color: theme.colors.info,
    },
    paymentMetaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    paymentMetaCard: {
      minWidth: isTablet ? 180 : 145,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "31%" : "48%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 1,
    },
    paymentMetaLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    paymentMetaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    paymentHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    noteHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 17,
    },
    paymentStatGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    paymentStatCard: {
      minWidth: isTablet ? 180 : 140,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "31%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 3,
    },
    paymentStatLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    paymentStatValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
    },
    dueValue: {
      color: theme.colors.danger,
    },
    successValue: {
      color: theme.colors.success,
    },
    actionPanel: {
      gap: theme.spacing.sm,
    },
    actionStack: {
      gap: theme.spacing.xs,
    },
    actionStackWide: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionButtonWrap: {
      flex: 1,
    },
    itemList: {
      gap: theme.spacing.xs,
    },
    itemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSoft,
    },
    itemMain: {
      flex: 1,
      gap: 1,
    },
    itemName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 14 : 13,
    },
    itemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    itemPrice: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
    },
    paymentList: {
      gap: theme.spacing.xs,
    },
    paymentRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSoft,
    },
    paymentMain: {
      flex: 1,
      gap: 1,
    },
    paymentMethod: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 14 : 13,
    },
    paymentMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    paymentAmount: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
    successText: {
      flex: 1,
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
