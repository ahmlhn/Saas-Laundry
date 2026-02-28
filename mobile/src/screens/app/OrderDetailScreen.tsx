import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { extractCustomerPhoneDigits } from "../../features/customers/customerPhone";
import { getOrderDetail, updateCourierStatus, updateLaundryStatus } from "../../features/orders/orderApi";
import { buildOrderReceiptText, buildOrderWhatsAppMessage } from "../../features/orders/orderReceipt";
import { formatStatusLabel, getNextCourierStatus, getNextLaundryStatus, resolveCourierTone, resolveLaundryTone } from "../../features/orders/orderStatus";
import { formatServiceDuration } from "../../features/services/defaultDuration";
import { DEFAULT_PRINTER_NOTE_SETTINGS, getPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { DEFAULT_PRINTER_LOCAL_SETTINGS, getPrinterLocalSettings } from "../../features/settings/printerLocalSettingsStorage";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList, OrdersStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrderDetail">;
type DetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;

const NOTICE_AUTO_HIDE_MS = 4000;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatCompactNumber(value: number): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
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

function parseLooseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function readRecordText(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

interface HistoryEntry {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string | null;
  sortTime: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "info" | "warning" | "success" | "muted";
}

interface EstimatedCompletionInfo {
  label: string;
  hint: string;
  isLate: boolean;
}

function toHistoryTime(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPaymentMethodLabel(value: string | null | undefined): string {
  if (!value) {
    return "Tidak Diketahui";
  }

  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");

  if (normalized === "cash" || normalized === "tunai") {
    return "Tunai";
  }

  if (normalized === "transfer" || normalized === "bank_transfer") {
    return "Transfer";
  }

  if (normalized === "qris") {
    return "QRIS";
  }

  if (normalized === "other" || normalized === "lainnya") {
    return "Lainnya";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDelayLabel(diffMs: number): string {
  const totalMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours} jam ${minutes} menit` : `${hours} jam`;
  }

  return `${Math.max(minutes, 1)} menit`;
}

function formatEstimatedDateTime(value: Date): string {
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(value);
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = String(value.getFullYear());
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${weekday}, ${day}-${month}-${year}, ${hours}.${minutes}`;
}

function formatEstimatedDurationHint(durationDays: number | null | undefined, durationHours: number | null | undefined): string {
  return `Durasi layanan terlama ${formatServiceDuration(durationDays, durationHours, "Belum diatur")}`;
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
  const rootNavigation = navigation.getParent()?.getParent() as NativeStackNavigationProp<AppRootStackParamList> | undefined;
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingLaundry, setUpdatingLaundry] = useState(false);
  const [updatingCourier, setUpdatingCourier] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sharingProductionReceipt, setSharingProductionReceipt] = useState(false);
  const [sharingCustomerReceipt, setSharingCustomerReceipt] = useState(false);
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const contentScrollRef = useRef<ScrollView | null>(null);
  const pendingHistoryFocusRef = useRef(false);

  const roles = session?.roles ?? [];
  const canEditOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canUpdateLaundry = hasAnyRole(roles, ["owner", "admin", "worker"]);
  const canUpdateCourier = hasAnyRole(roles, ["owner", "admin", "courier"]);
  const canManagePayment = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const shouldReturnToOrders = route.params.returnToOrders === true;

  const resetToOrders = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: "OrdersToday" }],
    });
  }, [navigation]);

  const handleBackPress = useCallback(() => {
    if (shouldReturnToOrders) {
      resetToOrders();
      return;
    }

    navigation.goBack();
  }, [navigation, resetToOrders, shouldReturnToOrders]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [route.params.orderId, selectedOutlet?.id])
  );

  useEffect(() => {
    if (!shouldReturnToOrders) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      resetToOrders();
      return true;
    });

    return () => subscription.remove();
  }, [resetToOrders, shouldReturnToOrders]);

  useEffect(() => {
    setShowPaymentSummary(false);
    setShowDeliveryInfo(false);
    setShowHistory(false);
    pendingHistoryFocusRef.current = false;
  }, [detail?.id]);

  useEffect(() => {
    if (!actionMessage && !errorMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setActionMessage(null);
      setErrorMessage(null);
    }, NOTICE_AUTO_HIDE_MS);

    return () => clearTimeout(timer);
  }, [actionMessage, errorMessage]);

  useEffect(() => {
    setClockNow(Date.now());
    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

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

  function handleToggleHistory(): void {
    setShowHistory((current) => {
      const next = !current;
      pendingHistoryFocusRef.current = next;
      return next;
    });
  }

  function handleEditOrder(): void {
    if (!detail || !rootNavigation) {
      setActionMessage(null);
      setErrorMessage("Editor pesanan tidak bisa dibuka dari halaman ini.");
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    rootNavigation.navigate("MainTabs", {
      screen: "QuickActionTab",
      params: {
        editOrderId: detail.id,
      },
    });
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
  const isLaundryCompletionBlocked = Boolean(detail && nextLaundryStatus === "completed" && detail.due_amount > 0);
  const isCourierCompletionBlocked = Boolean(detail && nextCourierStatus === "delivered" && detail.due_amount > 0);
  const canShowStatusActions =
    (canUpdateLaundry && Boolean(nextLaundryStatus)) || (canUpdateCourier && Boolean(detail?.is_pickup_delivery) && Boolean(nextCourierStatus));
  const hasFloatingNotice = Boolean(actionMessage || errorMessage);
  const stickyActionCount = (canUpdateLaundry && nextLaundryStatus ? 1 : 0) + (canUpdateCourier && detail?.is_pickup_delivery && nextCourierStatus ? 1 : 0);
  const stickyDockOffset = canShowStatusActions || hasFloatingNotice ? Math.max((isCompactLandscape ? theme.spacing.xs : theme.spacing.sm) - 4, 0) : 0;
  const stickyActionsHeight = canShowStatusActions ? (stickyActionCount > 1 ? 122 : 58) : 0;
  const stickyNoticeHeight = hasFloatingNotice ? 88 : 0;
  const stickyNoticeOffset = canShowStatusActions ? stickyDockOffset + stickyActionsHeight + 10 : stickyDockOffset;
  const contentBottomPadding =
    canShowStatusActions || hasFloatingNotice
      ? stickyDockOffset + stickyActionsHeight + stickyNoticeHeight + (canShowStatusActions && hasFloatingNotice ? 10 : 0)
      : theme.spacing.xxl;
  const orderReference = detail?.invoice_no ?? detail?.order_code ?? "-";
  const itemCount = detail?.items?.length ?? 0;
  const totalQty = useMemo(() => (detail?.items ?? []).reduce((sum, item) => sum + parseLooseNumber(item.qty), 0), [detail?.items]);
  const totalWeight = useMemo(() => (detail?.items ?? []).reduce((sum, item) => sum + parseLooseNumber(item.weight_kg), 0), [detail?.items]);
  const customerPhoneDigits = useMemo(() => extractCustomerPhoneDigits(detail?.customer?.phone_normalized ?? ""), [detail?.customer?.phone_normalized]);
  const pickupAddress = useMemo(() => readRecordText(detail?.pickup ?? null, ["address_short", "address"]), [detail?.pickup]);
  const pickupSchedule = useMemo(() => readRecordText(detail?.pickup ?? null, ["slot", "schedule_slot", "date"]), [detail?.pickup]);
  const deliveryAddress = useMemo(() => readRecordText(detail?.delivery ?? null, ["address_short", "address"]), [detail?.delivery]);
  const deliverySchedule = useMemo(() => readRecordText(detail?.delivery ?? null, ["slot", "schedule_slot", "date"]), [detail?.delivery]);
  const sortedPayments = useMemo(
    () =>
      [...(detail?.payments ?? [])].sort((left, right) => {
        const rightTime = toHistoryTime(right.paid_at ?? right.created_at);
        const leftTime = toHistoryTime(left.paid_at ?? left.created_at);
        return rightTime - leftTime;
      }),
    [detail?.payments]
  );
  const historyEntries = useMemo<HistoryEntry[]>(() => {
    if (!detail) {
      return [];
    }

    const entries: HistoryEntry[] = [
      {
        id: `created-${detail.id}`,
        title: "Pesanan Dibuat",
        subtitle: "Data order masuk ke sistem dan siap diproses.",
        timestamp: detail.created_at,
        sortTime: toHistoryTime(detail.created_at),
        icon: "bag-check-outline",
        tone: "info",
      },
    ];

    if (detail.laundry_status && detail.laundry_status !== "received") {
      entries.push({
        id: `laundry-${detail.laundry_status}`,
        title: `Laundry: ${formatStatusLabel(detail.laundry_status)}`,
        subtitle: "Status laundry saat ini untuk pesanan ini.",
        timestamp: detail.updated_at,
        sortTime: toHistoryTime(detail.updated_at),
        icon: detail.laundry_status === "completed" || detail.laundry_status === "ready" ? "sparkles-outline" : "sync-outline",
        tone: detail.laundry_status === "completed" || detail.laundry_status === "ready" ? "success" : "info",
      });
    }

    if (detail.is_pickup_delivery && detail.courier_status) {
      entries.push({
        id: `courier-${detail.courier_status}`,
        title: `Kurir: ${formatStatusLabel(detail.courier_status)}`,
        subtitle: detail.courier?.name ? `Penanggung jawab: ${detail.courier.name}` : "Status penjemputan / pengantaran saat ini.",
        timestamp: detail.updated_at,
        sortTime: toHistoryTime(detail.updated_at),
        icon: detail.courier_status === "delivered" ? "car-sport-outline" : "navigate-outline",
        tone: detail.courier_status === "delivered" ? "success" : "warning",
      });
    }

    sortedPayments.forEach((payment, index) => {
      const paymentTime = payment.paid_at ?? payment.created_at;
      const noteSuffix = payment.notes?.trim() ? ` • ${payment.notes.trim()}` : "";
      entries.push({
        id: `payment-${payment.id}`,
        title: `Pembayaran ${formatMoney(payment.amount)}`,
        subtitle: `Metode ${formatPaymentMethodLabel(payment.method)}${noteSuffix}`,
        timestamp: paymentTime,
        sortTime: toHistoryTime(paymentTime) + (sortedPayments.length - index),
        icon: "wallet-outline",
        tone: "success",
      });
    });

    if (detail.due_amount <= 0) {
      const resolvedPaidAt = sortedPayments[0]?.paid_at ?? sortedPayments[0]?.created_at ?? detail.updated_at;
      entries.push({
        id: `settled-${detail.id}`,
        title: "Tagihan Lunas",
        subtitle: "Total pembayaran sudah memenuhi seluruh tagihan order.",
        timestamp: resolvedPaidAt,
        sortTime: toHistoryTime(resolvedPaidAt) + 1,
        icon: "checkmark-done-circle-outline",
        tone: "success",
      });
    } else if (sortedPayments.length === 0) {
      entries.push({
        id: `due-${detail.id}`,
        title: "Menunggu Pembayaran",
        subtitle: `Masih ada sisa tagihan ${formatMoney(detail.due_amount)}.`,
        timestamp: detail.updated_at,
        sortTime: toHistoryTime(detail.updated_at),
        icon: "time-outline",
        tone: "warning",
      });
    }

    return entries.sort((left, right) => right.sortTime - left.sortTime);
  }, [detail, sortedPayments]);
  const estimatedCompletionInfo = useMemo<EstimatedCompletionInfo>(() => {
    const isLaundryFinished = ["ready", "completed"].includes(detail?.laundry_status ?? "");

    if (detail?.estimated_completion_at) {
      const estimatedDate = new Date(detail.estimated_completion_at);
      if (!Number.isNaN(estimatedDate.getTime())) {
        const durationDays = typeof detail.estimated_completion_duration_days === "number" && Number.isFinite(detail.estimated_completion_duration_days)
          ? detail.estimated_completion_duration_days
          : null;
        const durationHours = typeof detail.estimated_completion_duration_hours === "number" && Number.isFinite(detail.estimated_completion_duration_hours)
          ? detail.estimated_completion_duration_hours
          : 0;
        const isLate = !isLaundryFinished && (detail.estimated_completion_is_late === true || clockNow > estimatedDate.getTime());

        if (isLate) {
          return {
            label: formatEstimatedDateTime(estimatedDate),
            hint: `Terlambat ${formatDelayLabel(clockNow - estimatedDate.getTime())}`,
            isLate: true,
          };
        }

        return {
          label: formatEstimatedDateTime(estimatedDate),
          hint: durationDays !== null ? formatEstimatedDurationHint(durationDays, durationHours) : "Estimasi dari data layanan.",
          isLate: false,
        };
      }
    }

    if (!detail?.created_at) {
      return {
        label: "Belum diatur",
        hint: "Durasi layanan belum tersedia.",
        isLate: false,
      };
    }

    const createdAt = new Date(detail.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      return {
        label: "Belum diatur",
        hint: "Tanggal order belum valid.",
        isLate: false,
      };
    }

    const maxDurationMinutes = (detail.items ?? []).reduce((currentMax, item) => {
      const durationDays = typeof item.service?.duration_days === "number" && Number.isFinite(item.service.duration_days) ? item.service.duration_days : 0;
      const durationHours = typeof item.service?.duration_hours === "number" && Number.isFinite(item.service.duration_hours) ? item.service.duration_hours : 0;
      const totalMinutes = (Math.max(durationDays, 0) * 24 * 60) + (Math.max(durationHours, 0) * 60);
      if (totalMinutes <= 0) {
        return currentMax;
      }

      return Math.max(currentMax, totalMinutes);
    }, -1);

    if (maxDurationMinutes < 0) {
      return {
        label: "Belum diatur",
        hint: "Tambahkan durasi di data layanan.",
        isLate: false,
      };
    }

    const estimatedTimestamp = createdAt.getTime() + maxDurationMinutes * 60 * 1000;
    const estimatedDate = new Date(estimatedTimestamp);
    if (!isLaundryFinished && clockNow > estimatedTimestamp) {
      return {
        label: formatEstimatedDateTime(estimatedDate),
        hint: `Terlambat ${formatDelayLabel(clockNow - estimatedTimestamp)}`,
        isLate: true,
      };
    }

    const durationDays = Math.floor(maxDurationMinutes / (24 * 60));
    const durationHours = Math.floor((maxDurationMinutes % (24 * 60)) / 60);

    return {
      label: formatEstimatedDateTime(estimatedDate),
      hint: formatEstimatedDurationHint(durationDays, durationHours),
      isLate: false,
    };
  }, [
    clockNow,
    detail?.created_at,
    detail?.estimated_completion_at,
    detail?.estimated_completion_duration_days,
    detail?.estimated_completion_duration_hours,
    detail?.estimated_completion_is_late,
    detail?.items,
    detail?.laundry_status,
  ]);
  const paymentStatusLabel = detail?.due_amount && detail.due_amount > 0 ? "Belum Lunas" : "Lunas";

  function handleOpenPaymentTools(): void {
    if (!detail) {
      return;
    }

    rootNavigation?.navigate("OrderPayment", {
      orderId: detail.id,
      source: "detail",
    });
  }

  async function handleNextLaundry(): Promise<void> {
    if (!detail || !nextLaundryStatus || updatingLaundry) {
      return;
    }

    if (nextLaundryStatus === "completed" && detail.due_amount > 0) {
      setActionMessage(null);
      setErrorMessage("Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.");
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

    if (nextCourierStatus === "delivered" && detail.due_amount > 0) {
      setActionMessage(null);
      setErrorMessage("Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.");
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

  async function handleShareReceipt(kind: "production" | "customer"): Promise<void> {
    if (!detail) {
      return;
    }

    const setLoading = kind === "production" ? setSharingProductionReceipt : setSharingCustomerReceipt;

    setLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const printerSettings = await getPrinterLocalSettings(selectedOutlet?.id).catch(() => DEFAULT_PRINTER_LOCAL_SETTINGS);
      const noteSettings = await getPrinterNoteSettings(selectedOutlet?.id).catch(() => ({
        ...DEFAULT_PRINTER_NOTE_SETTINGS,
        profileName: selectedOutlet?.name || "",
      }));
      const receiptText = buildOrderReceiptText({
        kind,
        order: detail,
        outletLabel,
        paperWidth: printerSettings.paperWidth,
        noteSettings,
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

    if (!customerPhoneDigits) {
      setErrorMessage("Nomor WhatsApp pelanggan belum valid.");
      return;
    }

    setOpeningWhatsApp(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const waMessage = buildOrderWhatsAppMessage(detail, outletLabel);
      const url = `https://wa.me/${customerPhoneDigits}?text=${encodeURIComponent(waMessage)}`;
      await Linking.openURL(url);
      setActionMessage("WhatsApp dibuka. Silakan kirim pesannya dari aplikasi WA.");
    } catch {
      setErrorMessage("Gagal membuka WhatsApp di perangkat ini.");
    } finally {
      setOpeningWhatsApp(false);
    }
  }

  async function handleOpenPhone(): Promise<void> {
    if (!customerPhoneDigits) {
      setErrorMessage("Nomor telepon pelanggan belum valid.");
      return;
    }

    try {
      await Linking.openURL(`tel:${customerPhoneDigits}`);
    } catch {
      setErrorMessage("Gagal membuka aplikasi telepon di perangkat ini.");
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.screenShell}>
      {loading ? (
        <View style={[styles.screenShell, styles.centeredState]}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Memuat detail order...</Text>
        </View>
      ) : detail ? (
        <View style={styles.screenShell}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ref={contentScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.flex}
          >
            <View style={styles.stack}>
          <AppPanel style={[styles.heroPanel, estimatedCompletionInfo.isLate ? styles.heroPanelLate : null]}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={handleBackPress} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
              </Pressable>
              <Text style={[styles.screenTitle, estimatedCompletionInfo.isLate ? styles.heroTitleLate : null]}>Antrean</Text>
              <View style={styles.heroActionRow}>
                <Pressable
                  disabled={sharingCustomerReceipt || sharingProductionReceipt}
                  onPress={() => void handleShareReceipt("customer")}
                  style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}
                >
                  <Ionicons color={theme.colors.info} name="receipt-outline" size={18} />
                </Pressable>
                <Pressable
                  disabled={sharingCustomerReceipt || sharingProductionReceipt}
                  onPress={() => void handleShareReceipt("production")}
                  style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}
                >
                  <Ionicons color={theme.colors.info} name="print-outline" size={18} />
                </Pressable>
              </View>
            </View>

            <View style={styles.orderHeaderRow}>
              <Text style={[styles.invoiceTitle, estimatedCompletionInfo.isLate ? styles.heroTitleLate : null]}>{orderReference}</Text>
              <Text style={[styles.orderDateText, estimatedCompletionInfo.isLate ? styles.heroMetaLate : null]}>{formatDateTime(detail.created_at)}</Text>
            </View>

            <View style={styles.customerCard}>
              <Ionicons color={theme.colors.info} name="person-circle" size={54} />
              <View style={styles.customerCardCopy}>
                <Text style={styles.customerName}>{detail.customer?.name ?? "-"}</Text>
                <Text style={styles.customerPhone}>{detail.customer?.phone_normalized ?? "-"}</Text>
              </View>
              <View style={styles.customerActionRow}>
                <Pressable disabled={openingWhatsApp} onPress={() => void handleOpenWhatsApp()} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                  <Ionicons color={theme.colors.success} name="logo-whatsapp" size={20} />
                </Pressable>
                <Pressable onPress={() => void handleOpenPhone()} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                  <Ionicons color={theme.colors.info} name="call-outline" size={20} />
                </Pressable>
              </View>
            </View>

            <View style={styles.statusRow}>
              <StatusPill label={`Laundry: ${formatStatusLabel(detail.laundry_status)}`} tone={resolveLaundryTone(detail.laundry_status)} />
              <StatusPill
                label={detail.is_pickup_delivery ? `Kurir: ${formatStatusLabel(detail.courier_status)}` : "Antar/Jemput: Tidak"}
                tone={detail.is_pickup_delivery ? resolveCourierTone(detail.courier_status) : "neutral"}
              />
            </View>
          </AppPanel>

          {detail.is_pickup_delivery ? (
            <AppPanel style={styles.summaryPanel}>
              <Pressable onPress={() => setShowDeliveryInfo((current) => !current)} style={({ pressed }) => [styles.sectionHeaderRow, styles.sectionHeaderButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Text style={styles.sectionTitle}>Informasi Antar / Jemput</Text>
                <Ionicons color={theme.colors.textSecondary} name={showDeliveryInfo ? "chevron-up" : "chevron-down"} size={18} />
              </Pressable>
              {showDeliveryInfo ? (
                <>
                  <Text style={styles.noteHint}>Jemput: {pickupAddress ?? "-"}{pickupSchedule ? ` • ${pickupSchedule}` : ""}</Text>
                  <Text style={styles.noteHint}>Antar: {deliveryAddress ?? "-"}{deliverySchedule ? ` • ${deliverySchedule}` : ""}</Text>
                </>
              ) : null}
            </AppPanel>
          ) : null}

          <View>
            <AppPanel style={styles.summaryPanel}>
              <View style={styles.billCard}>
                <View style={styles.billCardMain}>
                  <Text style={styles.billLabel}>Tagihan</Text>
                  <Text style={styles.billAmount}>{formatMoney(Math.max(detail.due_amount, 0))}</Text>
                  <Text style={styles.billSubtext}>{paymentStatusLabel}</Text>
                </View>
                <View style={styles.billActionRow}>
                  <Pressable onPress={() => setShowPaymentSummary((current) => !current)} style={({ pressed }) => [styles.billActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                    <Text style={styles.billActionText}>{showPaymentSummary ? "TUTUP" : "DETAIL"}</Text>
                  </Pressable>
                  {canManagePayment && detail.due_amount > 0 ? (
                    <Pressable
                      onPress={handleOpenPaymentTools}
                      style={({ pressed }) => [styles.billActionButton, styles.billActionButtonPrimary, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <Text style={[styles.billActionText, styles.billActionTextPrimary]}>BAYAR</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.centerInfoBlock}>
                <Text style={styles.centerInfoLabel}>Estimasi Selesai</Text>
                <Text style={styles.centerInfoValue}>{estimatedCompletionInfo.label}</Text>
                <Text style={[styles.centerInfoHint, estimatedCompletionInfo.isLate ? styles.centerInfoHintLate : null]}>{estimatedCompletionInfo.hint}</Text>
              </View>

              {showPaymentSummary ? (
                <View style={styles.paymentSummaryCard}>
                  <View style={styles.paymentSummaryRow}>
                    <Text style={styles.paymentStatLabel}>Total</Text>
                    <Text style={styles.paymentStatValue}>{formatMoney(detail.total_amount)}</Text>
                  </View>
                  <View style={styles.paymentSummaryRow}>
                    <Text style={styles.paymentStatLabel}>Dibayar</Text>
                    <Text style={styles.paymentStatValue}>{formatMoney(detail.paid_amount)}</Text>
                  </View>
                  <View style={styles.paymentSummaryRow}>
                    <Text style={styles.paymentStatLabel}>Sisa Tagihan</Text>
                    <Text style={[styles.paymentStatValue, detail.due_amount > 0 ? styles.dueValue : styles.successValue]}>{formatMoney(detail.due_amount)}</Text>
                  </View>
                </View>
              ) : null}
            </AppPanel>
          </View>

          <AppPanel>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Detail Pesanan</Text>
              {canEditOrder ? (
                <Pressable hitSlop={6} onPress={handleEditOrder} style={({ pressed }) => [styles.sectionLinkButton, pressed ? styles.heroIconButtonPressed : null]}>
                  <Text style={styles.sectionLink}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.sectionCaption}>
              {itemCount} item · Qty {formatCompactNumber(totalQty)} · {formatCompactNumber(totalWeight)} kg
            </Text>
            {detail.items && detail.items.length > 0 ? (
              <View style={styles.itemList}>
                {detail.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemThumb}>
                      <Ionicons color={theme.colors.info} name="shirt-outline" size={22} />
                    </View>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{item.service_name_snapshot}</Text>
                      <Text style={styles.itemMeta}>{formatItemMetric(item.weight_kg, item.qty, item.unit_type_snapshot)}</Text>
                      <Text style={styles.itemMeta}>Harga unit {formatMoney(item.unit_price_amount)}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{formatMoney(item.subtotal_amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>Belum ada item order.</Text>
            )}

            <View style={styles.quickIconRow}>
              <Pressable disabled={sharingCustomerReceipt || sharingProductionReceipt} onPress={() => void handleShareReceipt("production")} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.info} name="print-outline" size={18} />
              </Pressable>
              <Pressable disabled={sharingCustomerReceipt || sharingProductionReceipt} onPress={() => void handleShareReceipt("customer")} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.info} name="receipt-outline" size={18} />
              </Pressable>
              <Pressable disabled={openingWhatsApp} onPress={() => void handleOpenWhatsApp()} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.success} name="logo-whatsapp" size={18} />
              </Pressable>
              <Pressable onPress={() => void handleOpenPhone()} style={({ pressed }) => [styles.iconActionButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.info} name="call-outline" size={18} />
              </Pressable>
              <Pressable onPress={handleToggleHistory} style={({ pressed }) => [styles.ghostPill, showHistory ? styles.ghostPillActive : null, pressed ? styles.heroIconButtonPressed : null]}>
                <Text style={[styles.ghostPillText, showHistory ? styles.ghostPillTextActive : null]}>{showHistory ? "Tutup Riwayat" : "Riwayat"}</Text>
              </Pressable>
            </View>
          </AppPanel>

          {showHistory ? (
            <View
              onLayout={(event) => {
                if (!pendingHistoryFocusRef.current) {
                  return;
                }

                pendingHistoryFocusRef.current = false;
                const nextY = Math.max(event.nativeEvent.layout.y - theme.spacing.sm, 0);
                requestAnimationFrame(() => {
                  contentScrollRef.current?.scrollTo({ y: nextY, animated: true });
                });
              }}
            >
              <AppPanel style={styles.summaryPanel}>
                <Pressable
                  onPress={() => {
                    pendingHistoryFocusRef.current = false;
                    setShowHistory(false);
                  }}
                  style={({ pressed }) => [styles.sectionHeaderRow, styles.sectionHeaderButton, pressed ? styles.heroIconButtonPressed : null]}
                >
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Histori Pesanan</Text>
                    <Text style={styles.sectionHeaderMeta}>{historyEntries.length} catatan</Text>
                  </View>
                  <Ionicons color={theme.colors.textSecondary} name="chevron-up" size={18} />
                </Pressable>
                {historyEntries.length > 0 ? (
                  <View style={styles.historyTimeline}>
                    {historyEntries.map((entry, index) => {
                      const iconColor =
                        entry.tone === "success"
                          ? theme.colors.success
                          : entry.tone === "warning"
                            ? theme.colors.warning
                            : entry.tone === "info"
                              ? theme.colors.info
                              : theme.colors.textMuted;

                      return (
                        <View key={entry.id} style={styles.historyRow}>
                          <View style={styles.historyRail}>
                            <View style={[styles.historyDot, { borderColor: iconColor, backgroundColor: theme.colors.surface }]}>
                              <Ionicons color={iconColor} name={entry.icon} size={14} />
                            </View>
                            {index < historyEntries.length - 1 ? <View style={styles.historyLine} /> : null}
                          </View>
                          <View style={styles.historyCard}>
                            <View style={styles.historyCardTop}>
                              <Text style={styles.historyTitle}>{entry.title}</Text>
                              <Text style={styles.historyDate}>{formatDateTime(entry.timestamp)}</Text>
                            </View>
                            <Text style={styles.historySub}>{entry.subtitle}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Belum ada histori untuk ditampilkan.</Text>
                )}
              </AppPanel>
            </View>
          ) : null}

          <AppPanel style={styles.summaryPanel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Informasi Tambahan</Text>
            </View>
            <Text style={styles.emptyText}>{detail.notes?.trim() ? detail.notes : "Tidak Ada"}</Text>
          </AppPanel>

            </View>
          </ScrollView>

          {hasFloatingNotice ? (
            <View style={[styles.stickyNoticeDock, { bottom: stickyNoticeOffset }]}>
              <View style={styles.stickyNoticeStack}>
                {actionMessage ? (
                  <View style={styles.successWrap}>
                    <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
                    <View style={styles.noticeCopy}>
                      <Text style={styles.noticeSuccessTitle}>Aksi berhasil</Text>
                      <Text style={styles.noticeSuccessText}>{actionMessage}</Text>
                    </View>
                  </View>
                ) : null}
                {errorMessage ? (
                  <View style={styles.errorWrap}>
                    <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
                    <View style={styles.noticeCopy}>
                      <Text style={styles.noticeErrorTitle}>Perlu perhatian</Text>
                      <Text style={styles.noticeErrorText}>{errorMessage}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {canShowStatusActions ? (
            <View style={[styles.stickyActionsDock, { bottom: stickyDockOffset }]}>
              <View style={styles.stickyActionsPanel}>
                {canUpdateLaundry && nextLaundryStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    leftElement={<Ionicons color={theme.colors.primaryContrast} name="checkmark-done-outline" size={17} />}
                    loading={updatingLaundry}
                    onPress={() => void handleNextLaundry()}
                    title={
                      isLaundryCompletionBlocked
                        ? "LUNASI TAGIHAN DULU"
                        : nextLaundryStatus === "completed"
                          ? "SELESAIKAN PROSES"
                          : `LANJUT KE ${formatStatusLabel(nextLaundryStatus).toUpperCase()}`
                    }
                  />
                ) : null}

                {canUpdateCourier && detail.is_pickup_delivery && nextCourierStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    leftElement={<Ionicons color={theme.colors.info} name="bicycle-outline" size={17} />}
                    loading={updatingCourier}
                    onPress={() => void handleNextCourier()}
                    title={
                      isCourierCompletionBlocked
                        ? "LUNASI TAGIHAN DULU"
                        : `KURIR KE ${formatStatusLabel(nextCourierStatus).toUpperCase()}`
                    }
                    variant="secondary"
                  />
                ) : null}
              </View>
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
    flex: {
      flex: 1,
    },
    screenShell: {
      flex: 1,
      width: "100%",
    },
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
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderStrong,
    },
    heroPanelLate: {
      backgroundColor: theme.mode === "dark" ? "rgba(255,110,133,0.12)" : "rgba(255,244,244,0.98)",
      borderColor: theme.colors.danger,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    screenTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 20 : 18,
      textAlign: "center",
    },
    heroTitleLate: {
      color: theme.colors.danger,
    },
    heroActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "rgba(19,104,188,0.18)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : "#ffffff",
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.14 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
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
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 22 : 19,
      lineHeight: isTablet ? 28 : 24,
    },
    orderHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingTop: 2,
    },
    orderDateText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      textAlign: "right",
    },
    heroMetaLate: {
      color: theme.colors.danger,
    },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingTop: 4,
    },
    customerCardCopy: {
      flex: 1,
      gap: 1,
    },
    customerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 16 : 15,
    },
    customerPhone: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
    },
    customerActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    iconActionButton: {
      width: 38,
      height: 38,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "rgba(19,104,188,0.18)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.14 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
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
    sectionHeaderButton: {
      minHeight: 24,
    },
    sectionHeaderCopy: {
      flex: 1,
      gap: 1,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    sectionHeaderMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    sectionCaption: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: -2,
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
    billCard: {
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.info,
      paddingHorizontal: 16,
      paddingVertical: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    billCardMain: {
      flex: 1,
      gap: 2,
    },
    billLabel: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      opacity: 0.92,
    },
    billAmount: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 29 : 26,
    },
    billSubtext: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      opacity: 0.92,
    },
    billActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    billActionButton: {
      minHeight: 38,
      minWidth: 72,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(5, 38, 78, 0.65)" : "rgba(0, 88, 185, 0.32)",
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    billActionButtonPrimary: {
      backgroundColor: "#f8ac00",
    },
    billActionText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    billActionTextPrimary: {
      color: theme.colors.primaryContrast,
    },
    centerInfoBlock: {
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 3,
    },
    centerInfoLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
    },
    centerInfoValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 18 : 16,
      lineHeight: isTablet ? 24 : 21,
      textAlign: "center",
    },
    centerInfoHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
      textAlign: "center",
    },
    centerInfoHintLate: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.semibold,
    },
    paymentSummaryCard: {
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 8,
    },
    paymentSummaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    paymentInlineDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginTop: 2,
      marginBottom: 2,
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
    sectionLinkButton: {
      minHeight: 28,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.sm,
    },
    sectionLink: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
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
    itemThumb: {
      width: 50,
      height: 50,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
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
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    quickIconRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      paddingTop: 4,
    },
    ghostPill: {
      minHeight: 36,
      marginLeft: "auto",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "rgba(19,104,188,0.18)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : "#ffffff",
      paddingHorizontal: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    ghostPillActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    ghostPillText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    ghostPillTextActive: {
      color: theme.colors.info,
    },
    historyTimeline: {
      gap: 6,
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 10,
    },
    historyRail: {
      width: 20,
      alignItems: "center",
    },
    historyDot: {
      width: 20,
      height: 20,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    historyLine: {
      flex: 1,
      width: 1.5,
      marginTop: 3,
      marginBottom: -3,
      backgroundColor: theme.colors.border,
    },
    historyCard: {
      flex: 1,
      gap: 4,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    historyCardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    historyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    historySub: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    historyDate: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
      textAlign: "right",
    },
    bottomActionStack: {
      gap: 10,
      paddingTop: 2,
    },
    stickyActionsDock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingBottom: 0,
    },
    stickyNoticeDock: {
      position: "absolute",
      left: 0,
      right: 0,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
    },
    stickyNoticeStack: {
      gap: 8,
    },
    stickyActionsPanel: {
      gap: 10,
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
    noticeCopy: {
      flex: 1,
      gap: 2,
    },
    noticeSuccessTitle: {
      color: theme.colors.success,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    noticeErrorTitle: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    noticeSuccessText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    noticeErrorText: {
      color: theme.colors.danger,
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
    successText: {
      flex: 1,
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
