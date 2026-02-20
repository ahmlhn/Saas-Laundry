import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { countOrdersByBucket, type OrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
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
}

const SHORTCUTS: ShortcutConfig[] = [
  { key: "validasi", label: "Validasi", subtitle: "Perlu konfirmasi" },
  { key: "antrian", label: "Antrian", subtitle: "Menunggu proses" },
  { key: "proses", label: "Proses", subtitle: "Sedang dikerjakan" },
  { key: "siap_ambil", label: "Siap Ambil", subtitle: "Siap pickup" },
  { key: "siap_antar", label: "Siap Antar", subtitle: "Siap delivery" },
  { key: null, label: "Semua", subtitle: "Seluruh pesanan" },
];

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet, session, logout, refreshSession, selectOutlet } = useSession();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const entranceProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);

  useEffect(() => {
    void loadDashboard();
  }, [selectedOutlet?.id]);

  async function loadDashboard(): Promise<void> {
    if (!selectedOutlet) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await refreshSession();
      const data = await listOrders({
        outletId: selectedOutlet.id,
        limit: 60,
      });
      setOrders(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const heroAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress,
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-14, 0],
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
        outputRange: [0, 0.32, 1],
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
  const pendingCount = useMemo(() => bucketCounts.validasi + bucketCounts.antrian + bucketCounts.proses, [bucketCounts]);
  const dueAmountTotal = useMemo(() => orders.reduce((total, order) => total + Math.max(order.due_amount, 0), 0), [orders]);
  const totalSales = useMemo(() => orders.reduce((total, order) => total + Math.max(order.total_amount, 0), 0), [orders]);
  const quotaLimit = session?.quota.orders_limit ?? null;
  const quotaRemaining = session?.quota.orders_remaining ?? null;
  const quotaSummary =
    quotaRemaining === null
      ? "Tanpa batas"
      : quotaLimit && quotaLimit > 0
        ? `${quotaRemaining}/${quotaLimit}`
        : `${quotaRemaining}`;
  const selectedOutletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const outletMeta = selectedOutlet ? `Timezone ${selectedOutlet.timezone}` : "Pilih outlet untuk mulai operasional";
  const planLabel = session?.plan.key ? session.plan.key.toUpperCase() : "FREE";

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
      <Animated.View style={[styles.heroShell, heroAnimatedStyle]}>
        <View style={styles.heroBase} />
        <View style={styles.heroLayer} />
        <View style={styles.heroRing} />
        <View style={styles.heroWaveMain} />
        <View style={styles.heroWaveAccent} />

        <View style={styles.heroContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>CL</Text>
            </View>
            <View style={styles.brandInfo}>
              <Text style={styles.brandTitle}>Cuci Laundry</Text>
              <Text style={styles.brandSubtitle}>Dashboard Operasional</Text>
            </View>
          </View>
          <Text style={styles.greeting}>Hai, {session?.user.name ?? "-"}</Text>
          <Text style={styles.outletLabel}>{selectedOutletLabel}</Text>
          <View style={styles.heroMetaRow}>
            <StatusPill label={`Plan ${planLabel}`} tone="info" />
            <StatusPill label={outletMeta} tone="neutral" />
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.summaryWrap, bodyAnimatedStyle]}>
        <AppPanel style={styles.summaryPanel}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.colors.info} />
              <Text style={styles.loadingText}>Memuat ringkasan outlet...</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{orders.length}</Text>
                  <Text style={styles.summaryLabel}>Total Order</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{pendingCount}</Text>
                  <Text style={styles.summaryLabel}>Perlu Aksi</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{dueCount}</Text>
                  <Text style={styles.summaryLabel}>Belum Lunas</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{quotaSummary}</Text>
                  <Text style={styles.summaryLabel}>Sisa Kuota</Text>
                </View>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.financeRow}>
                <View style={styles.financeItem}>
                  <Text style={styles.financeLabel}>Nilai Transaksi</Text>
                  <Text style={styles.financeValue}>{formatMoney(totalSales)}</Text>
                </View>
                <View style={styles.financeItem}>
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
          <Text style={styles.sectionTitle}>Akses Status Cepat</Text>
          <View style={styles.shortcutGrid}>
            {SHORTCUTS.map((item) => {
              const count = item.key ? bucketCounts[item.key] : orders.length;
              return (
                <Pressable
                  key={`${item.label}-${item.key ?? "all"}`}
                  onPress={() => handleOpenOrders(item.key)}
                  style={({ pressed }) => [styles.shortcutItem, pressed ? styles.shortcutPressed : null]}
                >
                  <View style={styles.shortcutCountWrap}>
                    <Text style={styles.shortcutCountText}>{count}</Text>
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
          <Text style={styles.sectionTitle}>Pintasan Analitik</Text>
          <Pressable
            onPress={() =>
              navigation.navigate("AccountTab", {
                screen: "Customers",
              })
            }
            style={({ pressed }) => [styles.quickLinkItem, pressed ? styles.quickLinkPressed : null]}
          >
            <Text style={styles.quickLinkTitle}>Top Pelanggan</Text>
            <Text style={styles.quickLinkSubtitle}>Lihat daftar pelanggan dan aktivitas transaksi terbaru.</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              navigation.navigate("AccountTab", {
                screen: "Services",
              })
            }
            style={({ pressed }) => [styles.quickLinkItem, pressed ? styles.quickLinkPressed : null]}
          >
            <Text style={styles.quickLinkTitle}>Top Layanan</Text>
            <Text style={styles.quickLinkSubtitle}>Pantau layanan paling sering dipesan dari modul layanan.</Text>
          </Pressable>
        </AppPanel>
      </Animated.View>

      <Animated.View style={[styles.actions, bodyAnimatedStyle]}>
        <AppButton onPress={() => void loadDashboard()} title="Refresh Dashboard" variant="secondary" />
        <AppButton
          onPress={() => {
            selectOutlet(null);
          }}
          title="Ganti Outlet"
          variant="ghost"
        />
        <AppButton onPress={() => void logout()} title="Logout" variant="ghost" />
      </Animated.View>

      {errorMessage ? (
        <Animated.View style={[styles.errorWrap, bodyAnimatedStyle]}>
          <StatusPill label="Error API" tone="danger" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </Animated.View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    heroShell: {
      position: "relative",
      height: 222,
      borderRadius: 28,
      overflow: "hidden",
    },
    heroBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1f86e4",
    },
    heroLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "70%",
      backgroundColor: "#0b67cc",
      opacity: 0.57,
    },
    heroRing: {
      position: "absolute",
      top: -88,
      right: -70,
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: 34,
      borderColor: "rgba(255,255,255,0.09)",
    },
    heroWaveMain: {
      position: "absolute",
      left: -56,
      right: -50,
      bottom: -120,
      height: 198,
      borderRadius: 150,
      backgroundColor: "#ffffff",
    },
    heroWaveAccent: {
      position: "absolute",
      right: -44,
      bottom: -76,
      width: 168,
      height: 96,
      borderRadius: 70,
      backgroundColor: "rgba(61, 226, 236, 0.58)",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: 2,
    },
    brandBadge: {
      width: 48,
      height: 48,
      borderRadius: 25,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.95)",
      backgroundColor: "rgba(9, 81, 167, 0.42)",
      alignItems: "center",
      justifyContent: "center",
    },
    brandBadgeText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 17,
      letterSpacing: 0.5,
    },
    brandInfo: {
      gap: 1,
    },
    brandTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 26,
      lineHeight: 30,
    },
    brandSubtitle: {
      color: "rgba(255,255,255,0.84)",
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    greeting: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 19,
      lineHeight: 24,
      marginTop: 4,
    },
    outletLabel: {
      color: "rgba(255,255,255,0.9)",
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: 2,
    },
    summaryWrap: {
      marginTop: -44,
      paddingHorizontal: 2,
    },
    summaryPanel: {
      borderRadius: 22,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      gap: theme.spacing.sm,
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.2,
      shadowRadius: 14,
      elevation: 6,
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 5,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    summaryCard: {
      width: "48.4%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: 1,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 18,
      lineHeight: 22,
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    financeRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    financeItem: {
      flex: 1,
      gap: 2,
    },
    financeLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    financeValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    financeDanger: {
      color: theme.colors.danger,
    },
    financeSafe: {
      color: theme.colors.success,
    },
    sectionPanel: {
      gap: theme.spacing.sm,
      borderRadius: theme.radii.lg,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    shortcutGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      justifyContent: "space-between",
    },
    shortcutItem: {
      width: "48.3%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 4,
    },
    shortcutPressed: {
      opacity: 0.82,
    },
    shortcutCountWrap: {
      alignSelf: "flex-start",
      minWidth: 38,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    shortcutCountText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 14,
      lineHeight: 16,
    },
    shortcutLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 17,
    },
    shortcutSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    quickLinkItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 2,
    },
    quickLinkPressed: {
      opacity: 0.84,
    },
    quickLinkTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    quickLinkSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    actions: {
      gap: theme.spacing.xs,
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
