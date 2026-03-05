import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { cancelOrder, deleteOrder, getOrderDetail, updateCourierStatus, updateLaundryStatus } from "../../features/orders/orderApi";
import { buildOrderReceiptText, type OrderReceiptKind } from "../../features/orders/orderReceipt";
import { formatStatusLabel, getNextLaundryStatus, resolveCourierTone, resolveLaundryTone } from "../../features/orders/orderStatus";
import { formatServiceDuration } from "../../features/services/defaultDuration";
import { getStoredBluetoothThermalPrinter } from "../../features/settings/printerBluetoothStorage";
import { DEFAULT_PRINTER_NOTE_SETTINGS, getPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { DEFAULT_PRINTER_LOCAL_SETTINGS, getPrinterLocalSettings } from "../../features/settings/printerLocalSettingsStorage";
import { printBluetoothThermalReceipt } from "../../features/settings/thermalBluetoothPrinter";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList, OrdersStackParamList } from "../../navigation/types";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrderDetail">;
type DetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;

const NOTICE_AUTO_HIDE_MS = 4000;
const CANCEL_REASON_OTHER_ID = "other";
const RECEIPT_PREVIEW_ZOOM_MIN = 0.75;
const RECEIPT_PREVIEW_ZOOM_MAX = 1.8;
const RECEIPT_PREVIEW_ZOOM_STEP = 0.15;
const RECEIPT_PREVIEW_FONT_SIZE = 10.5;
const RECEIPT_PREVIEW_LINE_HEIGHT = 16;
const RECEIPT_PREVIEW_CHAR_WIDTH_FACTOR = 0.64;
const RECEIPT_PREVIEW_SIDE_PADDING = 26;

const CANCEL_REASON_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "customer_change_mind", label: "Pelanggan membatalkan pesanan" },
  { id: "duplicate_order", label: "Order dobel / salah input kasir" },
  { id: "pickup_failed", label: "Kurir gagal jemput (alamat tidak valid / tidak ada orang)" },
  { id: "schedule_conflict", label: "Jadwal jemput/antar tidak cocok" },
  { id: "item_not_ready", label: "Barang belum siap diserahkan pelanggan" },
  { id: "price_disagreement", label: "Tidak sepakat biaya layanan / ongkir" },
  { id: "service_unavailable", label: "Layanan/mesin sedang tidak tersedia" },
  { id: "payment_issue", label: "Kendala pembayaran dari pelanggan" },
  { id: "out_of_coverage", label: "Alamat di luar jangkauan antar/jemput" },
  { id: CANCEL_REASON_OTHER_ID, label: "Lainnya" },
];

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

function resolveCourierFlowFlags(order: OrderDetail | null): { requiresPickup: boolean; requiresDelivery: boolean } {
  if (!order) {
    return {
      requiresPickup: false,
      requiresDelivery: false,
    };
  }

  const legacy = Boolean(order.is_pickup_delivery);
  return {
    requiresPickup: typeof order.requires_pickup === "boolean" ? order.requires_pickup : legacy,
    requiresDelivery: typeof order.requires_delivery === "boolean" ? order.requires_delivery : legacy,
  };
}

function resolveInitialCourierStatusByFlow(requiresPickup: boolean, requiresDelivery: boolean): string | null {
  if (!requiresPickup && !requiresDelivery) {
    return null;
  }

  if (requiresPickup) {
    return "pickup_pending";
  }

  return "at_outlet";
}

function getNextCourierStatusByFlow(
  current: string | null | undefined,
  laundryStatus: string | null | undefined,
  requiresPickup: boolean,
  requiresDelivery: boolean,
): string | null {
  if (!requiresPickup && !requiresDelivery) {
    return null;
  }

  const currentStatus = current ?? resolveInitialCourierStatusByFlow(requiresPickup, requiresDelivery);
  const isLaundryFinished = ["ready", "completed"].includes(laundryStatus ?? "");

  if (requiresPickup && requiresDelivery) {
    if (currentStatus === "pickup_pending") {
      return "pickup_on_the_way";
    }

    if (currentStatus === "pickup_on_the_way") {
      return "picked_up";
    }

    if (currentStatus === "picked_up" || currentStatus === "at_outlet") {
      return isLaundryFinished ? "delivery_pending" : null;
    }

    if (currentStatus === "delivery_pending") {
      return "delivery_on_the_way";
    }

    if (currentStatus === "delivery_on_the_way") {
      return "delivered";
    }

    return null;
  }

  if (requiresPickup) {
    return (
      {
        pickup_pending: "pickup_on_the_way",
        pickup_on_the_way: "picked_up",
      } as const
    )[currentStatus as "pickup_pending" | "pickup_on_the_way"] ?? null;
  }

  if (currentStatus === "at_outlet") {
    return isLaundryFinished ? "delivery_pending" : null;
  }

  return (
    {
      delivery_pending: "delivery_on_the_way",
      delivery_on_the_way: "delivered",
    } as const
  )[currentStatus as "delivery_pending" | "delivery_on_the_way"] ?? null;
}

function getLaundryActionLabel(nextStatus: string): string {
  return (
    {
      washing: "Mulai Cuci",
      drying: "Pindah ke Pengeringan",
      ironing: "Pindah ke Penyetrikaan",
      ready: "Tandai Siap",
      completed: "Tandai Selesai",
    } as const
  )[nextStatus as "washing" | "drying" | "ironing" | "ready" | "completed"] ?? `Laundry: ${formatStatusLabel(nextStatus)}`;
}

function getCourierActionLabel(nextStatus: string): string {
  return (
    {
      pickup_on_the_way: "Kurir Berangkat Jemput",
      picked_up: "Tandai Sudah Dijemput",
      delivery_pending: "Siapkan untuk Antar",
      delivery_on_the_way: "Kurir Berangkat Antar",
      delivered: "Tandai Sudah Diantar",
    } as const
  )[nextStatus as "pickup_on_the_way" | "picked_up" | "delivery_pending" | "delivery_on_the_way" | "delivered"] ?? `Kurir: ${formatStatusLabel(nextStatus)}`;
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
  const [preparingReceiptPreview, setPreparingReceiptPreview] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [showReceiptPreviewModal, setShowReceiptPreviewModal] = useState(false);
  const [receiptPreviewKind, setReceiptPreviewKind] = useState<OrderReceiptKind>("customer");
  const [receiptPreviewText, setReceiptPreviewText] = useState("");
  const [receiptPreviewPaperWidth, setReceiptPreviewPaperWidth] = useState(DEFAULT_PRINTER_LOCAL_SETTINGS.paperWidth);
  const [receiptPreviewZoom, setReceiptPreviewZoom] = useState(1);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [selectedCancelReasonId, setSelectedCancelReasonId] = useState<string | null>(null);
  const [cancelReasonOtherDraft, setCancelReasonOtherDraft] = useState("");
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const contentScrollRef = useRef<ScrollView | null>(null);
  const pendingHistoryFocusRef = useRef(false);

  const roles = session?.roles ?? [];
  const canEditOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canCancelOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canDeleteOrder = hasAnyRole(roles, ["owner", "admin"]);
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
    setShowReceiptPreviewModal(false);
    setReceiptPreviewKind("customer");
    setReceiptPreviewText("");
    setReceiptPreviewPaperWidth(DEFAULT_PRINTER_LOCAL_SETTINGS.paperWidth);
    setSelectedCancelReasonId(null);
    setCancelReasonOtherDraft("");
    setShowCancelReasonModal(false);
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

  function openQuickActionEditor(startStep?: "customer" | "services" | "review"): void {
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
        editStartStep: startStep,
      },
    });
  }

  function handleEditOrder(): void {
    openQuickActionEditor();
  }

  function handleInputServiceItems(): void {
    openQuickActionEditor("services");
  }

  const nextLaundryStatus = useMemo(() => getNextLaundryStatus(detail?.laundry_status), [detail?.laundry_status]);
  const courierFlowFlags = useMemo(() => resolveCourierFlowFlags(detail), [detail]);
  const requiresPickup = courierFlowFlags.requiresPickup;
  const requiresDelivery = courierFlowFlags.requiresDelivery;
  const hasCourierFlow = requiresPickup || requiresDelivery;
  const currentCourierStatus = useMemo(
    () => detail?.courier_status ?? resolveInitialCourierStatusByFlow(requiresPickup, requiresDelivery),
    [detail?.courier_status, requiresDelivery, requiresPickup],
  );
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
  const nextCourierStatus = useMemo(() => {
    return getNextCourierStatusByFlow(currentCourierStatus, detail?.laundry_status, requiresPickup, requiresDelivery);
  }, [currentCourierStatus, detail?.laundry_status, requiresDelivery, requiresPickup]);
  const isOrderCancelled = Boolean(detail?.is_cancelled || detail?.cancelled_at);
  const nextLaundryActionLabel = useMemo(() => (nextLaundryStatus ? getLaundryActionLabel(nextLaundryStatus) : null), [nextLaundryStatus]);
  const nextCourierActionLabel = useMemo(() => (nextCourierStatus ? getCourierActionLabel(nextCourierStatus) : null), [nextCourierStatus]);
  const isLaundryCompletionBlocked = Boolean(detail && nextLaundryStatus === "completed" && detail.due_amount > 0);
  const isCourierCompletionBlocked = Boolean(detail && nextCourierStatus === "delivered" && detail.due_amount > 0);
  const hasOrderItems = Boolean((detail?.items?.length ?? 0) > 0);
  const isPickupInProgress = requiresPickup && ["pickup_pending", "pickup_on_the_way"].includes(currentCourierStatus ?? "");
  const shouldShowPickupGuidancePanel = !isOrderCancelled && requiresPickup && (!hasOrderItems || isPickupInProgress);
  const showInputServiceButton = canEditOrder && !isOrderCancelled && requiresPickup && !hasOrderItems && !isPickupInProgress;
  const pickupInstructionState = useMemo(() => {
    if (currentCourierStatus === "pickup_pending") {
      return "Menunggu Jemput";
    }

    if (currentCourierStatus === "pickup_on_the_way") {
      return "Kurir Menuju Jemput";
    }

    if (!hasOrderItems) {
      return "Lanjut Input Layanan";
    }

    return "Instruksi Penjemputan";
  }, [currentCourierStatus, hasOrderItems]);
  const pickupInstructionNow = useMemo(() => {
    if (currentCourierStatus === "pickup_pending") {
      return "Pastikan kurir berangkat sesuai jadwal jemput.";
    }

    if (currentCourierStatus === "pickup_on_the_way") {
      return "Setelah barang diterima, tandai status: Sudah Dijemput.";
    }

    if (!hasOrderItems) {
      return "Barang sudah dijemput. Lanjutkan ke input item layanan.";
    }

    return "Lanjutkan proses jemput dan input layanan.";
  }, [currentCourierStatus, hasOrderItems]);
  const pickupInstructionNext = useMemo(() => {
    if (isPickupInProgress) {
      return "Tagihan, estimasi selesai, dan detail pesanan akan muncul setelah item layanan diinput.";
    }

    if (!hasOrderItems) {
      return "Input item layanan sekarang agar proses laundry bisa lanjut.";
    }

    return "";
  }, [hasOrderItems, isPickupInProgress]);
  const canAdvanceLaundryStatus = canUpdateLaundry && !isOrderCancelled && Boolean(nextLaundryStatus) && hasOrderItems;
  const canShowStatusActions =
    canAdvanceLaundryStatus || (canUpdateCourier && !isOrderCancelled && hasCourierFlow && Boolean(nextCourierStatus));
  const hasFloatingNotice = Boolean(actionMessage || errorMessage);
  const stickyActionCount = (canAdvanceLaundryStatus ? 1 : 0) + (canUpdateCourier && !isOrderCancelled && hasCourierFlow && nextCourierStatus ? 1 : 0);
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
  const receiptPreviewKindLabel = receiptPreviewKind === "production" ? "Resi Produksi" : "Resi Pelanggan";
  const isReceiptActionBusy = preparingReceiptPreview || printingReceipt || sendingReceipt;
  const receiptPaperWidthMm = receiptPreviewPaperWidth === "80mm" ? 80 : 58;
  const receiptColumnWidth = receiptPreviewPaperWidth === "80mm" ? 48 : 32;
  const receiptPreviewFontSize = RECEIPT_PREVIEW_FONT_SIZE * receiptPreviewZoom;
  const receiptPreviewLineHeight = RECEIPT_PREVIEW_LINE_HEIGHT * receiptPreviewZoom;
  const receiptPaperPreviewWidth = useMemo(() => {
    const charWidth = receiptPreviewFontSize * RECEIPT_PREVIEW_CHAR_WIDTH_FACTOR;
    return Math.round(receiptColumnWidth * charWidth + RECEIPT_PREVIEW_SIDE_PADDING);
  }, [receiptColumnWidth, receiptPreviewFontSize]);
  const canZoomOutReceiptPreview = receiptPreviewZoom > RECEIPT_PREVIEW_ZOOM_MIN + 0.001;
  const canZoomInReceiptPreview = receiptPreviewZoom < RECEIPT_PREVIEW_ZOOM_MAX - 0.001;
  const pickupAddress = useMemo(() => readRecordText(detail?.pickup ?? null, ["address_short", "address"]), [detail?.pickup]);
  const pickupSchedule = useMemo(() => readRecordText(detail?.pickup ?? null, ["slot", "schedule_slot", "date"]), [detail?.pickup]);
  const pickupInstructionLocation = useMemo(() => {
    if (!requiresPickup) {
      return "";
    }

    const address = pickupAddress ?? "-";
    return pickupSchedule ? `${address} • ${pickupSchedule}` : address;
  }, [pickupAddress, pickupSchedule, requiresPickup]);
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
    const cancelled = Boolean(detail.is_cancelled || detail.cancelled_at);

    if (cancelled) {
      const cancelledTime = detail.cancelled_at ?? detail.updated_at;
      const reasonText = detail.cancelled_reason?.trim() ?? "";
      entries.push({
        id: `cancelled-${detail.id}`,
        title: "Pesanan Dibatalkan",
        subtitle: reasonText ? `Alasan: ${reasonText}` : "Pesanan dihentikan dan tidak dilanjutkan ke proses laundry.",
        timestamp: cancelledTime,
        sortTime: toHistoryTime(cancelledTime) + 2,
        icon: "close-circle-outline",
        tone: "warning",
      });
    }

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

    if (hasCourierFlow && currentCourierStatus) {
      entries.push({
        id: `courier-${currentCourierStatus}`,
        title: `Kurir ${courierModeLabel}: ${formatStatusLabel(currentCourierStatus)}`,
        subtitle: detail.courier?.name ? `Penanggung jawab: ${detail.courier.name}` : "Status logistik pesanan saat ini.",
        timestamp: detail.updated_at,
        sortTime: toHistoryTime(detail.updated_at),
        icon: currentCourierStatus === "delivered" ? "car-sport-outline" : "navigate-outline",
        tone: currentCourierStatus === "delivered" ? "success" : "warning",
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

    if (!cancelled && detail.due_amount <= 0) {
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
    } else if (!cancelled && sortedPayments.length === 0) {
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
  }, [courierModeLabel, currentCourierStatus, detail, hasCourierFlow, sortedPayments]);
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

      if (nextCourierStatus === "picked_up") {
        if (canEditOrder && rootNavigation) {
          rootNavigation.navigate("MainTabs", {
            screen: "QuickActionTab",
            params: {
              editOrderId: latest.id,
              editStartStep: "services",
            },
          });
          return;
        }

        setActionMessage("Barang sudah dijemput. Lanjutkan input item layanan.");
        return;
      }

      setActionMessage(`Kurir dipindah ke ${formatStatusLabel(nextCourierStatus)}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUpdatingCourier(false);
    }
  }

  async function handleCancelOrder(reason: string): Promise<boolean> {
    if (!detail || cancellingOrder || deletingOrder) {
      return false;
    }

    setCancellingOrder(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const latest = await cancelOrder({
        orderId: detail.id,
        reason,
      });
      setDetail(latest);
      setSelectedCancelReasonId(null);
      setCancelReasonOtherDraft("");
      setActionMessage("Pesanan dibatalkan. Untuk menghapus permanen, gunakan tombol Hapus.");
      return true;
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      return false;
    } finally {
      setCancellingOrder(false);
    }
  }

  function handleOpenCancelReasonModal(): void {
    if (!detail || cancellingOrder || deletingOrder) {
      return;
    }

    if (!canCancelOrder) {
      setActionMessage(null);
      setErrorMessage("Role Anda tidak punya akses untuk membatalkan pesanan.");
      return;
    }

    if (isOrderCancelled) {
      setActionMessage("Pesanan ini sudah dibatalkan.");
      return;
    }

    setSelectedCancelReasonId(CANCEL_REASON_OPTIONS[0]?.id ?? null);
    setCancelReasonOtherDraft("");
    setShowCancelReasonModal(true);
  }

  function handleCloseCancelReasonModal(): void {
    if (cancellingOrder) {
      return;
    }

    setShowCancelReasonModal(false);
  }

  async function handleSubmitCancelReason(): Promise<void> {
    if (!selectedCancelReasonId) {
      setActionMessage(null);
      setErrorMessage("Pilih alasan pembatalan terlebih dahulu.");
      return;
    }

    const selectedOption = CANCEL_REASON_OPTIONS.find((item) => item.id === selectedCancelReasonId);
    if (!selectedOption) {
      setActionMessage(null);
      setErrorMessage("Pilihan alasan tidak valid.");
      return;
    }

    const reason =
      selectedOption.id === CANCEL_REASON_OTHER_ID
        ? cancelReasonOtherDraft.trim()
        : selectedOption.label;

    if (!reason) {
      setActionMessage(null);
      setErrorMessage("Alasan pembatalan wajib diisi.");
      return;
    }

    const isSuccess = await handleCancelOrder(reason);
    if (isSuccess) {
      setShowCancelReasonModal(false);
    }
  }

  async function handleDeleteOrder(): Promise<void> {
    if (!detail || deletingOrder || cancellingOrder) {
      return;
    }

    setDeletingOrder(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await deleteOrder(detail.id);
      resetToOrders();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingOrder(false);
    }
  }

  function handleConfirmDeleteOrder(): void {
    if (!detail || deletingOrder || cancellingOrder) {
      return;
    }

    if (!canDeleteOrder) {
      setActionMessage(null);
      setErrorMessage("Role Anda tidak punya akses untuk menghapus pesanan.");
      return;
    }

    if (!isOrderCancelled) {
      setActionMessage(null);
      setErrorMessage("Batalkan pesanan dulu sebelum menghapus permanen.");
      return;
    }

    Alert.alert(
      "Hapus Pesanan Permanen?",
      "Data pesanan, item, dan pembayaran akan dihapus permanen dan tidak bisa dikembalikan.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            void handleDeleteOrder();
          },
        },
      ],
    );
  }

  function handleCloseReceiptPreviewModal(): void {
    if (isReceiptActionBusy) {
      return;
    }

    setShowReceiptPreviewModal(false);
  }

  function updateReceiptPreviewZoom(nextValue: number): void {
    const clamped = Math.max(RECEIPT_PREVIEW_ZOOM_MIN, Math.min(RECEIPT_PREVIEW_ZOOM_MAX, nextValue));
    setReceiptPreviewZoom(Math.round(clamped * 100) / 100);
  }

  function handleZoomOutReceiptPreview(): void {
    updateReceiptPreviewZoom(receiptPreviewZoom - RECEIPT_PREVIEW_ZOOM_STEP);
  }

  function handleZoomInReceiptPreview(): void {
    updateReceiptPreviewZoom(receiptPreviewZoom + RECEIPT_PREVIEW_ZOOM_STEP);
  }

  async function resolveReceiptPayload(kind: OrderReceiptKind): Promise<{
    latestDetail: OrderDetail;
    printerSettings: Awaited<ReturnType<typeof getPrinterLocalSettings>>;
    noteSettings: Awaited<ReturnType<typeof getPrinterNoteSettings>>;
    receiptText: string;
  }> {
    if (!detail) {
      throw new Error("Detail pesanan belum siap.");
    }

    const latestDetail = await getOrderDetail(detail.id).catch(() => detail);
    if (latestDetail !== detail) {
      setDetail(latestDetail);
    }

    const printerSettings = await getPrinterLocalSettings(selectedOutlet?.id).catch(() => DEFAULT_PRINTER_LOCAL_SETTINGS);
    const noteSettings = await getPrinterNoteSettings(selectedOutlet?.id).catch(() => ({
      ...DEFAULT_PRINTER_NOTE_SETTINGS,
      profileName: selectedOutlet?.name || "",
    }));
    const receiptText = buildOrderReceiptText({
      kind,
      order: latestDetail,
      outletLabel,
      paperWidth: printerSettings.paperWidth,
      noteSettings,
    });

    return {
      latestDetail,
      printerSettings,
      noteSettings,
      receiptText,
    };
  }

  async function loadReceiptPreview(kind: OrderReceiptKind): Promise<void> {
    const payload = await resolveReceiptPayload(kind);
    setReceiptPreviewPaperWidth(payload.printerSettings.paperWidth);
    setReceiptPreviewText(payload.receiptText.trimEnd());
  }

  async function handleOpenReceiptPreview(initialKind: OrderReceiptKind = "customer"): Promise<void> {
    if (!detail || isReceiptActionBusy) {
      return;
    }

    setPreparingReceiptPreview(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      setReceiptPreviewZoom(1);
      setReceiptPreviewKind(initialKind);
      await loadReceiptPreview(initialKind);
      setShowReceiptPreviewModal(true);
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal menampilkan preview resi.";
      setErrorMessage(message);
    } finally {
      setPreparingReceiptPreview(false);
    }
  }

  async function handleSwitchReceiptPreviewKind(kind: OrderReceiptKind): Promise<void> {
    if (kind === receiptPreviewKind || !showReceiptPreviewModal || isReceiptActionBusy) {
      return;
    }

    const previous = receiptPreviewKind;
    setReceiptPreviewKind(kind);
    setPreparingReceiptPreview(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      await loadReceiptPreview(kind);
    } catch (error) {
      setReceiptPreviewKind(previous);
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal memuat resi.";
      setErrorMessage(message);
    } finally {
      setPreparingReceiptPreview(false);
    }
  }

  async function handlePrintReceipt(kind: OrderReceiptKind = "customer"): Promise<void> {
    if (!detail || isReceiptActionBusy) {
      return;
    }

    setPrintingReceipt(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const payload = await resolveReceiptPayload(kind);
      const pairedPrinter = await getStoredBluetoothThermalPrinter(selectedOutlet?.id);
      if (!pairedPrinter?.address) {
        setErrorMessage("Belum ada printer thermal yang tersanding. Atur dulu di menu Printer & Nota.");
        return;
      }

      await printBluetoothThermalReceipt(
        pairedPrinter.address,
        payload.receiptText,
        payload.printerSettings,
        payload.noteSettings.logoUrl || null,
      );
      setActionMessage(kind === "production" ? "Resi produksi sedang dicetak." : "Resi pelanggan sedang dicetak.");
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal mencetak resi.";
      setErrorMessage(message);
    } finally {
      setPrintingReceipt(false);
    }
  }

  async function handleSendReceipt(kind: OrderReceiptKind = receiptPreviewKind): Promise<void> {
    if (!detail || isReceiptActionBusy) {
      return;
    }

    setSendingReceipt(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const payload = await resolveReceiptPayload(kind);
      await Share.share({
        title: kind === "production" ? "Resi Produksi Laundry" : "Resi Pelanggan Laundry",
        message: payload.receiptText,
      });
      setActionMessage(kind === "production" ? "Resi produksi siap dikirim." : "Resi pelanggan siap dikirim.");
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal membuka opsi kirim resi.";
      setErrorMessage(message);
    } finally {
      setSendingReceipt(false);
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
                {canCancelOrder ? (
                  <Pressable
                    disabled={cancellingOrder || deletingOrder || isOrderCancelled}
                    onPress={handleOpenCancelReasonModal}
                    style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}
                  >
                    <Ionicons color={theme.colors.warning} name="close-circle-outline" size={18} />
                  </Pressable>
                ) : null}
                {canDeleteOrder ? (
                  <Pressable
                    disabled={cancellingOrder || deletingOrder || !isOrderCancelled}
                    onPress={handleConfirmDeleteOrder}
                    style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}
                  >
                    <Ionicons color={theme.colors.danger} name="trash-outline" size={18} />
                  </Pressable>
                ) : null}
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
            </View>

            <View style={styles.statusRow}>
              <StatusPill label={`Laundry: ${formatStatusLabel(detail.laundry_status)}`} tone={resolveLaundryTone(detail.laundry_status)} />
              <StatusPill
                label={hasCourierFlow ? `Kurir ${courierModeLabel}: ${formatStatusLabel(currentCourierStatus)}` : "Kurir: Tidak"}
                tone={hasCourierFlow ? resolveCourierTone(currentCourierStatus) : "neutral"}
              />
            </View>
          </AppPanel>

          {hasCourierFlow ? (
            <AppPanel style={styles.summaryPanel}>
              <Pressable onPress={() => setShowDeliveryInfo((current) => !current)} style={({ pressed }) => [styles.sectionHeaderRow, styles.sectionHeaderButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Text style={styles.sectionTitle}>Informasi Logistik ({courierModeLabel})</Text>
                <Ionicons color={theme.colors.textSecondary} name={showDeliveryInfo ? "chevron-up" : "chevron-down"} size={18} />
              </Pressable>
              {showDeliveryInfo ? (
                <>
                  {requiresPickup ? <Text style={styles.noteHint}>Jemput: {pickupAddress ?? "-"}{pickupSchedule ? ` • ${pickupSchedule}` : ""}</Text> : null}
                  {requiresDelivery ? (
                    <Text style={styles.noteHint}>
                      Antar: {deliveryAddress ?? "-"}
                      {deliverySchedule
                        ? ` • ${deliverySchedule}`
                        : requiresPickup
                          ? " • Otomatis setelah input timbang"
                          : ""}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </AppPanel>
          ) : null}

          {isOrderCancelled ? (
            <AppPanel style={[styles.summaryPanel, styles.cancelledInfoPanel]}>
              <View style={styles.cancelledInfoRow}>
                <Ionicons color={theme.colors.danger} name="close-circle-outline" size={18} />
                <View style={styles.cancelledInfoCopy}>
                  <Text style={styles.sectionTitle}>Pesanan Dibatalkan</Text>
                  <Text style={styles.noteHint}>
                    {detail.cancelled_at ? `Dibatalkan pada ${formatDateTime(detail.cancelled_at)}.` : "Pesanan ini sudah dibatalkan."}
                  </Text>
                  {detail.cancelled_reason?.trim() ? <Text style={styles.noteHint}>Alasan: {detail.cancelled_reason.trim()}</Text> : null}
                </View>
              </View>
            </AppPanel>
          ) : null}

          {shouldShowPickupGuidancePanel ? (
            <AppPanel style={[styles.summaryPanel, styles.pickupInstructionPanel]}>
              <View style={styles.pickupInstructionHeader}>
                <View style={styles.pickupInstructionIconWrap}>
                  <Ionicons color={theme.colors.info} name="bicycle-outline" size={17} />
                </View>
                <View style={styles.pickupInstructionHeaderCopy}>
                  <Text style={styles.sectionTitle}>Instruksi Penjemputan</Text>
                  <Text style={styles.pickupInstructionStateText}>{pickupInstructionState}</Text>
                </View>
              </View>

              <View style={styles.pickupInstructionStatusChip}>
                <Ionicons color={theme.colors.info} name="time-outline" size={14} />
                <Text style={styles.pickupInstructionStatusChipText}>Status: {formatStatusLabel(currentCourierStatus)}</Text>
              </View>

              <View style={styles.pickupInstructionSteps}>
                <View style={styles.pickupInstructionStepRow}>
                  <View style={styles.pickupInstructionStepBadge}>
                    <Text style={styles.pickupInstructionStepBadgeText}>1</Text>
                  </View>
                  <Text style={styles.pickupInstructionStepText}>{pickupInstructionNow}</Text>
                </View>

                {pickupInstructionNext ? (
                  <View style={styles.pickupInstructionStepRow}>
                    <View style={styles.pickupInstructionStepBadge}>
                      <Text style={styles.pickupInstructionStepBadgeText}>2</Text>
                    </View>
                    <Text style={styles.pickupInstructionStepText}>{pickupInstructionNext}</Text>
                  </View>
                ) : null}

                {pickupInstructionLocation ? (
                  <View style={styles.pickupInstructionStepRow}>
                    <View style={styles.pickupInstructionStepBadge}>
                      <Text style={styles.pickupInstructionStepBadgeText}>3</Text>
                    </View>
                    <Text style={styles.pickupInstructionStepText}>Lokasi jemput: {pickupInstructionLocation}</Text>
                  </View>
                ) : null}
              </View>

              {showInputServiceButton ? (
                <AppButton
                  leftElement={<Ionicons color={theme.colors.primaryContrast} name="create-outline" size={16} />}
                  onPress={handleInputServiceItems}
                  title="Buka Input Layanan"
                />
              ) : null}
            </AppPanel>
          ) : (
            <>
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
                  {canEditOrder && !isOrderCancelled ? (
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
                  <>
                    <Text style={styles.emptyText}>Belum ada item order.</Text>
                    {requiresPickup ? <Text style={styles.noteHint}>Mode jemput: input item setelah barang dijemput/sampai outlet.</Text> : null}
                  </>
                )}

                <View style={styles.quickIconRow}>
                  <Pressable
                    disabled={isReceiptActionBusy}
                    onPress={() => void handleOpenReceiptPreview("customer")}
                    style={({ pressed }) => [styles.iconActionButton, styles.iconActionButtonWide, pressed ? styles.heroIconButtonPressed : null]}
                  >
                    <Ionicons color={theme.colors.info} name="receipt-outline" size={18} />
                    <Text style={styles.iconActionButtonText}>Resi</Text>
                  </Pressable>
                  <Pressable onPress={handleToggleHistory} style={({ pressed }) => [styles.ghostPill, showHistory ? styles.ghostPillActive : null, pressed ? styles.heroIconButtonPressed : null]}>
                    <Text style={[styles.ghostPillText, showHistory ? styles.ghostPillTextActive : null]}>{showHistory ? "Tutup Riwayat" : "Riwayat"}</Text>
                  </Pressable>
                </View>
              </AppPanel>
            </>
          )}

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

          <Modal
            animationType="fade"
            onRequestClose={handleCloseReceiptPreviewModal}
            statusBarTranslucent
            transparent
            visible={showReceiptPreviewModal}
          >
            <View style={styles.receiptModalBackdrop}>
              <SafeAreaView edges={["top", "bottom"]} style={styles.receiptModalSafeArea}>
                <View style={styles.receiptModalCard}>
                  <View style={styles.receiptModalHeader}>
                    <View style={styles.receiptModalHeaderMain}>
                      <View style={styles.receiptModalHeaderIconWrap}>
                        <Ionicons color={theme.colors.info} name="receipt-outline" size={16} />
                      </View>
                      <View style={styles.receiptModalHeaderCopy}>
                        <Text style={styles.receiptModalTitle}>Preview Resi</Text>
                        <Text style={styles.receiptModalHint}>Menyesuaikan pengaturan Printer & Nota outlet aktif.</Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={isReceiptActionBusy}
                      hitSlop={6}
                      onPress={handleCloseReceiptPreviewModal}
                      style={({ pressed }) => [styles.receiptModalCloseButton, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <Ionicons color={theme.colors.textSecondary} name="close-outline" size={18} />
                    </Pressable>
                  </View>

                  <View style={styles.receiptModalMetaRow}>
                    <Text style={styles.receiptModalMetaPill}>{receiptPreviewPaperWidth === "80mm" ? "Kertas 80mm" : "Kertas 58mm"}</Text>
                    <Text style={styles.receiptModalMetaText}>{receiptPreviewKindLabel}</Text>
                  </View>

                  <View style={styles.receiptTabRow}>
                    <Pressable
                      disabled={isReceiptActionBusy}
                      onPress={() => void handleSwitchReceiptPreviewKind("customer")}
                      style={({ pressed }) => [styles.receiptTabButton, receiptPreviewKind === "customer" ? styles.receiptTabButtonActive : null, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <Text style={[styles.receiptTabButtonText, receiptPreviewKind === "customer" ? styles.receiptTabButtonTextActive : null]}>Resi Pelanggan</Text>
                    </Pressable>
                    <Pressable
                      disabled={isReceiptActionBusy}
                      onPress={() => void handleSwitchReceiptPreviewKind("production")}
                      style={({ pressed }) => [styles.receiptTabButton, receiptPreviewKind === "production" ? styles.receiptTabButtonActive : null, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <Text style={[styles.receiptTabButtonText, receiptPreviewKind === "production" ? styles.receiptTabButtonTextActive : null]}>Resi Produksi</Text>
                    </Pressable>
                  </View>

                  <View style={styles.receiptPreviewToolsRow}>
                    <View style={styles.receiptPreviewZoomGroup}>
                      <Pressable
                        accessibilityHint="Perkecil tampilan resi"
                        accessibilityLabel="Perkecil preview resi"
                        accessibilityRole="button"
                        disabled={!canZoomOutReceiptPreview}
                        onPress={handleZoomOutReceiptPreview}
                        style={({ pressed }) => [
                          styles.receiptPreviewZoomButton,
                          !canZoomOutReceiptPreview ? styles.receiptPreviewZoomButtonDisabled : null,
                          pressed ? styles.heroIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons color={!canZoomOutReceiptPreview ? theme.colors.textMuted : theme.colors.textSecondary} name="remove" size={15} />
                      </Pressable>
                      <Pressable
                        accessibilityHint="Perbesar tampilan resi"
                        accessibilityLabel="Perbesar preview resi"
                        accessibilityRole="button"
                        disabled={!canZoomInReceiptPreview}
                        onPress={handleZoomInReceiptPreview}
                        style={({ pressed }) => [
                          styles.receiptPreviewZoomButton,
                          !canZoomInReceiptPreview ? styles.receiptPreviewZoomButtonDisabled : null,
                          pressed ? styles.heroIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons color={!canZoomInReceiptPreview ? theme.colors.textMuted : theme.colors.textSecondary} name="add" size={15} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.receiptPreviewCard}>
                    {preparingReceiptPreview ? (
                      <View style={styles.receiptPreviewLoadingWrap}>
                        <ActivityIndicator color={theme.colors.primaryStrong} size="small" />
                        <Text style={styles.receiptPreviewLoadingText}>Menyiapkan resi...</Text>
                      </View>
                    ) : (
                      <ScrollView
                        contentContainerStyle={styles.receiptPreviewScrollContent}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        style={styles.receiptPreviewScrollView}
                      >
                        <ScrollView
                          contentContainerStyle={styles.receiptPreviewHorizontalContent}
                          horizontal
                          nestedScrollEnabled
                          showsHorizontalScrollIndicator
                          style={styles.receiptPreviewHorizontalScroll}
                        >
                          <View style={[styles.receiptPaperSheet, { width: receiptPaperPreviewWidth }]}>
                            <View style={styles.receiptPaperEdgeRow}>
                              <View style={styles.receiptPaperPunch} />
                              <View style={styles.receiptPaperDash} />
                              <View style={styles.receiptPaperPunch} />
                            </View>
                            <View style={styles.receiptPaperBody}>
                              <Text
                                style={[
                                  styles.receiptPreviewMono,
                                  { fontSize: receiptPreviewFontSize, lineHeight: receiptPreviewLineHeight },
                                ]}
                              >
                                {receiptPreviewText}
                              </Text>
                            </View>
                            <View style={styles.receiptPaperEdgeRow}>
                              <View style={styles.receiptPaperPunch} />
                              <View style={styles.receiptPaperDash} />
                              <View style={styles.receiptPaperPunch} />
                            </View>
                          </View>
                        </ScrollView>
                      </ScrollView>
                    )}
                  </View>

                  <View style={styles.receiptModalFooter}>
                    <View style={styles.receiptModalActionRow}>
                      <View style={styles.receiptModalActionButton}>
                        <AppButton
                          disabled={isReceiptActionBusy}
                          leftElement={<Ionicons color={theme.colors.primaryContrast} name="print-outline" size={16} />}
                          loading={printingReceipt}
                          onPress={() => void handlePrintReceipt(receiptPreviewKind)}
                          title="Print"
                        />
                      </View>
                      <View style={styles.receiptModalActionButton}>
                        <AppButton
                          disabled={isReceiptActionBusy}
                          leftElement={<Ionicons color={theme.colors.info} name="share-social-outline" size={16} />}
                          loading={sendingReceipt}
                          onPress={() => void handleSendReceipt(receiptPreviewKind)}
                          title="Kirim Resi"
                          variant="secondary"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </SafeAreaView>
            </View>
          </Modal>

          <Modal
            animationType="fade"
            onRequestClose={handleCloseCancelReasonModal}
            transparent
            visible={showCancelReasonModal}
          >
            <View style={styles.cancelModalBackdrop}>
              <View style={styles.cancelModalCard}>
                <View style={styles.cancelModalHeader}>
                  <View style={styles.cancelModalHeaderIconWrap}>
                    <Ionicons color={theme.colors.warning} name="close-circle-outline" size={16} />
                  </View>
                  <View style={styles.cancelModalHeaderCopy}>
                    <Text style={styles.cancelModalTitle}>Alasan Pembatalan</Text>
                    <Text style={styles.cancelModalHint}>Pilih satu alasan agar pembatalan tercatat jelas.</Text>
                  </View>
                </View>
                <View style={styles.cancelModalMetaRow}>
                  <Text style={styles.cancelModalMetaPill}>Wajib dipilih</Text>
                  <Text style={styles.cancelModalMetaText}>{selectedCancelReasonId ? "1 alasan dipilih" : "Belum ada pilihan"}</Text>
                </View>
                <View style={styles.cancelReasonOptionWrap}>
                  <ScrollView
                    contentContainerStyle={styles.cancelReasonOptionList}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {CANCEL_REASON_OPTIONS.map((option) => {
                      const active = selectedCancelReasonId === option.id;
                      return (
                        <Pressable
                          key={option.id}
                          disabled={cancellingOrder}
                          onPress={() => setSelectedCancelReasonId(option.id)}
                          style={({ pressed }) => [
                            styles.cancelReasonOptionItem,
                            active ? styles.cancelReasonOptionItemActive : null,
                            pressed ? styles.heroIconButtonPressed : null,
                          ]}
                        >
                          <View style={[styles.cancelReasonOptionIndicator, active ? styles.cancelReasonOptionIndicatorActive : null]}>
                            {active ? <Ionicons color={theme.colors.primaryContrast} name="checkmark" size={12} /> : null}
                          </View>
                          <Text style={[styles.cancelReasonOptionText, active ? styles.cancelReasonOptionTextActive : null]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {selectedCancelReasonId === CANCEL_REASON_OTHER_ID ? (
                  <View style={styles.cancelModalInputBlock}>
                    <Text style={styles.cancelModalInputLabel}>Alasan Lainnya</Text>
                    <TextInput
                      autoFocus
                      editable={!cancellingOrder}
                      maxLength={300}
                      multiline
                      onChangeText={setCancelReasonOtherDraft}
                      placeholder="Tulis alasan lainnya..."
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.cancelModalInput}
                      textAlignVertical="top"
                      value={cancelReasonOtherDraft}
                    />
                    <Text style={styles.cancelModalInputMeta}>{cancelReasonOtherDraft.length}/300 karakter</Text>
                  </View>
                ) : null}
                <View style={styles.cancelModalActionRow}>
                  <View style={styles.cancelModalActionButton}>
                    <AppButton
                      disabled={cancellingOrder}
                      onPress={handleCloseCancelReasonModal}
                      title="Tutup"
                      variant="ghost"
                    />
                  </View>
                  <View style={styles.cancelModalActionButton}>
                    <AppButton
                      disabled={cancellingOrder}
                      leftElement={<Ionicons color={theme.colors.primaryContrast} name="close-circle-outline" size={16} />}
                      loading={cancellingOrder}
                      onPress={() => void handleSubmitCancelReason()}
                      title="Batalkan"
                    />
                  </View>
                </View>
              </View>
            </View>
          </Modal>

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
                {canAdvanceLaundryStatus && nextLaundryStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    leftElement={<Ionicons color={theme.colors.primaryContrast} name="checkmark-done-outline" size={17} />}
                    loading={updatingLaundry}
                    onPress={() => void handleNextLaundry()}
                    title={
                      isLaundryCompletionBlocked
                        ? "Lunasi Tagihan Dulu"
                        : nextLaundryActionLabel ?? "Perbarui Status Laundry"
                    }
                  />
                ) : null}

                {canUpdateCourier && hasCourierFlow && nextCourierStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    leftElement={<Ionicons color={theme.colors.primaryContrast} name="bicycle-outline" size={17} />}
                    loading={updatingCourier}
                    onPress={() => void handleNextCourier()}
                    title={
                      isCourierCompletionBlocked
                        ? "Lunasi Tagihan Dulu"
                        : nextCourierActionLabel ?? "Perbarui Status Kurir"
                    }
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
    iconActionButtonWide: {
      width: undefined,
      minHeight: 38,
      paddingHorizontal: 12,
      flexDirection: "row",
      gap: 6,
    },
    iconActionButtonText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
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
    pickupInstructionPanel: {
      backgroundColor: theme.mode === "dark" ? "rgba(20, 35, 52, 0.56)" : "rgba(246, 251, 255, 0.98)",
      borderColor: theme.mode === "dark" ? "rgba(115, 173, 236, 0.35)" : "rgba(19, 104, 188, 0.2)",
      gap: 10,
    },
    pickupInstructionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pickupInstructionIconWrap: {
      width: 34,
      height: 34,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(115, 173, 236, 0.4)" : "rgba(19, 104, 188, 0.26)",
      backgroundColor: theme.mode === "dark" ? "rgba(16, 30, 46, 0.78)" : "rgba(236, 245, 255, 1)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    pickupInstructionHeaderCopy: {
      flex: 1,
      gap: 1,
    },
    pickupInstructionStateText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
    pickupInstructionStatusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(115, 173, 236, 0.38)" : "rgba(19, 104, 188, 0.24)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(18, 34, 52, 0.72)" : "rgba(233, 244, 255, 0.95)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    pickupInstructionStatusChipText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 15,
    },
    pickupInstructionSteps: {
      gap: 8,
    },
    pickupInstructionStepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    pickupInstructionStepBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(115, 173, 236, 0.45)" : "rgba(19, 104, 188, 0.28)",
      backgroundColor: theme.mode === "dark" ? "rgba(18, 34, 52, 0.78)" : "rgba(233, 244, 255, 0.95)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    pickupInstructionStepBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      lineHeight: 12,
    },
    pickupInstructionStepText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 17,
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
    receiptModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(10, 16, 28, 0.64)",
    },
    receiptModalSafeArea: {
      flex: 1,
    },
    receiptModalCard: {
      flex: 1,
      width: "100%",
      borderTopLeftRadius: isTablet ? theme.radii.xl : 0,
      borderTopRightRadius: isTablet ? theme.radii.xl : 0,
      backgroundColor: theme.colors.background,
      paddingHorizontal: isTablet ? 20 : 14,
      paddingTop: isTablet ? 16 : 12,
      paddingBottom: isTablet ? 10 : 8,
      gap: 10,
    },
    receiptModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    receiptModalHeaderMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    receiptModalHeaderIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(87,168,250,0.44)" : "rgba(19,104,188,0.28)",
      backgroundColor: theme.mode === "dark" ? "rgba(35,77,115,0.35)" : "rgba(235,245,255,0.95)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    receiptModalHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    receiptModalTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 17 : 15,
    },
    receiptModalHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    receiptModalCloseButton: {
      width: 30,
      height: 30,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceSoft,
    },
    receiptModalMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    receiptModalMetaPill: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(87,168,250,0.45)" : "rgba(19,104,188,0.22)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(35,77,115,0.35)" : "rgba(235,245,255,0.95)",
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: "hidden",
    },
    receiptModalMetaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    receiptTabRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    receiptTabButton: {
      flex: 1,
      minHeight: 36,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    receiptTabButtonActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    receiptTabButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 15,
    },
    receiptTabButtonTextActive: {
      color: theme.colors.info,
    },
    receiptPreviewToolsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
    },
    receiptPreviewZoomGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    receiptPreviewZoomButton: {
      width: 30,
      height: 30,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceSoft,
    },
    receiptPreviewZoomButtonDisabled: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderStrong,
    },
    receiptPreviewCard: {
      flex: 1,
      width: "100%",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "rgba(18, 28, 40, 0.94)" : "#eef1f4",
      paddingHorizontal: 10,
      paddingVertical: 10,
      minHeight: 0,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    receiptPaperSheet: {
      alignSelf: "center",
      borderWidth: 1,
      borderColor: "#d7dce3",
      borderRadius: 10,
      backgroundColor: "#ffffff",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    receiptPaperEdgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      backgroundColor: "#ffffff",
    },
    receiptPaperDash: {
      flex: 1,
      borderTopWidth: 1,
      borderStyle: "dashed",
      borderColor: "#d9dde4",
    },
    receiptPaperPunch: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#ffffff",
      borderWidth: 1,
      borderColor: "#d9dde4",
    },
    receiptPreviewScrollView: {
      flex: 1,
      width: "100%",
    },
    receiptPreviewScrollContent: {
      flexGrow: 1,
      alignItems: "stretch",
      justifyContent: "flex-start",
      paddingVertical: 2,
    },
    receiptPreviewHorizontalScroll: {
      width: "100%",
    },
    receiptPreviewHorizontalContent: {
      flexGrow: 1,
      alignItems: "flex-start",
      justifyContent: "center",
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    receiptPaperBody: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
    },
    receiptPreviewLoadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 180,
    },
    receiptPreviewLoadingText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    receiptPreviewMono: {
      color: "#1f2430",
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: theme.fonts.medium }),
    },
    receiptModalFooter: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 10,
      paddingBottom: isTablet ? 6 : 4,
    },
    receiptModalActionRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
    },
    receiptModalActionButton: {
      flex: 1,
    },
    cancelModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(10, 16, 28, 0.48)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: isTablet ? 34 : 20,
    },
    cancelModalCard: {
      width: "100%",
      maxWidth: 520,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    cancelModalTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 17 : 15,
    },
    cancelModalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    cancelModalHeaderIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255,187,92,0.4)" : "rgba(245,151,26,0.3)",
      backgroundColor: theme.mode === "dark" ? "rgba(245,151,26,0.16)" : "rgba(255,245,226,0.95)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    cancelModalHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    cancelModalHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    cancelModalMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    cancelModalMetaPill: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(87,168,250,0.45)" : "rgba(19,104,188,0.22)",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(35,77,115,0.35)" : "rgba(235,245,255,0.95)",
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: "hidden",
    },
    cancelModalMetaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    cancelReasonOptionWrap: {
      maxHeight: isTablet ? 280 : 235,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      padding: 7,
    },
    cancelReasonOptionList: {
      gap: 7,
    },
    cancelReasonOptionItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    cancelReasonOptionItemActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    cancelReasonOptionIndicator: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    cancelReasonOptionIndicatorActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.info,
    },
    cancelReasonOptionText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 16,
    },
    cancelReasonOptionTextActive: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
    },
    cancelModalInputBlock: {
      gap: 6,
    },
    cancelModalInputLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
    cancelModalInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      minHeight: 96,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    cancelModalInputMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
      textAlign: "right",
    },
    cancelModalActionRow: {
      flexDirection: isCompactLandscape ? "row" : "column",
      alignItems: "stretch",
      gap: 8,
    },
    cancelModalActionButton: {
      flex: 1,
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
    cancelledInfoPanel: {
      borderColor: theme.mode === "dark" ? "rgba(255,111,129,0.42)" : "rgba(229,72,77,0.22)",
      backgroundColor: theme.mode === "dark" ? "rgba(255,111,129,0.08)" : "rgba(255,244,244,0.95)",
    },
    cancelledInfoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    cancelledInfoCopy: {
      flex: 1,
      gap: 2,
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
