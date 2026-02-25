import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  getPaymentGatewaySettings,
  listPaymentGatewayQrisTransactions,
  upsertPaymentGatewaySettings,
} from "../../features/settings/paymentGatewayApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { PaymentGatewaySettings, PaymentGatewayTransaction, PaymentGatewayTransactionsSummary } from "../../types/paymentGateway";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "PaymentGateway">;
type TransactionTone = "neutral" | "warning" | "success" | "danger";

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveTransactionState(item: PaymentGatewayTransaction): { label: string; tone: TransactionTone } {
  if (item.isPaid) {
    return { label: "Terbayar", tone: "success" };
  }

  const processStatus = (item.latestEvent?.processStatus ?? "").toLowerCase();

  if (["rejected", "amount_mismatch", "unmatched_intent", "unmatched_order"].includes(processStatus)) {
    return { label: "Gagal", tone: "danger" };
  }

  if (processStatus === "received") {
    return { label: "Diproses", tone: "warning" };
  }

  if (processStatus === "ignored_non_success") {
    return { label: "Belum Bayar", tone: "warning" };
  }

  return { label: "Menunggu", tone: "neutral" };
}

export function PaymentGatewayScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingTx, setRefreshingTx] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [settings, setSettings] = useState<PaymentGatewaySettings | null>(null);
  const [summary, setSummary] = useState<PaymentGatewayTransactionsSummary>({ total: 0, paid: 0, pending: 0 });
  const [transactions, setTransactions] = useState<PaymentGatewayTransaction[]>([]);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [selectedOutlet?.id]);

  async function bootstrap(): Promise<void> {
    if (!selectedOutlet) {
      setSettings(null);
      setSummary({ total: 0, paid: 0, pending: 0 });
      setTransactions([]);
      setClientIdInput("");
      setClientSecretInput("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const [settingsData, transactionsData] = await Promise.all([
        getPaymentGatewaySettings(selectedOutlet.id),
        listPaymentGatewayQrisTransactions(selectedOutlet.id, 40),
      ]);

      const resolvedSettings = transactionsData.settings ?? settingsData;
      setSettings(resolvedSettings);
      setClientIdInput(resolvedSettings.clientId);
      setSummary(transactionsData.summary);
      setTransactions(transactionsData.transactions);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshTransactions(): Promise<void> {
    if (!selectedOutlet || refreshingTx) {
      return;
    }

    setRefreshingTx(true);
    setErrorMessage(null);

    try {
      const payload = await listPaymentGatewayQrisTransactions(selectedOutlet.id, 40);
      setSettings(payload.settings);
      setSummary(payload.summary);
      setTransactions(payload.transactions);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setRefreshingTx(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!selectedOutlet || saving) {
      return;
    }

    const normalizedClientId = clientIdInput.trim();
    const normalizedClientSecret = clientSecretInput.trim();
    const hasExistingSecret = settings?.hasClientSecret === true;

    if (!normalizedClientId) {
      setErrorMessage("Client ID wajib diisi.");
      setSuccessMessage(null);
      return;
    }

    if (!hasExistingSecret && !normalizedClientSecret) {
      setErrorMessage("Client Secret wajib diisi saat konfigurasi pertama.");
      setSuccessMessage(null);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const saved = await upsertPaymentGatewaySettings({
        outletId: selectedOutlet.id,
        clientId: normalizedClientId,
        clientSecret: normalizedClientSecret || undefined,
      });

      setSettings(saved);
      setClientIdInput(saved.clientId);
      setClientSecretInput("");
      setShowSecret(false);
      setSuccessMessage("Konfigurasi Payment Gateway berhasil disimpan.");
      await refreshTransactions();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="qr-code-outline" size={15} />
            <Text style={styles.heroBadgeText}>Payment Gateway</Text>
          </View>
          <Pressable onPress={() => void refreshTransactions()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            {refreshingTx ? <ActivityIndicator color={theme.colors.info} size="small" /> : <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />}
          </Pressable>
        </View>
        <Text style={styles.title}>Payment Gateway QRIS</Text>
        <Text style={styles.subtitle}>Atur API Client BRI QRIS per outlet dan pantau transaksi QRIS terbaru.</Text>
      </AppPanel>

      {!selectedOutlet ? (
        <View style={styles.warningWrap}>
          <Ionicons color={theme.colors.warning} name="alert-circle-outline" size={16} />
          <Text style={styles.warningText}>Pilih outlet aktif dulu sebelum mengatur Payment Gateway.</Text>
        </View>
      ) : null}

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Konfigurasi API BRI QRIS</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat konfigurasi payment gateway...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>API Client ID</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              onChangeText={setClientIdInput}
              placeholder="Masukkan client id BRI"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={clientIdInput}
            />

            <Text style={styles.label}>API Client Secret</Text>
            <View style={styles.secretInputWrap}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
                onChangeText={setClientSecretInput}
                placeholder={settings?.hasClientSecret ? "Kosongkan jika tidak ganti secret" : "Masukkan client secret BRI"}
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry={!showSecret}
                style={[styles.input, styles.secretInput]}
                value={clientSecretInput}
              />
              <Pressable disabled={saving} onPress={() => setShowSecret((value) => !value)} style={({ pressed }) => [styles.secretToggle, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name={showSecret ? "eye-off-outline" : "eye-outline"} size={17} />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              {settings?.hasClientSecret
                ? `Secret tersimpan: ${settings.clientSecretMask || "***"}`
                : "Belum ada client secret tersimpan."}
            </Text>
            <Text style={styles.helperText}>Terakhir diperbarui: {formatDateTime(settings?.updatedAt ?? null)}</Text>

            <AppButton
              disabled={saving || !selectedOutlet}
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={18} />}
              loading={saving}
              onPress={() => void handleSave()}
              title="Simpan Konfigurasi"
            />
          </>
        )}
      </AppPanel>

      <AppPanel style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.sectionTitle}>Data Transaksi QRIS</Text>
          <StatusPill label={`${summary.total} transaksi`} tone="info" />
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.paid}</Text>
            <Text style={styles.summaryLabel}>Terbayar</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.pending}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat transaksi QRIS...</Text>
          </View>
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada transaksi QRIS pada outlet ini.</Text>
        ) : (
          <ScrollView nestedScrollEnabled style={styles.transactionList} contentContainerStyle={styles.transactionListContent}>
            {transactions.map((item) => {
              const state = resolveTransactionState(item);

              return (
                <View key={item.intentId} style={styles.transactionItem}>
                  <View style={styles.transactionTopRow}>
                    <View style={styles.transactionMain}>
                      <Text style={styles.transactionTitle}>{item.orderCode ? `Order ${item.orderCode}` : "Order belum terhubung"}</Text>
                      <Text style={styles.transactionSubtitle}>
                        {item.customerName || "Pelanggan"} {item.customerPhone ? `• ${item.customerPhone}` : ""}
                      </Text>
                    </View>
                    <StatusPill label={state.label} tone={state.tone} />
                  </View>

                  <View style={styles.transactionMetaRow}>
                    <Text style={styles.transactionMetaLabel}>Nominal</Text>
                    <Text style={styles.transactionMetaValue}>{formatMoney(item.amountTotal)}</Text>
                  </View>
                  <View style={styles.transactionMetaRow}>
                    <Text style={styles.transactionMetaLabel}>Referensi</Text>
                    <Text numberOfLines={1} style={styles.transactionMetaValue}>
                      {item.intentReference}
                    </Text>
                  </View>
                  <View style={styles.transactionMetaRow}>
                    <Text style={styles.transactionMetaLabel}>Dibuat</Text>
                    <Text style={styles.transactionMetaValue}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                  <View style={styles.transactionMetaRow}>
                    <Text style={styles.transactionMetaLabel}>Kedaluwarsa</Text>
                    <Text style={styles.transactionMetaValue}>{formatDateTime(item.expiresAt)}</Text>
                  </View>
                  {item.latestEvent ? (
                    <Text style={styles.transactionHint}>
                      Event: {item.latestEvent.processStatus}
                      {item.latestEvent.rejectionReason ? ` (${item.latestEvent.rejectionReason})` : ""}
                    </Text>
                  ) : (
                    <Text style={styles.transactionHint}>Belum ada event webhook terbaru.</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </AppPanel>

      {successMessage ? (
        <View style={styles.successWrap}>
          <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
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
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    warningWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#684d1f" : "#f0d7a8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#3f3117" : "#fff8ea",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    warningText: {
      flex: 1,
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.xs,
    },
    panelHeader: {
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
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    secretInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    secretInput: {
      flex: 1,
    },
    secretToggle: {
      width: 36,
      height: 36,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    helperText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    summaryRow: {
      flexDirection: "row",
      gap: 8,
    },
    summaryCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 8,
      gap: 1,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    transactionList: {
      maxHeight: isTablet ? 460 : 400,
    },
    transactionListContent: {
      gap: 8,
      paddingVertical: 1,
    },
    transactionItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 9,
      gap: 5,
    },
    transactionTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    transactionMain: {
      flex: 1,
      gap: 1,
    },
    transactionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13.5,
    },
    transactionSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    transactionMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 9,
    },
    transactionMetaLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    transactionMetaValue: {
      flex: 1,
      textAlign: "right",
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    transactionHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
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
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#2a6b48" : "#bfe7cf",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173b2b" : "#e9f8ef",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    successText: {
      flex: 1,
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
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}

