import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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

const currencyFormatter = new Intl.NumberFormat("id-ID");
const compactFormatter = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(value, 0))}`;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return compactFormatter.format(Math.max(value, 0));
}

function getUpdatedLabel(date: Date | null): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ReportsScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const { selectedOutlet } = useSession();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    void loadData(true);
  }, [selectedOutlet?.id]);

  async function loadData(forceRefresh = false): Promise<void> {
    if (!selectedOutlet) {
      setOrders([]);
      setLoading(false);
      setLastUpdatedAt(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await listOrders({
        outletId: selectedOutlet.id,
        limit: 80,
        forceRefresh,
      });
      setOrders(data);
      setLastUpdatedAt(new Date());
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const paidOrders = countPaidOrders(orders);
    const unpaidOrders = countUnpaidOrders(orders);
    const totalSales = orders.reduce((total, order) => total + Math.max(order.total_amount, 0), 0);
    const dueAmount = orders.reduce((total, order) => total + Math.max(order.due_amount, 0), 0);
    const averageTicket = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    const paidRate = totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0;

    return {
      totalOrders,
      paidOrders,
      unpaidOrders,
      totalSales,
      dueAmount,
      averageTicket,
      paidRate,
      unpaidRate: Math.max(100 - paidRate, 0),
    };
  }, [orders]);

  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Pilih outlet untuk lihat laporan";
  const updatedLabel = getUpdatedLabel(lastUpdatedAt);

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="analytics-outline" size={16} />
            <Text style={styles.heroBadgeText}>Laporan Ringkas</Text>
          </View>
          <Text style={styles.heroMeta}>Update {updatedLabel}</Text>
        </View>
        <Text style={styles.title}>Ringkasan Kinerja Outlet</Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {outletLabel}
        </Text>
      </AppPanel>

      <AppPanel style={styles.summaryPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Snapshot Operasional</Text>
          <Text style={styles.sectionMeta}>80 order terakhir</Text>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat data laporan...</Text>
          </View>
        ) : (
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Ionicons color={theme.colors.info} name="receipt-outline" size={16} />
              <Text style={styles.metricValue}>{formatCompact(summary.totalOrders)}</Text>
              <Text style={styles.metricLabel}>Total Order</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons color={theme.colors.success} name="checkmark-done-outline" size={16} />
              <Text style={styles.metricValue}>{formatCompact(summary.paidOrders)}</Text>
              <Text style={styles.metricLabel}>Lunas</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons color={theme.colors.warning} name="time-outline" size={16} />
              <Text style={styles.metricValue}>{formatCompact(summary.unpaidOrders)}</Text>
              <Text style={styles.metricLabel}>Belum Lunas</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons color={theme.colors.info} name="wallet-outline" size={16} />
              <Text style={styles.metricValue}>{formatCompact(summary.averageTicket)}</Text>
              <Text style={styles.metricLabel}>Avg Ticket</Text>
            </View>
          </View>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </AppPanel>

      {!loading ? (
        <AppPanel style={styles.paymentPanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Komposisi Pembayaran</Text>
            <Text style={styles.sectionMeta}>{summary.paidRate}% lunas</Text>
          </View>
          <View style={styles.progressRail}>
            <View style={[styles.progressPaid, { flex: Math.max(summary.paidRate, 1) }]} />
            <View style={[styles.progressUnpaid, { flex: Math.max(summary.unpaidRate, 1) }]} />
          </View>
          <View style={styles.paymentMetaRow}>
            <Text style={styles.paymentMetaLabel}>Penjualan</Text>
            <Text style={styles.paymentMetaValue}>{formatMoney(summary.totalSales)}</Text>
          </View>
          <View style={styles.paymentMetaRow}>
            <Text style={styles.paymentMetaLabel}>Piutang Aktif</Text>
            <Text style={styles.paymentMetaValue}>{formatMoney(summary.dueAmount)}</Text>
          </View>
        </AppPanel>
      ) : null}

      <AppPanel style={styles.notePanel}>
        <Text style={styles.sectionTitle}>Catatan Fase Lanjutan</Text>
        <Text style={styles.noteText}>Modul laporan detail (harian, outlet, kas, grafik) masih menjadi backlog modernisasi setelah visual dasar stabil.</Text>
        <AppButton
          leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={18} />}
          onPress={() => void loadData(true)}
          title="Refresh Data"
          variant="secondary"
        />
      </AppPanel>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
    },
    heroPanel: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
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
    heroMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 28 : 24,
      lineHeight: isTablet ? 34 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      lineHeight: isTablet ? 20 : 18,
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
    sectionMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    metricItem: {
      minWidth: isTablet ? 160 : 130,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "24%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 11,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 21 : 19,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "center",
    },
    paymentPanel: {
      gap: theme.spacing.xs,
    },
    progressRail: {
      height: 12,
      borderRadius: theme.radii.pill,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
      flexDirection: "row",
      alignItems: "stretch",
    },
    progressPaid: {
      backgroundColor: theme.colors.success,
    },
    progressUnpaid: {
      backgroundColor: theme.colors.warning,
    },
    paymentMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    paymentMetaLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    paymentMetaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
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
