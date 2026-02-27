import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { countOrdersByBucket, type OrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { formatDateLabel, formatTimeLabel, toDateToken } from "../../lib/dateTime";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = BottomTabNavigationProp<AppTabParamList, "HomeTab">;

interface ShortcutConfig {
  key: OrderBucket | null;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SHORTCUTS: ShortcutConfig[] = [
  { key: "antrian", label: "Antrian", subtitle: "Menunggu proses", icon: "time-outline" },
  { key: "proses", label: "Proses", subtitle: "Sedang dikerjakan", icon: "color-wand-outline" },
  { key: "siap_ambil", label: "Siap Ambil", subtitle: "Menunggu diambil", icon: "bag-check-outline" },
  { key: "siap_antar", label: "Siap Antar", subtitle: "Menunggu / proses antar", icon: "bicycle-outline" },
  { key: "selesai", label: "Selesai", subtitle: "Sudah diambil / diantar", icon: "checkmark-done-outline" },
  { key: null, label: "Semua", subtitle: "Seluruh pesanan", icon: "layers-outline" },
];

const currencyFormatter = new Intl.NumberFormat("id-ID");
const compactFormatter = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return compactFormatter.format(Math.max(value, 0));
}

function getGreetingLabel(): string {
  const hour = new Date().getHours();
  if (hour < 11) {
    return "Selamat Pagi";
  }
  if (hour < 15) {
    return "Selamat Siang";
  }
  if (hour < 19) {
    return "Selamat Sore";
  }

  return "Selamat Malam";
}

function getTodayLabel(timezone?: string): string {
  return formatDateLabel(new Date(), timezone);
}

function getUpdatedLabel(date: Date | null, timezone?: string): string {
  if (!date) {
    return "-";
  }

  return formatTimeLabel(date, timezone);
}

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape, isCompactLandscape), [theme, isTablet, isLandscape, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet, session } = useSession();
  const outletId = selectedOutlet?.id;
  const outletTimezone = selectedOutlet?.timezone;
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
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

  const loadDashboard = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (!outletId) {
        setOrders([]);
        setLoading(false);
        setLastUpdatedAt(null);
        return;
      }

      setLoading(true);
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
        setLastUpdatedAt(new Date());
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [outletId, outletTimezone]
  );

  useEffect(() => {
    firstFocusHandledRef.current = false;
    void loadDashboard(true);
  }, [outletId, loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      if (!outletId) {
        return;
      }

      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }

      void loadDashboard(true);
    }, [outletId, loadDashboard])
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
            outputRange: [20, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const bucketCounts = useMemo(() => countOrdersByBucket(orders), [orders]);
  const dueCount = useMemo(() => orders.filter((order) => order.due_amount > 0).length, [orders]);
  const pendingCount = useMemo(() => bucketCounts.antrian + bucketCounts.proses, [bucketCounts]);
  const dueAmountTotal = useMemo(() => orders.reduce((total, order) => total + Math.max(order.due_amount, 0), 0), [orders]);
  const totalSales = useMemo(() => orders.reduce((total, order) => total + Math.max(order.total_amount, 0), 0), [orders]);
  const quotaLimit = session?.quota.orders_limit ?? null;
  const quotaRemaining = session?.quota.orders_remaining ?? null;
  const quotaSummary =
    quotaRemaining === null
      ? "Tanpa Batas"
      : quotaLimit && quotaLimit > 0
        ? `${quotaRemaining}/${quotaLimit}`
        : `${quotaRemaining}`;
  const selectedOutletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const outletMeta = selectedOutlet ? `Timezone ${selectedOutlet.timezone}` : "Pilih outlet untuk mulai operasional";
  const planLabel = session?.plan.key ? session.plan.key.toUpperCase() : "FREE";
  const greeting = getGreetingLabel();
  const todayLabel = getTodayLabel(outletTimezone);
  const updatedLabel = getUpdatedLabel(lastUpdatedAt, outletTimezone);

  const metricCards = [
    { label: "Total Order", value: formatCompact(orders.length), icon: "receipt-outline" as const, tone: "info" as const },
    { label: "Perlu Aksi", value: formatCompact(pendingCount), icon: "flash-outline" as const, tone: "warning" as const },
    { label: "Belum Lunas", value: formatCompact(dueCount), icon: "wallet-outline" as const, tone: "danger" as const },
    { label: "Sisa Kuota", value: quotaSummary, icon: "layers-outline" as const, tone: "success" as const },
  ];

  function metricToneColor(tone: "info" | "warning" | "danger" | "success"): string {
    if (tone === "warning") {
      return theme.colors.warning;
    }
    if (tone === "danger") {
      return theme.colors.danger;
    }
    if (tone === "success") {
      return theme.colors.success;
    }

    return theme.colors.info;
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

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <Animated.View style={[styles.heroCard, heroAnimatedStyle]}>
        <View style={styles.heroLayerPrimary} />
        <View style={styles.heroLayerSecondary} />
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />

        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View style={styles.brandWrap}>
              <View style={styles.brandBadge}>
                <Ionicons color="#ffffff" name="water-outline" size={18} />
              </View>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>Cuci Laundry</Text>
                <Text style={styles.brandSubtitle}>OPERASIONAL HARI INI</Text>
              </View>
            </View>
            <View style={styles.dateChip}>
              <Ionicons color="#d5ecff" name="calendar-outline" size={12} />
              <Text style={styles.dateChipText}>{todayLabel}</Text>
            </View>
          </View>

          <Text style={styles.greeting}>{greeting}, {session?.user.name ?? "-"}</Text>
          <Text style={styles.outletLabel}>{selectedOutletLabel}</Text>
          <View style={styles.heroMetaRow}>
            <StatusPill label={`Plan ${planLabel}`} tone="info" />
            <StatusPill label={outletMeta} tone="neutral" />
            <StatusPill label={`Update ${updatedLabel}`} tone="neutral" />
          </View>
        </View>
      </Animated.View>

      {errorMessage ? (
        <Animated.View style={[styles.errorWrap, bodyAnimatedStyle]}>
          <StatusPill label="Error API" tone="danger" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </Animated.View>
      ) : null}

      <Animated.View style={bodyAnimatedStyle}>
        <AppPanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionEyebrow}>Ringkasan</Text>
            <Text style={styles.sectionTitle}>Kinerja Outlet</Text>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.colors.info} />
              <Text style={styles.loadingText}>Memuat ringkasan outlet...</Text>
            </View>
          ) : (
            <>
              <View style={styles.metricGrid}>
                {metricCards.map((item) => (
                  <View key={item.label} style={styles.metricCard}>
                    <View style={styles.metricTopRow}>
                      <View style={[styles.metricIconWrap, { backgroundColor: `${metricToneColor(item.tone)}19` }]}>
                        <Ionicons color={metricToneColor(item.tone)} name={item.icon} size={16} />
                      </View>
                      <Text style={[styles.metricValue, { color: metricToneColor(item.tone) }]}>{item.value}</Text>
                    </View>
                    <Text style={styles.metricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.financeStrip}>
                <View style={styles.financeBlock}>
                  <Text style={styles.financeLabel}>Nilai Transaksi</Text>
                  <Text style={styles.financeValue}>{formatMoney(totalSales)}</Text>
                </View>
                <View style={styles.financeDivider} />
                <View style={styles.financeBlock}>
                  <Text style={styles.financeLabel}>Piutang Berjalan</Text>
                  <Text style={[styles.financeValue, dueAmountTotal > 0 ? styles.financeDanger : styles.financeSafe]}>{formatMoney(dueAmountTotal)}</Text>
                </View>
              </View>
            </>
          )}
        </AppPanel>
      </Animated.View>

      <Animated.View style={bodyAnimatedStyle}>
        <AppPanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionEyebrow}>Status</Text>
            <Text style={styles.sectionTitle}>Akses Cepat</Text>
          </View>
          <View style={styles.shortcutGrid}>
            {SHORTCUTS.map((item) => {
              const count = item.key ? bucketCounts[item.key] : orders.length;
              return (
                <Pressable
                  key={`${item.label}-${item.key ?? "all"}`}
                  onPress={() => handleOpenOrders(item.key)}
                  style={({ pressed }) => [styles.shortcutItem, pressed ? styles.shortcutPressed : null]}
                >
                  <View style={styles.shortcutHeader}>
                    <Ionicons color={theme.colors.info} name={item.icon} size={18} />
                    <Text style={styles.shortcutCount}>{count}</Text>
                  </View>
                  <Text style={styles.shortcutLabel}>{item.label}</Text>
                  <Text style={styles.shortcutSubtitle}>{item.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>
        </AppPanel>
      </Animated.View>

      <Animated.View style={bodyAnimatedStyle}>
        <AppPanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionEyebrow}>Analitik</Text>
            <Text style={styles.sectionTitle}>Insight Cepat</Text>
          </View>
          <Pressable
            onPress={() =>
              navigation.navigate("AccountTab", {
                screen: "Customers",
              })
            }
            style={({ pressed }) => [styles.quickLinkItem, pressed ? styles.quickLinkPressed : null]}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons color={theme.colors.info} name="people-outline" size={18} />
            </View>
            <View style={styles.quickLinkTextWrap}>
              <Text style={styles.quickLinkTitle}>Pelanggan Aktif</Text>
              <Text style={styles.quickLinkSubtitle}>Monitor profil pelanggan dan status terbaru.</Text>
            </View>
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
          </Pressable>

          <Pressable
            onPress={() =>
              navigation.navigate("AccountTab", {
                screen: "Services",
              })
            }
            style={({ pressed }) => [styles.quickLinkItem, pressed ? styles.quickLinkPressed : null]}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons color={theme.colors.warning} name="pricetags-outline" size={18} />
            </View>
            <View style={styles.quickLinkTextWrap}>
              <Text style={styles.quickLinkTitle}>Layanan Favorit</Text>
              <Text style={styles.quickLinkSubtitle}>Cek layanan terlaris dan update harga lebih cepat.</Text>
            </View>
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
          </Pressable>
        </AppPanel>
      </Animated.View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isLandscape: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: isCompactLandscape ? theme.spacing.xl : theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
    },
    heroCard: {
      position: "relative",
      borderRadius: isTablet ? 30 : isCompactLandscape ? 22 : 26,
      overflow: "hidden",
      minHeight: isTablet ? 228 : isCompactLandscape ? 172 : isLandscape ? 196 : 214,
      borderWidth: 1,
      borderColor: "rgba(157,214,255,0.34)",
      backgroundColor: "#0f5ea8",
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0f5ea8",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "68%",
      backgroundColor: "#1f8fe8",
      opacity: 0.68,
    },
    heroGlowLarge: {
      position: "absolute",
      top: -88,
      right: -72,
      width: 230,
      height: 230,
      borderRadius: 140,
      borderWidth: 34,
      borderColor: "rgba(255,255,255,0.1)",
    },
    heroGlowSmall: {
      position: "absolute",
      left: -64,
      bottom: -110,
      width: 188,
      height: 188,
      borderRadius: 120,
      backgroundColor: "rgba(52, 214, 231, 0.28)",
    },
    heroContent: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingBottom: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: theme.spacing.xs,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    brandWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      flex: 1,
      minWidth: 0,
    },
    brandBadge: {
      width: isCompactLandscape ? 34 : 38,
      height: isCompactLandscape ? 34 : 38,
      borderRadius: isCompactLandscape ? 17 : 19,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.74)",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    brandTextWrap: {
      gap: 1,
      minWidth: 0,
    },
    brandTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 25 : isCompactLandscape ? 20 : 22,
      lineHeight: isTablet ? 30 : isCompactLandscape ? 24 : 26,
    },
    brandSubtitle: {
      color: "rgba(230,242,255,0.86)",
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    dateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      backgroundColor: "rgba(255,255,255,0.12)",
      paddingHorizontal: isCompactLandscape ? 8 : 9,
      paddingVertical: isCompactLandscape ? 4 : 5,
      borderRadius: 999,
    },
    dateChipText: {
      color: "#e4f2ff",
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 9 : 10,
    },
    greeting: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 26 : isCompactLandscape ? 20 : 22,
      lineHeight: isTablet ? 31 : isCompactLandscape ? 24 : 27,
      marginTop: 2,
    },
    outletLabel: {
      color: "rgba(240,247,255,0.93)",
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 12 : 13,
      lineHeight: isCompactLandscape ? 17 : 19,
    },
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: isCompactLandscape ? 4 : theme.spacing.xs,
      marginTop: 2,
    },
    sectionPanel: {
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    sectionHead: {
      gap: 2,
    },
    sectionEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isCompactLandscape ? 16 : 18,
      lineHeight: isCompactLandscape ? 21 : 23,
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 4,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    metricCard: {
      width: isTablet || isCompactLandscape ? "24%" : "48.3%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: isCompactLandscape ? 8 : 10,
      paddingVertical: isCompactLandscape ? 8 : 10,
      gap: 4,
    },
    metricTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    metricIconWrap: {
      width: isCompactLandscape ? 24 : 28,
      height: isCompactLandscape ? 24 : 28,
      borderRadius: isCompactLandscape ? 12 : 14,
      alignItems: "center",
      justifyContent: "center",
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 18 : isCompactLandscape ? 14 : 16,
      lineHeight: isTablet ? 23 : isCompactLandscape ? 18 : 20,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10 : 11,
      lineHeight: isCompactLandscape ? 14 : 15,
    },
    financeStrip: {
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      overflow: "hidden",
    },
    financeBlock: {
      flex: 1,
      paddingHorizontal: isCompactLandscape ? 9 : 11,
      paddingVertical: isCompactLandscape ? 8 : 9,
      gap: 1,
    },
    financeDivider: {
      width: 1,
      backgroundColor: theme.colors.border,
    },
    financeLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    financeValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isCompactLandscape ? 12 : 13,
      lineHeight: isCompactLandscape ? 17 : 18,
    },
    financeDanger: {
      color: theme.colors.danger,
    },
    financeSafe: {
      color: theme.colors.success,
    },
    shortcutGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    shortcutItem: {
      width: isTablet || isCompactLandscape ? "31.8%" : "48.3%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: isCompactLandscape ? 8 : 10,
      paddingVertical: isCompactLandscape ? 8 : 10,
      gap: 3,
    },
    shortcutPressed: {
      opacity: 0.84,
    },
    shortcutHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    shortcutCount: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: isCompactLandscape ? 13 : 14,
    },
    shortcutLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 12 : 13,
      lineHeight: isCompactLandscape ? 16 : 17,
    },
    shortcutSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 10 : 11,
      lineHeight: isCompactLandscape ? 14 : 15,
    },
    quickLinkItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: isCompactLandscape ? 10 : 11,
      paddingVertical: isCompactLandscape ? 8 : 10,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    quickLinkPressed: {
      opacity: 0.84,
    },
    quickLinkIcon: {
      width: isCompactLandscape ? 30 : 34,
      height: isCompactLandscape ? 30 : 34,
      borderRadius: isCompactLandscape ? 15 : 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    quickLinkTextWrap: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    quickLinkTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 13 : 14,
      lineHeight: isCompactLandscape ? 17 : 19,
    },
    quickLinkSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 10 : 11,
      lineHeight: isCompactLandscape ? 14 : 16,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#693447" : "#f0bec8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#492736" : "#fff3f6",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
