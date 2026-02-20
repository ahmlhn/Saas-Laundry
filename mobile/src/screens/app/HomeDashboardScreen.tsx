import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { listOrders } from "../../features/orders/orderApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<AppStackParamList, "HomeDashboard">;

function sumDueOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.due_amount > 0).length;
}

function sumCompletedOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.laundry_status === "completed").length;
}

export function HomeDashboardScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet, session, logout, refreshSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOutlet) {
      navigation.replace("OutletSelect");
      return;
    }

    void loadDashboard();
  }, [selectedOutlet?.id]);

  async function loadDashboard(): Promise<void> {
    if (!selectedOutlet) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await refreshSession();
      const data = await listOrders({
        outletId: selectedOutlet.id,
        limit: 40,
      });
      setOrders(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const total = orders.length;
    const due = sumDueOrders(orders);
    const completed = sumCompletedOrders(orders);
    return { total, due, completed };
  }, [orders]);

  const quotaLabel =
    session?.quota.orders_remaining === null
      ? "Tanpa batas kuota order bulan ini."
      : `${session?.quota.orders_remaining ?? 0} sisa dari ${session?.quota.orders_limit ?? 0} kuota order bulan ini.`;

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.hero}>
        <Text style={styles.pageTitle}>Dashboard Operasional</Text>
        <Text style={styles.pageSubtitle}>{selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "-"}</Text>
      </View>

      <AppPanel style={styles.infoPanel}>
        <View style={styles.infoTop}>
          <Text style={styles.infoTitle}>{session?.user.name ?? "-"}</Text>
          <StatusPill label={`${session?.roles.length ?? 0} role`} tone="info" />
        </View>
        <Text style={styles.infoText}>Role aktif: {(session?.roles ?? []).join(", ") || "-"}</Text>
        <Text style={styles.infoText}>{quotaLabel}</Text>
      </AppPanel>

      <AppPanel style={styles.metricPanel}>
        <Text style={styles.sectionTitle}>Ringkasan Order Hari Ini</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat ringkasan...</Text>
          </View>
        ) : (
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.total}</Text>
              <Text style={styles.metricLabel}>Total Order</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.completed}</Text>
              <Text style={styles.metricLabel}>Selesai</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.due}</Text>
              <Text style={styles.metricLabel}>Belum Lunas</Text>
            </View>
          </View>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </AppPanel>

      <AppPanel style={styles.menuPanel}>
        <Text style={styles.sectionTitle}>Aksi Cepat</Text>
        <View style={styles.menuActions}>
          <AppButton onPress={() => navigation.navigate("OrdersToday")} title="Lihat Orders Hari Ini" />
          <AppButton onPress={() => navigation.replace("OutletSelect")} title="Ganti Outlet Aktif" variant="secondary" />
          <AppButton onPress={() => void loadDashboard()} title="Refresh Dashboard" variant="ghost" />
          <AppButton onPress={() => void logout()} title="Logout" variant="ghost" />
        </View>
      </AppPanel>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    hero: {
      gap: 2,
    },
    pageTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 29,
      lineHeight: 36,
    },
    pageSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    infoPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    infoTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    infoTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 18,
    },
    infoText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    metricPanel: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    metricGrid: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    metricItem: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingVertical: 9,
      paddingHorizontal: 10,
      alignItems: "center",
      gap: 1,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 21,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    menuPanel: {
      gap: theme.spacing.sm,
    },
    menuActions: {
      gap: theme.spacing.xs,
    },
  });
}
