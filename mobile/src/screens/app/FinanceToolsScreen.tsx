import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { getBillingQuota } from "../../features/billing/billingApi";
import { listOrders } from "../../features/orders/orderApi";
import { canManageFinance as canManageFinanceByRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { BillingQuotaPayload } from "../../types/billing";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "FinanceTools">;

interface FinanceActionItem {
  key: string;
  title: string;
  subtitle: string;
  locked?: boolean;
}

const ACTION_ITEMS: FinanceActionItem[] = [
  { key: "cashbox", title: "Atur Cashbox", subtitle: "Konfigurasi akun kas utama outlet." },
  { key: "category", title: "Atur Kategori", subtitle: "Kelompokkan transaksi pendapatan/pengeluaran." },
  { key: "income", title: "Tambah Pendapatan", subtitle: "Catat pemasukan non-order secara cepat." },
  { key: "expense", title: "Tambah Pengeluaran", subtitle: "Catat biaya operasional harian outlet." },
  { key: "transfer", title: "Pemindahan Saldo", subtitle: "Pindahkan saldo antar cashbox." },
  { key: "adjustment", title: "Koreksi Keuangan", subtitle: "Koreksi saldo saat audit harian." },
  { key: "payment-adjustment", title: "Koreksi Pembayaran", subtitle: "Perbaikan transaksi pembayaran.", locked: true },
];

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(0, Math.round(value)))}`;
}

export function FinanceToolsScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canManageFinance = canManageFinanceByRole(roles);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotaData, setQuotaData] = useState<BillingQuotaPayload | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadData(false);
  }, [selectedOutlet?.id, canManageFinance]);

  async function loadData(isRefresh: boolean): Promise<void> {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const [nextQuota, nextOrders] = await Promise.all([
        canManageFinance ? getBillingQuota() : Promise.resolve(null),
        selectedOutlet
          ? listOrders({
              outletId: selectedOutlet.id,
              limit: 80,
            })
          : Promise.resolve([]),
      ]);

      setQuotaData(nextQuota);
      setOrders(nextOrders);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  const orderSummary = useMemo(() => {
    const totalOrders = orders.length;
    const gross = orders.reduce((total, order) => total + order.total_amount, 0);
    const paid = orders.reduce((total, order) => total + order.paid_amount, 0);
    const due = orders.reduce((total, order) => total + Math.max(0, order.due_amount), 0);

    return {
      totalOrders,
      gross,
      paid,
      due,
    };
  }, [orders]);

  function handleActionPress(item: FinanceActionItem): void {
    if (item.locked) {
      setActionMessage(`${item.title} masih dikunci sesuai paket/role.`);
      return;
    }

    if (!canManageFinance) {
      setActionMessage("Aksi keuangan hanya untuk role owner/admin.");
      return;
    }

    setActionMessage(`${item.title} sudah siap di UI. Endpoint input detail keuangan mobile akan diaktifkan pada iterasi backend berikutnya.`);
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Kelola Keuangan</Text>
        <Text style={styles.subtitle}>
          {selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Pilih outlet aktif untuk ringkasan keuangan."}
        </Text>
      </View>

      {!canManageFinance ? (
        <View style={styles.warningWrap}>
          <StatusPill label="Read-only" tone="warning" />
          <Text style={styles.warningText}>Role saat ini tidak bisa melakukan aksi koreksi keuangan. Ringkasan tetap bisa dipantau.</Text>
        </View>
      ) : null}

      <AppPanel style={styles.panel}>
        <View style={styles.panelTop}>
          <Text style={styles.sectionTitle}>Kuota & Subscription</Text>
          <AppButton disabled={refreshing} onPress={() => void loadData(true)} title="Refresh" variant="secondary" />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat status billing...</Text>
          </View>
        ) : quotaData ? (
          <View style={styles.metricList}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Periode</Text>
              <Text style={styles.metricValue}>{quotaData.quota.period}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Paket</Text>
              <Text style={styles.metricValue}>{quotaData.subscription?.plan?.name ?? quotaData.quota.plan ?? "-"}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Order Terpakai</Text>
              <Text style={styles.metricValue}>{quotaData.quota.orders_used}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Sisa Kuota</Text>
              <Text style={styles.metricValue}>
                {quotaData.quota.orders_remaining === null ? "Tanpa Batas" : quotaData.quota.orders_remaining}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.infoText}>Endpoint billing/quota hanya tersedia untuk role owner/admin.</Text>
        )}
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Snapshot Kas Operasional</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat ringkasan order...</Text>
          </View>
        ) : (
          <View style={styles.financeGrid}>
            <View style={styles.financeCard}>
              <Text style={styles.financeValue}>{orderSummary.totalOrders}</Text>
              <Text style={styles.financeLabel}>Order</Text>
            </View>
            <View style={styles.financeCard}>
              <Text style={styles.financeValue}>{formatMoney(orderSummary.gross)}</Text>
              <Text style={styles.financeLabel}>Total Tagihan</Text>
            </View>
            <View style={styles.financeCard}>
              <Text style={styles.financeValue}>{formatMoney(orderSummary.paid)}</Text>
              <Text style={styles.financeLabel}>Pembayaran Masuk</Text>
            </View>
            <View style={styles.financeCard}>
              <Text style={[styles.financeValue, styles.dueValue]}>{formatMoney(orderSummary.due)}</Text>
              <Text style={styles.financeLabel}>Sisa Tagihan</Text>
            </View>
          </View>
        )}
        <Text style={styles.infoText}>Catatan: nilai diambil dari transaksi order outlet aktif, belum termasuk jurnal non-order.</Text>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Aksi Keuangan</Text>
        <View style={styles.actionList}>
          {ACTION_ITEMS.map((item) => (
            <Pressable key={item.key} onPress={() => handleActionPress(item)} style={styles.actionItem}>
              <View style={styles.actionTextWrap}>
                <View style={styles.actionTitleRow}>
                  <Text style={styles.actionTitle}>{item.title}</Text>
                  {item.locked ? <StatusPill label="Lock" tone="neutral" /> : null}
                </View>
                <Text style={styles.actionSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.actionArrow}>i</Text>
            </Pressable>
          ))}
        </View>
      </AppPanel>

      {actionMessage ? (
        <View style={styles.successWrap}>
          <Text style={styles.successText}>{actionMessage}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorWrap}>
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
      gap: theme.spacing.sm,
    },
    header: {
      gap: 2,
    },
    backButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 2,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    panelTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
      flex: 1,
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
    metricList: {
      gap: theme.spacing.xs,
    },
    metricRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    financeGrid: {
      gap: theme.spacing.xs,
    },
    financeCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 9,
      gap: 2,
    },
    financeValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    dueValue: {
      color: theme.colors.warning,
    },
    financeLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 17,
    },
    actionList: {
      gap: 2,
    },
    actionItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 10,
      gap: theme.spacing.sm,
    },
    actionTextWrap: {
      flex: 1,
      gap: 2,
    },
    actionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    actionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    actionSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    actionArrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    warningWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#684d1f" : "#f0d7a8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#3f3117" : "#fff8ea",
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 6,
    },
    warningText: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    successText: {
      color: theme.colors.success,
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
      paddingVertical: 9,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
