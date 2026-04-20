import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight, type BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { listNotifications } from "../../features/notifications/notificationApi";
import { countOrdersByBucket, type OrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { canSeeQuickActionTab } from "../../lib/accessControl";
import { toDateToken } from "../../lib/dateTime";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList, AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = BottomTabNavigationProp<AppTabParamList, "HomeTab">;
type LoadMode = "initial" | "refresh";
type Tone = "info" | "success" | "warning" | "danger";

interface QuickActionItem {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  onPress: () => void;
  disabled?: boolean;
}

const numberFormatter = new Intl.NumberFormat("id-ID");

function formatCount(value: number) {
  return numberFormatter.format(Math.max(Math.round(value), 0));
}

function formatDayLabel(timezone?: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(new Date());
  } catch {
    return "Hari ini";
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Pagi ini";
  if (hour < 15) return "Siang ini";
  if (hour < 19) return "Sore ini";
  return "Malam ini";
}

function getHeaderTitleMetrics(label: string, isTablet: boolean) {
  const name = label.trim();
  const longestWord = name.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  const density = Math.max(name.length, Math.round(longestWord * 1.6));

  if (isTablet) {
    if (density >= 34) return { fontSize: 21, lineHeight: 27 };
    if (density >= 26) return { fontSize: 23, lineHeight: 29 };
    return { fontSize: 26, lineHeight: 32 };
  }

  if (density >= 34) return { fontSize: 17, lineHeight: 22 };
  if (density >= 26) return { fontSize: 19, lineHeight: 24 };
  if (density >= 20) return { fontSize: 21, lineHeight: 26 };
  return { fontSize: 22, lineHeight: 28 };
}

function isPickupPending(order: OrderSummary) {
  const requiresPickup = typeof order.requires_pickup === "boolean" ? order.requires_pickup : Boolean(order.is_pickup_delivery);
  return requiresPickup && (!order.courier_status || order.courier_status === "pickup_pending");
}

function toneStyle(theme: AppTheme, tone: Tone) {
  if (tone === "success") return { bg: theme.mode === "dark" ? "#173528" : "#edf9f2", border: theme.mode === "dark" ? "#245942" : "#bfe8cf", text: theme.colors.success };
  if (tone === "warning") return { bg: theme.mode === "dark" ? "#3d2d13" : "#fff6e7", border: theme.mode === "dark" ? "#6f5323" : "#f1d7a8", text: theme.colors.warning };
  if (tone === "danger") return { bg: theme.mode === "dark" ? "#43202a" : "#fff1f4", border: theme.mode === "dark" ? "#74404f" : "#f2c2cb", text: theme.colors.danger };
  return { bg: theme.mode === "dark" ? "#17324b" : "#edf6ff", border: theme.mode === "dark" ? "#31506d" : "#c7dff5", text: theme.colors.info };
}

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const styles = useMemo(() => createStyles(theme, isTablet), [theme, isTablet]);
  const { selectedOutlet, session } = useSession();
  const outletId = selectedOutlet?.id;
  const outletTimezone = selectedOutlet?.timezone;
  const roles = session?.roles ?? [];
  const canOpenCreateOrder = canSeeQuickActionTab(roles);
  const canCreateOrder = canOpenCreateOrder && Boolean(session?.quota.can_create_order);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const firstFocusHandledRef = useRef(false);

  const openCreateOrder = useCallback(() => {
    navigation.getParent<NativeStackNavigationProp<AppRootStackParamList>>()?.navigate("OrderCreate", { openCreateStamp: Date.now() });
  }, [navigation]);

  const openOrders = useCallback((bucket?: OrderBucket | null) => {
    navigation.navigate("OrdersTab", bucket ? { screen: "OrdersToday", params: { initialBucket: bucket } } : { screen: "OrdersToday" });
  }, [navigation]);

  const openNotifications = useCallback(() => {
    navigation.navigate("AccountTab", { screen: "Notifications" });
  }, [navigation]);

  const loadDashboard = useCallback(async (forceRefresh = false, mode: LoadMode = "initial") => {
    if (!outletId) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    mode === "refresh" ? setRefreshing(true) : setLoading(true);
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
      mode === "refresh" ? setRefreshing(false) : setLoading(false);
    }
  }, [outletId, outletTimezone]);

  const loadNotificationSummary = useCallback(async () => {
    if (!session) {
      setNotificationUnreadCount(0);
      return;
    }

    try {
      const payload = await listNotifications({ limit: 1 });
      setNotificationUnreadCount(payload.unread_count);
    } catch {
      setNotificationUnreadCount((current) => current);
    }
  }, [session]);

  useEffect(() => {
    firstFocusHandledRef.current = false;
    void loadDashboard(true, "initial");
    void loadNotificationSummary();
  }, [loadDashboard, loadNotificationSummary, outletId]);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationSummary();
      if (!outletId) return;
      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }
      void loadDashboard(true, orders.length > 0 ? "refresh" : "initial");
    }, [loadDashboard, loadNotificationSummary, orders.length, outletId])
  );

  const bucketCounts = useMemo(() => countOrdersByBucket(orders), [orders]);
  const readyCount = bucketCounts.siap_ambil + bucketCounts.siap_antar;
  const activeOrderCount = Math.max(orders.length - bucketCounts.selesai, 0);
  const dueCount = orders.filter((order) => order.due_amount > 0).length;
  const pickupPendingCount = orders.filter((order) => isPickupPending(order)).length;
  const attentionCount = dueCount + readyCount + pickupPendingCount;
  const outletName = selectedOutlet?.name?.trim() || "Outlet belum dipilih";
  const headerTitleMetrics = useMemo(() => getHeaderTitleMetrics(outletName, isTablet), [isTablet, outletName]);
  const heroSubtitle = `${formatDayLabel(outletTimezone)}. Gunakan dua tombol di bawah untuk masuk ke pekerjaan utama tanpa distraksi.`;

  const quickActions = useMemo<QuickActionItem[]>(() => {
    const items: QuickActionItem[] = [
      {
        key: "orders",
        title: "Lihat pesanan",
        subtitle: `${formatCount(activeOrderCount)} order aktif hari ini`,
        icon: "receipt-outline",
        tone: "info",
        onPress: () => openOrders(null),
      },
    ];

    if (canOpenCreateOrder) {
      items.push({
        key: "create",
        title: "Tambah pesanan",
        subtitle: canCreateOrder ? "Buat transaksi baru" : "Kuota order sedang penuh",
        icon: "add-circle-outline",
        tone: canCreateOrder ? "info" : "danger",
        onPress: openCreateOrder,
        disabled: !canCreateOrder,
      });
    } else {
      items.push({
        key: "notif",
        title: "Buka notifikasi",
        subtitle: notificationUnreadCount > 0 ? `${formatCount(notificationUnreadCount)} belum dibaca` : "Tidak ada notifikasi baru",
        icon: "notifications-outline",
        tone: notificationUnreadCount > 0 ? "danger" : "info",
        onPress: openNotifications,
      });
    }

    return items;
  }, [activeOrderCount, canCreateOrder, canOpenCreateOrder, notificationUnreadCount, openCreateOrder, openNotifications, openOrders]);

  return (
    <AppScreen
      scroll
      style={styles.screen}
      backgroundColor={theme.colors.background}
      contentContainerStyle={{ paddingBottom: bottomTabBarHeight + theme.spacing.xxl }}
      refreshControl={<RefreshControl onRefresh={() => void loadDashboard(true, "refresh")} refreshing={refreshing} tintColor={theme.colors.info} />}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text numberOfLines={2} style={[styles.headerTitle, headerTitleMetrics]}>
              {outletName}
            </Text>
          </View>
          <Pressable onPress={openNotifications} style={({ pressed }) => [styles.bell, pressed ? styles.pressed : null]}>
            <Ionicons color={theme.colors.textPrimary} name="notifications-outline" size={20} />
            {notificationUnreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notificationUnreadCount > 99 ? "99+" : String(notificationUnreadCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <AppPanel style={styles.hero}>
          <View style={styles.heroOrbA} />
          <View style={styles.heroOrbB} />
          <View style={styles.heroTop}>
            <View style={styles.heroTag}>
              <Ionicons color={theme.colors.primaryContrast} name="flash-outline" size={14} />
              <Text style={styles.heroTagText}>Ringkasan hari ini</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{`${getGreeting()}${attentionCount > 0 ? `, ada ${formatCount(attentionCount)} hal yang perlu dicek.` : ", operasional relatif tenang."}`}</Text>
          <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatCount(activeOrderCount)}</Text>
              <Text style={styles.heroStatLabel}>order aktif</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatCount(readyCount)}</Text>
              <Text style={styles.heroStatLabel}>siap diserahkan</Text>
            </View>
          </View>
        </AppPanel>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Data beranda belum berhasil dimuat</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {loading && orders.length === 0 ? (
          <AppPanel style={styles.loading}>
            <ActivityIndicator color={theme.colors.info} size="small" />
            <Text style={styles.loadingText}>Menyiapkan ringkasan beranda...</Text>
          </AppPanel>
        ) : null}

        <AppPanel style={styles.quickPanel}>
          <Text style={styles.sectionTitle}>Aksi cepat</Text>
          <Text style={styles.sectionHint}>Dua akses utama untuk operasional harian.</Text>
          <View style={styles.quickList}>
            {quickActions.map((item) => {
              const tone = toneStyle(theme, item.tone);
              return (
                <Pressable
                  key={item.key}
                  disabled={item.disabled}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.quickCard,
                    {
                      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#d8e4ec",
                      backgroundColor: item.disabled ? theme.colors.surfaceSoft : theme.colors.surface,
                    },
                    pressed && !item.disabled ? styles.pressed : null,
                    item.disabled ? styles.disabled : null,
                  ]}
                >
                  <View style={styles.quickCardRow}>
                    <View
                      style={[
                        styles.quickIconBox,
                        {
                          backgroundColor: theme.mode === "dark" ? theme.colors.surfaceSoft : "#f8fbfd",
                          borderColor: tone.border,
                        },
                      ]}
                    >
                      <Ionicons color={tone.text} name={item.icon} size={19} />
                    </View>

                    <View style={styles.quickCopy}>
                      <Text style={styles.quickTitle}>{item.title}</Text>
                      <Text style={styles.quickSubtitle}>{item.subtitle}</Text>
                    </View>

                    <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </AppPanel>
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean) {
  const pad = isTablet ? theme.spacing.xxl : theme.spacing.lg;

  return StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: pad, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md },
    headerCopy: { flex: 1 },
    headerTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.heavy, flexShrink: 1 },
    bell: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, position: "relative" },
    badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 999, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.danger, borderWidth: 2, borderColor: theme.colors.surface },
    badgeText: { color: "#ffffff", fontFamily: theme.fonts.bold, fontSize: 9, lineHeight: 11 },
    hero: { position: "relative", overflow: "hidden", backgroundColor: theme.mode === "dark" ? "#0b2840" : "#daf2ff", borderColor: theme.mode === "dark" ? "#1d4b68" : "#b8dcf6" },
    heroOrbA: { position: "absolute", top: -70, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.18)" : "rgba(14,164,206,0.18)" },
    heroOrbB: { position: "absolute", bottom: -60, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.42)" },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    heroTag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: theme.radii.pill, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.mode === "dark" ? "#11314c" : "#1298be" },
    heroTagText: { color: theme.colors.primaryContrast, fontFamily: theme.fonts.bold, fontSize: 11, lineHeight: 14 },
    heroTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.heavy, fontSize: isTablet ? 27 : 23, lineHeight: isTablet ? 34 : 29 },
    heroSubtitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 18 },
    heroStats: { flexDirection: "row", gap: theme.spacing.sm },
    heroStat: { flex: 1, borderWidth: 1, borderColor: theme.mode === "dark" ? "#2d506d" : "#bfe1f4", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.mode === "dark" ? "rgba(7,22,38,0.34)" : "rgba(255,255,255,0.72)" },
    heroStatValue: { color: theme.colors.textPrimary, fontFamily: theme.fonts.heavy, fontSize: isTablet ? 28 : 24, lineHeight: isTablet ? 32 : 28 },
    heroStatLabel: { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold, fontSize: 11, lineHeight: 15 },
    errorBox: { borderWidth: 1, borderColor: theme.mode === "dark" ? "#79414f" : "#efc1ca", borderRadius: theme.radii.lg, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.mode === "dark" ? "#41222d" : "#fff2f5", gap: 4 },
    errorTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 13, lineHeight: 18 },
    errorText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 17 },
    loading: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    loadingText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 17 },
    sectionTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 14, lineHeight: 19 },
    sectionHint: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: 11, lineHeight: 16 },
    quickPanel: {
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    quickList: {
      gap: theme.spacing.sm,
    },
    quickCard: {
      width: "100%",
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 15,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.12 : 0.04,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 12,
      elevation: 2,
    },
    quickCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    quickIconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    quickCopy: {
      flex: 1,
      gap: 3,
    },
    quickTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 19,
    },
    quickSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    disabled: { opacity: 0.76 },
    pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  });
}
