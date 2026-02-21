import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { createBillingEntry, getBillingQuota, listBillingEntries } from "../../features/billing/billingApi";
import { listOrders } from "../../features/orders/orderApi";
import { canManageFinance as canManageFinanceByRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { BillingEntriesPayload, BillingEntry, BillingEntryType, BillingQuotaPayload } from "../../types/billing";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "FinanceTools">;

const ENTRY_TYPE_OPTIONS: Array<{ type: BillingEntryType; title: string; subtitle: string }> = [
  { type: "income", title: "Pendapatan", subtitle: "Pemasukan non-order" },
  { type: "expense", title: "Pengeluaran", subtitle: "Biaya operasional" },
  { type: "adjustment", title: "Koreksi", subtitle: "Penyesuaian plus/minus" },
];

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(0, Math.round(value)))}`;
}

function formatSignedMoney(value: number): string {
  const amount = Math.abs(Math.round(value));
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}Rp ${currencyFormatter.format(amount)}`;
}

function normalizeAmountInput(raw: string, allowNegative: boolean): string {
  if (!raw) {
    return "";
  }

  const cleaned = raw.replace(/[^\d-]/g, "");
  const digitsOnly = cleaned.replace(/-/g, "");
  if (digitsOnly.length === 0) {
    return "";
  }

  if (!allowNegative) {
    return digitsOnly;
  }

  return cleaned.startsWith("-") ? `-${digitsOnly}` : digitsOnly;
}

function signedAmountForEntry(entry: BillingEntry): number {
  if (entry.type === "income") {
    return Math.abs(entry.amount);
  }

  if (entry.type === "expense") {
    return -Math.abs(entry.amount);
  }

  return entry.amount;
}

function entryTypeLabel(type: BillingEntryType): string {
  if (type === "income") {
    return "Pendapatan";
  }

  if (type === "expense") {
    return "Pengeluaran";
  }

  return "Koreksi";
}

function entryTypeTone(type: BillingEntryType): "success" | "danger" | "warning" {
  if (type === "income") {
    return "success";
  }

  if (type === "expense") {
    return "danger";
  }

  return "warning";
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
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [quotaData, setQuotaData] = useState<BillingQuotaPayload | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [entriesData, setEntriesData] = useState<BillingEntriesPayload | null>(null);
  const [entryType, setEntryType] = useState<BillingEntryType>("income");
  const [amountInput, setAmountInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
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
      const [nextQuota, nextOrders, nextEntries] = await Promise.all([
        canManageFinance ? getBillingQuota() : Promise.resolve(null),
        selectedOutlet
          ? listOrders({
              outletId: selectedOutlet.id,
              limit: 80,
            })
          : Promise.resolve([]),
        canManageFinance && selectedOutlet
          ? listBillingEntries({
              outletId: selectedOutlet.id,
              limit: 25,
            })
          : Promise.resolve(null),
      ]);

      setQuotaData(nextQuota);
      setOrders(nextOrders);
      setEntriesData(nextEntries);
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

  const financeSummary = entriesData?.summary ?? {
    total_income: 0,
    total_expense: 0,
    total_adjustment: 0,
    net_amount: 0,
    entries_count: 0,
  };

  function handleTypeChange(nextType: BillingEntryType): void {
    setEntryType(nextType);
    setAmountInput((prev) => normalizeAmountInput(prev, nextType === "adjustment"));
    setErrorMessage(null);
    setActionMessage(null);
  }

  function parseAmount(): number | null {
    if (!amountInput.trim()) {
      return null;
    }

    const parsed = Number.parseInt(amountInput, 10);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  }

  async function handleCreateEntry(): Promise<void> {
    if (!canManageFinance) {
      setActionMessage("Aksi keuangan hanya untuk role owner/admin.");
      return;
    }

    if (!selectedOutlet) {
      setErrorMessage("Pilih outlet aktif terlebih dahulu.");
      return;
    }

    if (submittingEntry) {
      return;
    }

    const parsedAmount = parseAmount();
    if (parsedAmount === null) {
      setErrorMessage("Nominal wajib diisi dengan angka yang valid.");
      return;
    }

    if ((entryType === "income" || entryType === "expense") && parsedAmount <= 0) {
      setErrorMessage("Nominal pendapatan/pengeluaran harus lebih dari 0.");
      return;
    }

    if (entryType === "adjustment" && parsedAmount === 0) {
      setErrorMessage("Nominal koreksi tidak boleh 0.");
      return;
    }

    const trimmedCategory = categoryInput.trim();
    if (!trimmedCategory) {
      setErrorMessage("Kategori wajib diisi.");
      return;
    }

    setSubmittingEntry(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      await createBillingEntry({
        outletId: selectedOutlet.id,
        type: entryType,
        amount: parsedAmount,
        category: trimmedCategory,
        notes: notesInput.trim() || undefined,
      });

      setAmountInput("");
      setCategoryInput("");
      setNotesInput("");
      await loadData(true);
      setActionMessage(`${entryTypeLabel(entryType)} berhasil dicatat ke jurnal keuangan outlet.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmittingEntry(false);
    }
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
        <Text style={styles.sectionTitle}>Snapshot Kas Operasional (Order)</Text>
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
        <Text style={styles.infoText}>Ringkasan diambil dari transaksi order outlet aktif.</Text>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Jurnal Keuangan Non-Order</Text>
        <View style={styles.financeGrid}>
          <View style={styles.financeCard}>
            <Text style={styles.financeValue}>{formatMoney(financeSummary.total_income)}</Text>
            <Text style={styles.financeLabel}>Pendapatan</Text>
          </View>
          <View style={styles.financeCard}>
            <Text style={[styles.financeValue, styles.dueValue]}>{formatMoney(financeSummary.total_expense)}</Text>
            <Text style={styles.financeLabel}>Pengeluaran</Text>
          </View>
          <View style={styles.financeCard}>
            <Text style={styles.financeValue}>{formatSignedMoney(financeSummary.total_adjustment)}</Text>
            <Text style={styles.financeLabel}>Koreksi</Text>
          </View>
          <View style={styles.financeCard}>
            <Text style={[styles.financeValue, financeSummary.net_amount < 0 ? styles.dueValue : styles.netPositive]}>
              {formatSignedMoney(financeSummary.net_amount)}
            </Text>
            <Text style={styles.financeLabel}>Net Jurnal</Text>
          </View>
        </View>
        <Text style={styles.infoText}>Total entry: {financeSummary.entries_count} catatan.</Text>

        {canManageFinance ? (
          <View style={styles.entryForm}>
            <Text style={styles.formTitle}>Tambah Catatan Keuangan</Text>
            <View style={styles.typeRow}>
              {ENTRY_TYPE_OPTIONS.map((option) => (
                <Pressable
                  key={option.type}
                  onPress={() => handleTypeChange(option.type)}
                  style={[styles.typeCard, entryType === option.type ? styles.typeCardActive : null]}
                >
                  <Text style={[styles.typeTitle, entryType === option.type ? styles.typeTitleActive : null]}>{option.title}</Text>
                  <Text style={[styles.typeSubtitle, entryType === option.type ? styles.typeSubtitleActive : null]}>{option.subtitle}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Nominal</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(value) => setAmountInput(normalizeAmountInput(value, entryType === "adjustment"))}
              placeholder={entryType === "adjustment" ? "Contoh: -5000 atau 5000" : "Contoh: 150000"}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={amountInput}
            />

            <Text style={styles.inputLabel}>Kategori</Text>
            <TextInput
              maxLength={80}
              onChangeText={setCategoryInput}
              placeholder="Contoh: Operasional, Pendapatan Laundry"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={categoryInput}
            />

            <Text style={styles.inputLabel}>Catatan</Text>
            <TextInput
              maxLength={500}
              multiline
              onChangeText={setNotesInput}
              placeholder="Opsional"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.notesInput]}
              textAlignVertical="top"
              value={notesInput}
            />

            <AppButton
              disabled={submittingEntry || refreshing}
              loading={submittingEntry}
              onPress={() => void handleCreateEntry()}
              title={`Simpan ${entryTypeLabel(entryType)}`}
            />
          </View>
        ) : (
          <Text style={styles.infoText}>Role saat ini hanya bisa melihat ringkasan jurnal non-order.</Text>
        )}
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Riwayat Jurnal Terbaru</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat riwayat jurnal...</Text>
          </View>
        ) : entriesData && entriesData.data.length > 0 ? (
          <View style={styles.entryList}>
            {entriesData.data.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                <View style={styles.entryLeft}>
                  <View style={styles.entryTypeRow}>
                    <StatusPill label={entryTypeLabel(entry.type)} tone={entryTypeTone(entry.type)} />
                    <Text style={styles.entryDate}>{entry.entry_date}</Text>
                  </View>
                  <Text style={styles.entryCategory}>{entry.category}</Text>
                  {entry.notes ? <Text style={styles.entryNotes}>{entry.notes}</Text> : null}
                </View>
                <Text style={[styles.entryAmount, signedAmountForEntry(entry) < 0 ? styles.dueValue : styles.netPositive]}>
                  {formatSignedMoney(signedAmountForEntry(entry))}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.infoText}>Belum ada jurnal non-order untuk outlet aktif.</Text>
        )}
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
    netPositive: {
      color: theme.colors.success,
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
    entryForm: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      marginTop: 4,
      paddingTop: 10,
      gap: theme.spacing.xs,
    },
    formTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    typeRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    typeCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 1,
    },
    typeCardActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    typeTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    typeTitleActive: {
      color: theme.colors.info,
    },
    typeSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
    },
    typeSubtitleActive: {
      color: theme.colors.info,
    },
    inputLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    notesInput: {
      minHeight: 68,
    },
    entryList: {
      gap: theme.spacing.xs,
    },
    entryRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 8,
      gap: theme.spacing.sm,
    },
    entryLeft: {
      flex: 1,
      gap: 2,
    },
    entryTypeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      flexWrap: "wrap",
    },
    entryDate: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    entryCategory: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    entryNotes: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    entryAmount: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      marginTop: 1,
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
