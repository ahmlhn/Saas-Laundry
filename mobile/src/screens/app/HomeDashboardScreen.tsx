import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight, type BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { listNotifications } from "../../features/notifications/notificationApi";
import { countOrdersByBucket, type OrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { toDateToken } from "../../lib/dateTime";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList, AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = BottomTabNavigationProp<AppTabParamList, "HomeTab">;
type LoadMode = "initial" | "refresh";
type WorkspaceMode = "owner" | "cashier" | "worker" | "courier";
type ToneKey = "warning" | "danger" | "info" | "success";

interface ToneStyle {
  softBackground: string;
  strongBackground: string;
  foreground: string;
  border: string;
}

interface WorkspaceModeMeta {
  key: WorkspaceMode;
  label: string;
  shortLabel: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface HeroState {
  title: string;
  subtitle: string;
  eyebrow: string;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
}

interface ActionTarget {
  type: "orders" | "quick-action";
  bucket?: OrderBucket | null;
}

interface FocusItemState {
  key: string;
  title: string;
  subtitle: string;
  cta: string;
  tone: ToneKey;
  icon: keyof typeof Ionicons.glyphMap;
  target: ActionTarget;
}

interface MetricCardState {
  key: string;
  label: string;
  value: string;
  badge: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneKey;
  target: ActionTarget;
}

interface LaneCardState {
  key: string;
  label: string;
  value: string;
  tone: ToneKey;
  target: ActionTarget;
}

const MODE_META: Record<WorkspaceMode, WorkspaceModeMeta> = {
  owner: {
    key: "owner",
    label: "Owner / Admin",
    shortLabel: "Owner",
    hint: "Command center outlet dan keputusan operasional.",
    icon: "grid-outline",
  },
  cashier: {
    key: "cashier",
    label: "Kasir",
    shortLabel: "Kasir",
    hint: "Transaksi baru, pembayaran, dan pickup pending.",
    icon: "card-outline",
  },
  worker: {
    key: "worker",
    label: "Pekerja",
    shortLabel: "Worker",
    hint: "Antrian masuk, proses laundry, dan order siap serah.",
    icon: "shirt-outline",
  },
  courier: {
    key: "courier",
    label: "Kurir",
    shortLabel: "Kurir",
    hint: "Pickup, delivery, dan verifikasi alamat prioritas.",
    icon: "bicycle-outline",
  },
};

const numberFormatter = new Intl.NumberFormat("id-ID");
const compactFormatter = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCount(value: number): string {
  return numberFormatter.format(Math.max(Math.round(value), 0));
}

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return compactFormatter.format(Math.max(value, 0));
}

function formatMoney(value: number): string {
  return `Rp ${numberFormatter.format(Math.max(Math.round(value), 0))}`;
}

function formatCompactMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "Rp 0";
  }

  return `Rp ${compactFormatter.format(value)}`;
}

function getShiftLabel(date = new Date()): string {
  const hour = date.getHours();

  if (hour < 11) {
    return "Shift Pagi";
  }

  if (hour < 15) {
    return "Shift Siang";
  }

  if (hour < 19) {
    return "Shift Sore";
  }

  return "Shift Malam";
}

function formatLiveLabel(timezone?: string): string {
  try {
    const value = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date());

    return `${value} Live`;
  } catch {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} Live`;
  }
}

function isPickupOrder(order: OrderSummary): boolean {
  if (typeof order.requires_pickup === "boolean") {
    return order.requires_pickup;
  }

  return Boolean(order.is_pickup_delivery);
}

function isPickupPending(order: OrderSummary): boolean {
  if (!isPickupOrder(order)) {
    return false;
  }

  return !order.courier_status || order.courier_status === "pickup_pending";
}

function resolveAvailableModes(roles: string[]): WorkspaceMode[] {
  const modes: WorkspaceMode[] = [];

  if (roles.some((role) => ["owner", "admin", "tenant_manager"].includes(role))) {
    modes.push("owner");
  }
  if (roles.includes("cashier")) {
    modes.push("cashier");
  }
  if (roles.includes("worker")) {
    modes.push("worker");
  }
  if (roles.includes("courier")) {
    modes.push("courier");
  }

  return modes.length > 0 ? modes : ["owner"];
}

function resolveInitialMode(modes: WorkspaceMode[]): WorkspaceMode {
  if (modes.includes("cashier")) {
    return "cashier";
  }
  if (modes.includes("worker")) {
    return "worker";
  }
  if (modes.includes("courier")) {
    return "courier";
  }

  return modes[0] ?? "owner";
}

function resolveReadyBucket(siapAmbilCount: number, siapAntarCount: number): OrderBucket {
  return siapAntarCount >= siapAmbilCount ? "siap_antar" : "siap_ambil";
}

function buildHeroState(args: {
  mode: WorkspaceMode;
  selectedOutletName: string;
  shiftLabel: string;
  pickupPendingCount: number;
  dueCount: number;
  dueAmountTotal: number;
  activeOrderCount: number;
  cashToday: number;
  queueCount: number;
  processCount: number;
  readyCount: number;
  pickupTodayCount: number;
  deliveryReadyCount: number;
}): HeroState {
  if (args.mode === "cashier") {
    return {
      eyebrow: "MODE KASIR",
      title: "Shift kasir siap dijalankan.",
      subtitle: `${args.selectedOutletName} • ${args.shiftLabel.toLowerCase()} • fokus ke transaksi baru, pickup pending, dan pembayaran due.`,
      primaryValue: formatCount(args.activeOrderCount),
      primaryLabel: "order aktif",
      secondaryValue: formatCompactMoney(args.cashToday),
      secondaryLabel: "cash hari ini",
    };
  }

  if (args.mode === "worker") {
    return {
      eyebrow: "MODE PRODUKSI",
      title: "Antrian proses lebih mudah diawasi.",
      subtitle: `${args.selectedOutletName} • ${args.shiftLabel.toLowerCase()} • ringkas semua order masuk, proses, dan siap serah.`,
      primaryValue: formatCount(args.queueCount),
      primaryLabel: "antrian masuk",
      secondaryValue: formatCount(args.processCount),
      secondaryLabel: "sedang proses",
    };
  }

  if (args.mode === "courier") {
    return {
      eyebrow: "MODE KURIR",
      title: "Pickup dan delivery lebih terarah.",
      subtitle: `${args.selectedOutletName} • ${args.shiftLabel.toLowerCase()} • prioritaskan pickup pending dan order siap antar.`,
      primaryValue: formatCount(args.pickupPendingCount),
      primaryLabel: "pickup pending",
      secondaryValue: formatCount(args.deliveryReadyCount),
      secondaryLabel: "siap antar",
    };
  }

  return {
    eyebrow: "COMMAND CENTER",
    title: "Semua aksi penting ada di sini.",
    subtitle: `${args.selectedOutletName} • ${args.shiftLabel.toLowerCase()} • ${formatCount(Math.max(args.pickupPendingCount + args.dueCount, args.readyCount))} sinyal prioritas aktif.`,
    primaryValue: formatCount(Math.max(args.pickupPendingCount + args.dueCount, 0)),
    primaryLabel: "butuh tindakan",
    secondaryValue: formatCompactMoney(args.dueAmountTotal),
    secondaryLabel: "piutang aktif",
  };
}

function buildFocusItems(args: {
  mode: WorkspaceMode;
  pickupPendingCount: number;
  dueCount: number;
  dueAmountTotal: number;
  activeOrderCount: number;
  pendingCount: number;
  readyCount: number;
  queueCount: number;
  processCount: number;
  pickupTodayCount: number;
  deliveryReadyCount: number;
  readyBucket: OrderBucket;
}): FocusItemState[] {
  if (args.mode === "cashier") {
    return [
      {
        key: "new-order",
        title: "Transaksi baru siap dibuat",
        subtitle: `${formatCount(args.activeOrderCount)} order aktif sedang berjalan di outlet ini.`,
        cta: "Buat",
        tone: "info",
        icon: "add-circle-outline",
        target: { type: "quick-action" },
      },
      {
        key: "due",
        title: `${formatCount(args.dueCount)} tagihan belum lunas`,
        subtitle: `Nilai berjalan ${formatMoney(args.dueAmountTotal)} perlu follow up kasir.`,
        cta: "Tagih",
        tone: "danger",
        icon: "wallet-outline",
        target: { type: "orders", bucket: null },
      },
      {
        key: "pickup",
        title: `${formatCount(args.pickupPendingCount)} pickup menunggu konfirmasi`,
        subtitle: "Verifikasi alamat dan slot jemput sebelum pelanggan menunggu terlalu lama.",
        cta: "Tindak",
        tone: "warning",
        icon: "navigate-circle-outline",
        target: { type: "orders", bucket: "antrian" },
      },
    ];
  }

  if (args.mode === "worker") {
    return [
      {
        key: "queue",
        title: `${formatCount(args.queueCount)} order baru masuk antrian`,
        subtitle: "Pastikan penerimaan dan pengelompokan layanan berjalan tanpa bottleneck.",
        cta: "Mulai",
        tone: "warning",
        icon: "time-outline",
        target: { type: "orders", bucket: "antrian" },
      },
      {
        key: "process",
        title: `${formatCount(args.processCount)} order sedang diproses`,
        subtitle: "Pantau tahap cuci, kering, dan setrika yang masih berjalan.",
        cta: "Cek",
        tone: "info",
        icon: "color-wand-outline",
        target: { type: "orders", bucket: "proses" },
      },
      {
        key: "ready",
        title: `${formatCount(args.readyCount)} order siap diserahkan`,
        subtitle: "Dorong order siap ambil atau siap antar keluar dari lane secepatnya.",
        cta: "Serahkan",
        tone: "success",
        icon: "bag-check-outline",
        target: { type: "orders", bucket: args.readyBucket },
      },
    ];
  }

  if (args.mode === "courier") {
    return [
      {
        key: "pickup",
        title: `${formatCount(args.pickupPendingCount)} pickup masih pending`,
        subtitle: "Ada jadwal jemput yang butuh follow up sebelum kurir berangkat.",
        cta: "Ambil",
        tone: "warning",
        icon: "bicycle-outline",
        target: { type: "orders", bucket: "antrian" },
      },
      {
        key: "delivery",
        title: `${formatCount(args.deliveryReadyCount)} order siap antar`,
        subtitle: "Periksa alamat dan mulai delivery untuk order yang sudah ready.",
        cta: "Antar",
        tone: "info",
        icon: "car-outline",
        target: { type: "orders", bucket: "siap_antar" },
      },
      {
        key: "route",
        title: `${formatCount(args.pickupTodayCount)} tugas pickup hari ini`,
        subtitle: "Lihat seluruh tugas jemput dan antar aktif dalam satu board.",
        cta: "Board",
        tone: "success",
        icon: "map-outline",
        target: { type: "orders", bucket: null },
      },
    ];
  }

  return [
    {
      key: "pickup",
      title: `${formatCount(args.pickupPendingCount)} order menunggu konfirmasi pickup`,
      subtitle: "Kasir dan kurir perlu sinkron untuk alamat, slot jemput, dan penugasan.",
      cta: "Tindak",
      tone: "warning",
      icon: "navigate-outline",
      target: { type: "orders", bucket: "antrian" },
    },
    {
      key: "due",
      title: `${formatCount(args.dueCount)} tagihan belum lunas`,
      subtitle: `Piutang aktif ${formatMoney(args.dueAmountTotal)} masih berjalan di outlet ini.`,
      cta: "Tagih",
      tone: "danger",
      icon: "cash-outline",
      target: { type: "orders", bucket: null },
    },
    {
      key: "ready",
      title: `${formatCount(args.readyCount)} order siap diserahkan`,
      subtitle: `${formatCount(args.pendingCount)} order lain masih menunggu progres lane harian.`,
      cta: "Buka",
      tone: "info",
      icon: "grid-outline",
      target: { type: "orders", bucket: args.readyBucket },
    },
  ];
}

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape, insets.top), [theme, isTablet, isLandscape, insets.top]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet, session } = useSession();
  const outletId = selectedOutlet?.id;
  const outletTimezone = selectedOutlet?.timezone;
  const roles = session?.roles ?? [];
  const availableModes = useMemo(() => resolveAvailableModes(roles), [roles]);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>(resolveInitialMode(availableModes));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const firstFocusHandledRef = useRef(false);
  const entranceProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);

  useEffect(() => {
    if (!availableModes.includes(activeMode)) {
      setActiveMode(resolveInitialMode(availableModes));
    }
  }, [activeMode, availableModes]);

  const loadDashboard = useCallback(
    async (forceRefresh = false, mode: LoadMode = "initial"): Promise<void> => {
      if (!outletId) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const data = await listOrders({
          outletId,
          limit: 60,
          date: toDateToken(new Date(), outletTimezone),
          timezone: outletTimezone,
          forceRefresh,
        });
        setOrders(data);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        if (mode === "refresh") {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [outletId, outletTimezone]
  );

  const loadNotificationSummary = useCallback(async (): Promise<void> => {
    if (!session) {
      setNotificationUnreadCount(0);
      return;
    }

    try {
      const payload = await listNotifications({
        limit: 1,
      });
      setNotificationUnreadCount(payload.unread_count);
    } catch {
      setNotificationUnreadCount((current) => current);
    }
  }, [session]);

  useEffect(() => {
    firstFocusHandledRef.current = false;
    void loadDashboard(true, "initial");
    void loadNotificationSummary();
  }, [outletId, loadDashboard, loadNotificationSummary]);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationSummary();

      if (!outletId) {
        return;
      }

      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }

      void loadDashboard(true, orders.length > 0 ? "refresh" : "initial");
    }, [loadDashboard, loadNotificationSummary, orders.length, outletId])
  );

  const heroAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress,
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-16, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const bodyAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [0, 0.34, 1],
      }),
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [22, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const bucketCounts = useMemo(() => countOrdersByBucket(orders), [orders]);
  const pendingCount = useMemo(() => bucketCounts.antrian + bucketCounts.proses, [bucketCounts]);
  const readyCount = useMemo(() => bucketCounts.siap_ambil + bucketCounts.siap_antar, [bucketCounts]);
  const readyBucket = useMemo(() => resolveReadyBucket(bucketCounts.siap_ambil, bucketCounts.siap_antar), [bucketCounts.siap_ambil, bucketCounts.siap_antar]);
  const dueCount = useMemo(() => orders.filter((order) => order.due_amount > 0).length, [orders]);
  const dueAmountTotal = useMemo(() => orders.reduce((total, order) => total + Math.max(order.due_amount, 0), 0), [orders]);
  const pickupTodayCount = useMemo(() => orders.filter((order) => isPickupOrder(order)).length, [orders]);
  const pickupPendingCount = useMemo(() => orders.filter((order) => isPickupPending(order)).length, [orders]);
  const activeOrderCount = useMemo(() => Math.max(orders.length - bucketCounts.selesai, 0), [bucketCounts.selesai, orders.length]);
  const cashToday = useMemo(() => orders.reduce((total, order) => total + Math.max(order.paid_amount, 0), 0), [orders]);
  const quotaLimit = session?.quota.orders_limit ?? null;
  const quotaRemaining = session?.quota.orders_remaining ?? null;
  const quotaUsed = session?.quota.orders_used ?? 0;
  const shiftLabel = getShiftLabel();
  const liveLabel = formatLiveLabel(outletTimezone);
  const currentModeMeta = MODE_META[activeMode];
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";

  const heroState = useMemo(
    () =>
      buildHeroState({
        mode: activeMode,
        selectedOutletName: outletLabel,
        shiftLabel,
        pickupPendingCount,
        dueCount,
        dueAmountTotal,
        activeOrderCount,
        cashToday,
        queueCount: bucketCounts.antrian,
        processCount: bucketCounts.proses,
        readyCount,
        pickupTodayCount,
        deliveryReadyCount: bucketCounts.siap_antar,
      }),
    [activeMode, activeOrderCount, bucketCounts.antrian, bucketCounts.proses, bucketCounts.siap_antar, cashToday, dueAmountTotal, dueCount, outletLabel, pickupPendingCount, pickupTodayCount, readyCount, shiftLabel]
  );

  const focusItems = useMemo(
    () =>
      buildFocusItems({
        mode: activeMode,
        pickupPendingCount,
        dueCount,
        dueAmountTotal,
        activeOrderCount,
        pendingCount,
        readyCount,
        queueCount: bucketCounts.antrian,
        processCount: bucketCounts.proses,
        pickupTodayCount,
        deliveryReadyCount: bucketCounts.siap_antar,
        readyBucket,
      }),
    [activeMode, activeOrderCount, bucketCounts.antrian, bucketCounts.proses, bucketCounts.siap_antar, dueAmountTotal, dueCount, pendingCount, pickupPendingCount, pickupTodayCount, readyBucket, readyCount]
  );

  const metricCards: MetricCardState[] = useMemo(
    () => [
      {
        key: "active",
        label: "Order aktif",
        value: formatCount(activeOrderCount),
        badge: formatCompactCount(activeOrderCount),
        icon: "receipt-outline",
        tone: "info",
        target: { type: "orders", bucket: null },
      },
      {
        key: "due",
        label: "Belum lunas",
        value: formatCount(dueCount),
        badge: formatCompactCount(dueCount),
        icon: "wallet-outline",
        tone: "danger",
        target: { type: "orders", bucket: null },
      },
      {
        key: "pickup",
        label: "Pickup pending",
        value: formatCount(pickupPendingCount),
        badge: formatCompactCount(pickupTodayCount),
        icon: "navigate-outline",
        tone: "warning",
        target: { type: "orders", bucket: "antrian" },
      },
      {
        key: "quota",
        label: "Sisa kuota",
        value: quotaRemaining === null ? "∞" : formatCount(quotaRemaining),
        badge: quotaRemaining === null ? "∞" : formatCompactCount(quotaUsed),
        icon: "layers-outline",
        tone: "success",
        target: { type: "orders", bucket: null },
      },
    ],
    [activeOrderCount, dueCount, pickupPendingCount, pickupTodayCount, quotaRemaining, quotaUsed]
  );

  const laneCards: LaneCardState[] = useMemo(
    () => [
      {
        key: "queue",
        label: "Antrian",
        value: formatCount(bucketCounts.antrian),
        tone: "warning",
        target: { type: "orders", bucket: "antrian" },
      },
      {
        key: "process",
        label: "Proses",
        value: formatCount(bucketCounts.proses),
        tone: "info",
        target: { type: "orders", bucket: "proses" },
      },
      {
        key: "ready",
        label: "Siap",
        value: formatCount(readyCount),
        tone: "success",
        target: { type: "orders", bucket: readyBucket },
      },
    ],
    [bucketCounts.antrian, bucketCounts.proses, readyBucket, readyCount]
  );

  function toneStyles(tone: ToneKey): ToneStyle {
    if (tone === "warning") {
      return {
        softBackground: theme.mode === "dark" ? "#4a3718" : "#fff4de",
        strongBackground: theme.mode === "dark" ? "#6a4c1d" : "#f5bf55",
        foreground: theme.colors.warning,
        border: theme.mode === "dark" ? "#815f2c" : "#f1d6a5",
      };
    }

    if (tone === "danger") {
      return {
        softBackground: theme.mode === "dark" ? "#4a2432" : "#ffe8ed",
        strongBackground: theme.mode === "dark" ? "#7a2e45" : "#e35c76",
        foreground: theme.colors.danger,
        border: theme.mode === "dark" ? "#8d445c" : "#f3c1cd",
      };
    }

    if (tone === "success") {
      return {
        softBackground: theme.mode === "dark" ? "#1f4130" : "#edf9f1",
        strongBackground: theme.mode === "dark" ? "#24523b" : "#4cc488",
        foreground: theme.colors.success,
        border: theme.mode === "dark" ? "#2f6a4a" : "#bfe7cf",
      };
    }

    return {
      softBackground: theme.mode === "dark" ? "#17374f" : "#eef8ff",
      strongBackground: theme.mode === "dark" ? "#23597f" : "#2a7ce2",
      foreground: theme.colors.info,
      border: theme.mode === "dark" ? "#295a86" : "#bfd8ec",
    };
  }

  function handleOpenOrders(bucket: OrderBucket | null): void {
    navigation.navigate(
      "OrdersTab",
      bucket
        ? {
            screen: "OrdersToday",
            params: { initialBucket: bucket },
          }
        : {
            screen: "OrdersToday",
          }
    );
  }

  function handleActionTarget(target: ActionTarget): void {
    if (target.type === "quick-action") {
      navigation.getParent<NativeStackNavigationProp<AppRootStackParamList>>()?.navigate("OrderCreate", {
        openCreateStamp: Date.now(),
      });
      return;
    }

    handleOpenOrders(target.bucket ?? null);
  }

  return (
    <AppScreen backgroundColor={theme.mode === "dark" ? theme.colors.background : "#ffffff"} contentContainerStyle={styles.screenRoot} safeAreaEdges={["right", "left"]} showBackdrop={false}>
      <View style={styles.appHeader}>
        <View style={styles.heroBrandLockup}>
          <View style={styles.heroBrandMarkWrap}>
            <Image source={require("../../../assets/brand-mark.png")} style={styles.heroBrandMark} />
          </View>
          <View style={styles.heroBrandCopy}>
            <Text style={styles.heroBrandName}>cuci</Text>
          </View>
        </View>
        <Pressable onPress={() => navigation.navigate("AccountTab", { screen: "Notifications" })} style={({ pressed }) => [styles.heroNotificationButton, pressed ? styles.heroNotificationButtonPressed : null]}>
          <Ionicons color={theme.colors.textMuted} name="notifications-outline" size={24} />
          {notificationUnreadCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.xl + bottomTabBarHeight }]}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadDashboard(true, "refresh");
              void loadNotificationSummary();
            }}
            colors={[theme.colors.info]}
            progressBackgroundColor={theme.colors.surface}
            tintColor={theme.colors.info}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.bodyScroll}
      >
        <Animated.View style={[styles.heroCard, heroAnimatedStyle]}>
          <Text style={styles.heroTitle}>{heroState.title}</Text>
          <Text style={styles.heroSubtitle}>{heroState.subtitle}</Text>

          <View style={styles.heroChipRow}>
            <View style={styles.heroModeChip}>
              <Ionicons color={theme.colors.success} name={currentModeMeta.icon} size={14} />
              <Text style={styles.heroModeChipText}>{currentModeMeta.shortLabel}</Text>
            </View>
            <View style={styles.liveChip}>
              <Text style={styles.liveChipText}>{liveLabel}</Text>
            </View>
          </View>

          <View style={styles.heroStatRow}>
            <Pressable onPress={() => handleOpenOrders(null)} style={({ pressed }) => [styles.heroStatCard, pressed ? styles.heroStatCardPressed : null]}>
              <Text style={styles.heroStatValue}>{heroState.primaryValue}</Text>
              <Text style={styles.heroStatLabel}>{heroState.primaryLabel}</Text>
            </Pressable>
            <Pressable onPress={() => handleOpenOrders(null)} style={({ pressed }) => [styles.heroStatCard, pressed ? styles.heroStatCardPressed : null]}>
              <Text style={styles.heroStatValue}>{heroState.secondaryValue}</Text>
              <Text style={styles.heroStatLabel}>{heroState.secondaryLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>

        {errorMessage ? (
          <Animated.View style={[styles.errorBox, bodyAnimatedStyle]}>
            <Text style={styles.errorTitle}>Sinkronisasi ringkasan bermasalah</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </Animated.View>
        ) : null}

        <Animated.View style={bodyAnimatedStyle}>
          <AppPanel style={styles.modePanel}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mode kerja</Text>
              <Text style={styles.sectionHint}>Beranda berubah mengikuti fokus kerja aktif.</Text>
            </View>
            <View style={styles.modeChipGrid}>
              {availableModes.map((mode) => {
                const meta = MODE_META[mode];
                const active = activeMode === mode;

                return (
                  <Pressable key={mode} onPress={() => setActiveMode(mode)} style={({ pressed }) => [styles.modeChip, active ? styles.modeChipActive : null, pressed ? styles.modeChipPressed : null]}>
                    <Ionicons color={active ? "#ffffff" : theme.colors.textSecondary} name={meta.icon} size={16} />
                    <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </AppPanel>
        </Animated.View>

        {loading && orders.length === 0 ? (
          <Animated.View style={bodyAnimatedStyle}>
            <AppPanel style={styles.loadingPanel}>
              <ActivityIndicator color={theme.colors.info} />
              <Text style={styles.loadingText}>Memuat command center outlet...</Text>
            </AppPanel>
          </Animated.View>
        ) : null}

        <Animated.View style={bodyAnimatedStyle}>
          <AppPanel style={styles.commandPanel}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCompact}>
                <Text style={styles.sectionTitle}>Butuh tindakan sekarang</Text>
                <Text style={styles.sectionHint}>Tiga fokus teratas untuk mode kerja yang sedang aktif.</Text>
              </View>
              <Pressable onPress={() => handleOpenOrders(null)} style={({ pressed }) => [styles.sectionActionButton, pressed ? styles.sectionActionButtonPressed : null]}>
                <Text style={styles.sectionActionText}>Buka board</Text>
              </Pressable>
            </View>

            <View style={styles.focusList}>
              {focusItems.map((item) => {
                const tone = toneStyles(item.tone);

                return (
                  <Pressable key={item.key} onPress={() => handleActionTarget(item.target)} style={({ pressed }) => [styles.focusRow, { backgroundColor: tone.softBackground, borderColor: tone.border }, pressed ? styles.focusRowPressed : null]}>
                    <View style={[styles.focusIconWrap, { backgroundColor: tone.strongBackground }]}>
                      <Ionicons color="#ffffff" name={item.icon} size={18} />
                    </View>
                    <View style={styles.focusCopy}>
                      <Text style={styles.focusTitle}>{item.title}</Text>
                      <Text style={styles.focusSubtitle}>{item.subtitle}</Text>
                    </View>
                    <View style={[styles.focusCtaPill, { borderColor: tone.border }]}>
                      <Text style={[styles.focusCtaText, { color: tone.foreground }]}>{item.cta}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </AppPanel>
        </Animated.View>

        <Animated.View style={[styles.metricGrid, bodyAnimatedStyle]}>
          {metricCards.map((item) => {
            const tone = toneStyles(item.tone);

            return (
              <Pressable key={item.key} onPress={() => handleActionTarget(item.target)} style={({ pressed }) => [styles.metricCard, { borderColor: tone.border }, pressed ? styles.metricCardPressed : null]}>
                <View style={styles.metricTopRow}>
                  <View style={[styles.metricIconWrap, { backgroundColor: tone.softBackground }]}>
                    <Ionicons color={tone.foreground} name={item.icon} size={16} />
                  </View>
                  <Text style={[styles.metricBadgeText, { color: tone.foreground }]}>{item.badge}</Text>
                </View>
                <Text style={styles.metricValue}>{item.value}</Text>
                <Text style={styles.metricLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </Animated.View>

        <Animated.View style={bodyAnimatedStyle}>
          <AppPanel style={styles.lanePanel}>
            <View style={styles.laneBackdropPrimary} />
            <View style={styles.laneBackdropSecondary} />

            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCompact}>
                <Text style={styles.laneTitle}>Lane kerja hari ini</Text>
                <Text style={styles.laneHint}>Antrian, proses, dan order siap yang sedang hidup sekarang.</Text>
              </View>
              <Text style={styles.laneLiveLabel}>Live</Text>
            </View>

            <View style={styles.laneGrid}>
              {laneCards.map((lane) => {
                const tone = toneStyles(lane.tone);

                return (
                  <Pressable key={lane.key} onPress={() => handleActionTarget(lane.target)} style={({ pressed }) => [styles.laneCard, pressed ? styles.laneCardPressed : null]}>
                    <Text style={styles.laneLabel}>{lane.label}</Text>
                    <Text style={styles.laneValue}>{lane.value}</Text>
                    <View style={[styles.laneDot, { backgroundColor: tone.strongBackground }]} />
                  </Pressable>
                );
              })}
            </View>
          </AppPanel>
        </Animated.View>

        <Animated.View style={bodyAnimatedStyle}>
          <Pressable onPress={() => handleOpenOrders(null)} style={({ pressed }) => [styles.receivableStrip, pressed ? styles.receivableStripPressed : null]}>
            <View style={styles.receivableCopy}>
              <Text style={styles.receivableTitle}>{dueAmountTotal > 0 ? `Piutang aktif ${formatMoney(dueAmountTotal)}` : "Tidak ada piutang aktif"}</Text>
              <Text style={styles.receivableSubtitle}>
                {quotaLimit && quotaRemaining !== null
                  ? `Kuota ${formatCount(quotaUsed)} / ${formatCount(quotaLimit)} order periode ini`
                  : "Pantau invoice dan progres pembayaran langsung dari board pesanan."}
              </Text>
            </View>
            <View style={styles.receivablePill}>
              <Text style={styles.receivablePillText}>{`${formatCount(dueCount)} invoice`}</Text>
            </View>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isLandscape: boolean, topInset: number) {
  const horizontalPadding = isTablet ? theme.spacing.xl : theme.spacing.lg;
  const heroHeight = isTablet ? 258 : isLandscape ? 228 : 248;
  const metricWidth = isTablet ? "24%" : "48.2%";
  const laneCardWidth = isTablet || isLandscape ? "31.4%" : "31.2%";

  return StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: theme.mode === "dark" ? theme.colors.background : "#ffffff",
    },
    bodyScroll: {
      flex: 1,
      width: "100%",
      backgroundColor: theme.mode === "dark" ? theme.colors.background : "#f7fbff",
    },
    content: {
      paddingHorizontal: horizontalPadding,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.md,
    },
    appHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
      paddingHorizontal: horizontalPadding,
      paddingTop: topInset + (isTablet ? theme.spacing.sm : 8),
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.mode === "dark" ? theme.colors.background : "#ffffff",
    },
    heroCard: {
      position: "relative",
      minHeight: heroHeight - (isTablet ? 18 : 24),
      borderRadius: 28,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#ebeff2",
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : "#ffffff",
      justifyContent: "flex-start",
      gap: theme.spacing.sm,
      shadowColor: "#0b1218",
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.05,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    heroGradientBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0d6fc7",
    },
    heroGradientEdge: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "72%",
      backgroundColor: "#1cc8df",
      opacity: 0.58,
    },
    heroRing: {
      position: "absolute",
      top: -92,
      right: -72,
      width: 224,
      height: 224,
      borderRadius: 112,
      borderWidth: 34,
      borderColor: "rgba(255,255,255,0.1)",
    },
    heroWave: {
      position: "absolute",
      left: -50,
      right: 28,
      bottom: -114,
      height: 162,
      borderRadius: 118,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    heroWaveAccent: {
      position: "absolute",
      right: -36,
      bottom: -72,
      width: 164,
      height: 96,
      borderRadius: 60,
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    heroBrandRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    heroBrandLockup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    heroBrandMarkWrap: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    heroBrandMark: {
      width: 28,
      height: 28,
      resizeMode: "contain",
    },
    heroBrandCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroBrandName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 19,
      lineHeight: 23,
      textTransform: "lowercase",
    },
    heroNotificationButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    heroNotificationButtonPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.97 }],
    },
    notificationBadge: {
      position: "absolute",
      top: -3,
      right: -7,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.danger,
      borderWidth: 2,
      borderColor: theme.mode === "dark" ? theme.colors.background : "#ffffff",
    },
    notificationBadgeText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 9,
      lineHeight: 11,
    },
    heroEyebrow: {
      color: "rgba(255,255,255,0.84)",
      fontFamily: theme.fonts.heavy,
      fontSize: 11,
      letterSpacing: 1,
    },
    liveChip: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#dff1e8",
      backgroundColor: theme.mode === "dark" ? "#173326" : "#f4fbf7",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      minWidth: 90,
      alignItems: "center",
    },
    liveChipText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    heroTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 22,
      lineHeight: isTablet ? 32 : 27,
      maxWidth: "92%",
    },
    heroSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: "92%",
    },
    heroChipRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    heroModeChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#dff1e8",
      backgroundColor: theme.mode === "dark" ? "#173326" : "#f4fbf7",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    heroModeChipText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
    },
    heroModeHint: {
      color: "rgba(255,255,255,0.74)",
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
      maxWidth: "88%",
    },
    heroStatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroStatBlock: {
      minWidth: 0,
      gap: 2,
    },
    heroStatCard: {
      flex: 1,
      minHeight: isTablet ? 88 : 82,
      borderRadius: 22,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#edf1f4",
      backgroundColor: theme.mode === "dark" ? theme.colors.surfaceSoft : "#fbfcfd",
      justifyContent: "center",
      gap: 4,
    },
    heroStatCardPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.985 }],
    },
    heroDivider: {
      width: 1,
      height: 42,
      backgroundColor: "rgba(255,255,255,0.22)",
    },
    heroStatValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 28 : 24,
      lineHeight: isTablet ? 32 : 28,
    },
    heroStatLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    errorBox: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#804056" : "#f0bec8",
      backgroundColor: theme.mode === "dark" ? "#452434" : "#fff3f6",
      borderRadius: theme.radii.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    errorTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      lineHeight: 18,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    loadingPanel: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderRadius: theme.radii.xl,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    modePanel: {
      borderRadius: theme.radii.xl,
      gap: theme.spacing.sm,
    },
    sectionHeader: {
      gap: 2,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionHeaderCompact: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      lineHeight: 19,
    },
    sectionHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    sectionActionButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#17374f" : "#eef8ff",
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    sectionActionButtonPressed: {
      opacity: 0.82,
    },
    sectionActionText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    modeChipGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    modeChip: {
      minWidth: isTablet ? "23%" : "48.2%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    modeChipActive: {
      backgroundColor: theme.colors.primaryStrong,
      borderColor: theme.colors.primaryStrong,
    },
    modeChipPressed: {
      opacity: 0.84,
    },
    modeChipText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    modeChipTextActive: {
      color: "#ffffff",
    },
    commandPanel: {
      borderRadius: theme.radii.xl,
      gap: theme.spacing.sm,
    },
    focusList: {
      gap: theme.spacing.sm,
    },
    focusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    focusRowPressed: {
      opacity: 0.84,
    },
    focusIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    focusCopy: {
      flex: 1,
      gap: 2,
    },
    focusTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      lineHeight: 17,
    },
    focusSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    focusCtaPill: {
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
    },
    focusCtaText: {
      fontFamily: theme.fonts.bold,
      fontSize: 11,
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    metricCard: {
      width: metricWidth,
      borderWidth: 1,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 8,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? theme.shadows.cardOpacity : theme.shadows.cardOpacity - 0.02,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: theme.shadows.cardRadius,
      elevation: theme.shadows.cardElevation,
    },
    metricCardPressed: {
      opacity: 0.84,
    },
    metricTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    metricIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    metricBadgeText: {
      fontFamily: theme.fonts.bold,
      fontSize: 11,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 24,
      lineHeight: 28,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 15,
    },
    lanePanel: {
      position: "relative",
      overflow: "hidden",
      borderRadius: theme.radii.xl,
      borderColor: "rgba(255,255,255,0.08)",
      backgroundColor: "#0d365f",
      gap: theme.spacing.sm,
    },
    laneBackdropPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0d365f",
    },
    laneBackdropSecondary: {
      position: "absolute",
      top: -30,
      right: -30,
      width: 182,
      height: 182,
      borderRadius: 91,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    laneTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      lineHeight: 19,
    },
    laneHint: {
      color: "rgba(255,255,255,0.72)",
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    laneLiveLabel: {
      color: "rgba(255,255,255,0.78)",
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.3,
    },
    laneGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    laneCard: {
      width: laneCardWidth,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 6,
    },
    laneCardPressed: {
      opacity: 0.82,
    },
    laneLabel: {
      color: "rgba(255,255,255,0.72)",
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    laneValue: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 26,
      lineHeight: 30,
    },
    laneDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    receivableStrip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    receivableStripPressed: {
      opacity: 0.84,
    },
    receivableCopy: {
      flex: 1,
      gap: 2,
    },
    receivableTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      lineHeight: 17,
    },
    receivableSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    receivablePill: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#7a5928" : "#f1d6a5",
      backgroundColor: theme.mode === "dark" ? "#412e14" : "#fff4de",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    receivablePillText: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
  });
}
