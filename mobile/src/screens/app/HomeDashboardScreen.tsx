import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { countOrdersByBucket, ORDER_BUCKETS } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = BottomTabNavigationProp<AppTabParamList, "HomeTab">;

interface ShortcutConfig {
  key: (typeof ORDER_BUCKETS)[number]["key"];
  label: string;
}

const SHORTCUTS: ShortcutConfig[] = [
  { key: "validasi", label: "Konfirmasi" },
  { key: "antrian", label: "Penjemputan" },
  { key: "proses", label: "Antrian" },
  { key: "proses", label: "Proses" },
  { key: "siap_ambil", label: "Siap Ambil" },
  { key: "siap_antar", label: "Siap Antar" },
];

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet, session, logout, refreshSession, selectOutlet } = useSession();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const bucketCounts = useMemo(() => countOrdersByBucket(orders), [orders]);
  const dueCount = useMemo(() => orders.filter((order) => order.due_amount > 0).length, [orders]);
  const pendingCount = useMemo(() => bucketCounts.validasi + bucketCounts.antrian + bucketCounts.proses, [bucketCounts]);

  const summary = useMemo(
    () => ({
      total: orders.length,
      pending: pendingCount,
      overdue: dueCount,
    }),
    [orders.length, pendingCount, dueCount]
  );

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Text style={styles.brand}>bilas</Text>
        <Text style={styles.greeting}>Hai, {session?.user.name ?? "-"}</Text>
        <Text style={styles.welcome}>Selamat datang kembali</Text>
      </View>

      <AppPanel style={styles.statsPanel}>
        <View style={styles.statsTopTabs}>
          <Text style={styles.statsTab}>KEUANGAN</Text>
          <Text style={[styles.statsTab, styles.statsTabActive]}>TRANSAKSI</Text>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryContrast} />
            <Text style={styles.loadingText}>Memuat ringkasan...</Text>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.total}</Text>
              <Text style={styles.statLabel}>Masuk</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.pending}</Text>
              <Text style={styles.statLabel}>Harus Selesai</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.overdue}</Text>
              <Text style={styles.statLabel}>Terlambat</Text>
            </View>
          </View>
        )}
      </AppPanel>

      <View style={styles.shortcutGrid}>
        {SHORTCUTS.map((item, index) => (
          <Pressable
            key={`${item.key}-${index}`}
            onPress={() =>
              navigation.navigate("OrdersTab", {
                screen: "OrdersToday",
                params: { initialBucket: item.key },
              })
            }
            style={({ pressed }) => [styles.shortcutItem, pressed ? styles.shortcutPressed : null]}
          >
            <View style={styles.shortcutIconWrap}>
              <Text style={styles.shortcutIconText}>{bucketCounts[item.key]}</Text>
            </View>
            <Text style={styles.shortcutLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <AppPanel style={styles.pintasanPanel}>
        <Text style={styles.sectionTitle}>Pintasan</Text>
        <Pressable style={styles.pintasanItem}>
          <Text style={styles.pintasanTitle}>Top Pelanggan</Text>
          <Text style={styles.pintasanSubtitle}>Pelanggan dengan transaksi terbanyak</Text>
        </Pressable>
        <Pressable style={styles.pintasanItem}>
          <Text style={styles.pintasanTitle}>Top Layanan</Text>
          <Text style={styles.pintasanSubtitle}>Layanan paling sering dipesan</Text>
        </Pressable>
      </AppPanel>

      <View style={styles.actions}>
        <AppButton onPress={() => void loadDashboard()} title="Refresh" variant="secondary" />
        <AppButton
          onPress={() => {
            selectOutlet(null);
          }}
          title="Ganti Outlet"
          variant="ghost"
        />
        <AppButton onPress={() => void logout()} title="Logout" variant="ghost" />
      </View>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <StatusPill label="Error API" tone="danger" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
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
    header: {
      gap: 2,
    },
    brand: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 24,
      letterSpacing: 0.4,
      textTransform: "lowercase",
    },
    greeting: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 20,
      lineHeight: 25,
    },
    welcome: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    statsPanel: {
      backgroundColor: "#1f71df",
      borderColor: "#1f71df",
      gap: theme.spacing.sm,
    },
    statsTopTabs: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.35)",
      paddingBottom: 7,
    },
    statsTab: {
      color: "rgba(255,255,255,0.76)",
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.3,
    },
    statsTabActive: {
      color: "#ffffff",
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 4,
    },
    loadingText: {
      color: "#eaf5ff",
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    statsGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
      gap: 2,
    },
    statValue: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 21,
    },
    statLabel: {
      color: "rgba(255,255,255,0.9)",
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "center",
    },
    shortcutGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      justifyContent: "space-between",
    },
    shortcutItem: {
      width: "30.5%",
      alignItems: "center",
      gap: 7,
    },
    shortcutPressed: {
      opacity: 0.82,
    },
    shortcutIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 999,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    shortcutIconText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 16,
    },
    shortcutLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      textAlign: "center",
      lineHeight: 16,
    },
    pintasanPanel: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
    },
    pintasanItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 2,
    },
    pintasanTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    pintasanSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
