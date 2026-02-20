import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { listOrders } from "../../features/orders/orderApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

function countPaidOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.due_amount <= 0).length;
}

function countUnpaidOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.due_amount > 0).length;
}

export function ReportsScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { selectedOutlet } = useSession();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, [selectedOutlet?.id]);

  async function loadData(): Promise<void> {
    if (!selectedOutlet) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await listOrders({
        outletId: selectedOutlet.id,
        limit: 80,
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
    const paid = countPaidOrders(orders);
    const unpaid = countUnpaidOrders(orders);
    return { total, paid, unpaid };
  }, [orders]);

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Laporan Ringkas</Text>
        <Text style={styles.subtitle}>{selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Pilih outlet untuk lihat laporan"}</Text>
      </View>

      <AppPanel style={styles.summaryPanel}>
        <Text style={styles.sectionTitle}>Snapshot Hari Ini</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat data laporan...</Text>
          </View>
        ) : (
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.total}</Text>
              <Text style={styles.metricLabel}>Total Order</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.paid}</Text>
              <Text style={styles.metricLabel}>Lunas</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.unpaid}</Text>
              <Text style={styles.metricLabel}>Belum Lunas</Text>
            </View>
          </View>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </AppPanel>

      <AppPanel style={styles.notePanel}>
        <Text style={styles.sectionTitle}>Catatan Fase 1</Text>
        <Text style={styles.noteText}>Modul laporan detail (harian, outlet, kas, grafik) akan ditingkatkan di fase berikutnya.</Text>
        <AppButton onPress={() => void loadData()} title="Refresh Data" variant="secondary" />
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
    header: {
      gap: 3,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 28,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    summaryPanel: {
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
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
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 10,
      alignItems: "center",
      gap: 2,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 20,
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
    notePanel: {
      gap: theme.spacing.sm,
    },
    noteText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
