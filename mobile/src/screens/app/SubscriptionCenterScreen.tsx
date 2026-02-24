import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  cancelSubscriptionChangeRequest,
  createSubscriptionChangeRequest,
  createSubscriptionQrisIntent,
  getSubscriptionInvoicePaymentStatus,
  getSubscriptionCurrent,
  listSubscriptionInvoices,
  listSubscriptionPlans,
  uploadSubscriptionInvoiceProof,
} from "../../features/subscription/subscriptionApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { SubscriptionCurrentPayload, SubscriptionInvoice, SubscriptionPlanOption } from "../../types/subscription";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "SubscriptionCenter">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(0, Math.round(value)))}`;
}

export function SubscriptionCenterScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const isOwner = roles.includes("owner");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<string | null>(null);
  const [qrisInvoiceId, setQrisInvoiceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<SubscriptionCurrentPayload | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, [isOwner]);

  async function loadData(): Promise<void> {
    if (!isOwner) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [currentPayload, planList, invoiceList] = await Promise.all([getSubscriptionCurrent(), listSubscriptionPlans(), listSubscriptionInvoices(20)]);
      setCurrent(currentPayload);
      setPlans(planList);
      setInvoices(invoiceList);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateChangeRequest(targetPlanId: number): Promise<void> {
    if (!isOwner || submitting || current?.pending_change_request) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await createSubscriptionChangeRequest(targetPlanId);
      await loadData();
      setSuccessMessage("Request perubahan paket berhasil dikirim.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelChangeRequest(): Promise<void> {
    if (!isOwner || !current?.pending_change_request || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await cancelSubscriptionChangeRequest(current.pending_change_request.id);
      await loadData();
      setSuccessMessage("Request perubahan paket dibatalkan.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadProof(invoiceId: string): Promise<void> {
    if (!isOwner || uploadingInvoiceId) {
      return;
    }

    setUploadingInvoiceId(invoiceId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("Izin akses galeri diperlukan untuk upload bukti.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (typeof asset.fileSize === "number" && asset.fileSize > 5 * 1024 * 1024) {
        setErrorMessage("Ukuran file terlalu besar. Maksimal 5 MB.");
        return;
      }

      await uploadSubscriptionInvoiceProof({
        invoiceId,
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });

      await loadData();
      setSuccessMessage("Bukti bayar berhasil diunggah. Menunggu verifikasi platform.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUploadingInvoiceId(null);
    }
  }

  async function handleGenerateQris(invoiceId: string): Promise<void> {
    if (!isOwner || qrisInvoiceId) {
      return;
    }

    setQrisInvoiceId(invoiceId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await createSubscriptionQrisIntent(invoiceId);
      const status = await getSubscriptionInvoicePaymentStatus(invoiceId);
      await loadData();
      setSuccessMessage(`QRIS intent siap. Status gateway: ${status.invoice.gateway_status ?? "intent_created"}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setQrisInvoiceId(null);
    }
  }

  if (!isOwner) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.heroBadge}>
              <Ionicons color={theme.colors.info} name="receipt-outline" size={15} />
              <Text style={styles.heroBadgeText}>Subscription</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Langganan Tenant</Text>
          <Text style={styles.subtitle}>Akses fitur ini hanya untuk role owner.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="receipt-outline" size={15} />
            <Text style={styles.heroBadgeText}>Subscription</Text>
          </View>
          <Pressable onPress={() => void loadData()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Langganan Tenant</Text>
        <Text style={styles.subtitle}>Kontrol plan, siklus aktif, dan invoice langganan tenant.</Text>
      </AppPanel>

      {loading ? (
        <AppPanel style={styles.panel}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat data langganan...</Text>
          </View>
        </AppPanel>
      ) : current ? (
        <>
          <AppPanel style={styles.panel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Status Aktif</Text>
              <StatusPill label={current.tenant.subscription_state.toUpperCase()} tone={current.tenant.subscription_state === "active" ? "success" : "warning"} />
            </View>
            <Text style={styles.infoText}>Tenant: {current.tenant.name}</Text>
            <Text style={styles.infoText}>Write Mode: {current.tenant.write_access_mode.toUpperCase()}</Text>
            <Text style={styles.infoText}>
              Kuota: {current.quota.orders_used}/{current.quota.orders_limit ?? "∞"} (sisa {current.quota.orders_remaining ?? "∞"})
            </Text>
            <Text style={styles.infoText}>
              Cycle: {current.current_cycle?.cycle_start_at ? new Date(current.current_cycle.cycle_start_at).toLocaleString("id-ID") : "-"} -{" "}
              {current.current_cycle?.cycle_end_at ? new Date(current.current_cycle.cycle_end_at).toLocaleString("id-ID") : "-"}
            </Text>
          </AppPanel>

          <AppPanel style={styles.panel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Perubahan Paket</Text>
              <StatusPill label={current.pending_change_request ? "Pending" : "Siap"} tone={current.pending_change_request ? "warning" : "success"} />
            </View>
            {current.pending_change_request ? (
              <>
                <Text style={styles.infoText}>
                  Target: {current.pending_change_request.target_plan?.name ?? "-"} ({current.pending_change_request.target_plan?.key?.toUpperCase() ?? "-"})
                </Text>
                <Text style={styles.infoText}>
                  Berlaku: {current.pending_change_request.effective_at ? new Date(current.pending_change_request.effective_at).toLocaleString("id-ID") : "-"}
                </Text>
                <AppButton
                  disabled={submitting}
                  leftElement={<Ionicons color={theme.colors.textPrimary} name="close-circle-outline" size={17} />}
                  onPress={() => void handleCancelChangeRequest()}
                  title="Batalkan Request"
                  variant="ghost"
                />
              </>
            ) : (
              <View style={styles.menuList}>
                {plans
                  .filter((plan) => !plan.is_current)
                  .map((plan) => (
                    <View key={plan.id.toString()} style={styles.planRow}>
                      <View style={styles.planInfo}>
                        <Text style={styles.planName}>
                          {plan.name} ({plan.key.toUpperCase()})
                        </Text>
                        <Text style={styles.planMeta}>
                          {formatMoney(plan.monthly_price_amount)} / 30 hari | limit {plan.orders_limit ?? "∞"} order
                        </Text>
                      </View>
                      <AppButton
                        disabled={submitting}
                        leftElement={<Ionicons color={theme.colors.primaryContrast} name="swap-horizontal-outline" size={16} />}
                        onPress={() => void handleCreateChangeRequest(plan.id)}
                        title="Pilih"
                      />
                    </View>
                  ))}
              </View>
            )}
          </AppPanel>

          <AppPanel style={styles.panel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Invoice Langganan</Text>
              <StatusPill label={`${invoices.length} item`} tone="info" />
            </View>
            <View style={styles.menuList}>
              {invoices.length === 0 ? (
                <Text style={styles.infoText}>Belum ada invoice langganan.</Text>
              ) : (
                invoices.map((invoice) => (
                  <View key={invoice.id} style={styles.invoiceRow}>
                    <View style={styles.planInfo}>
                      <Text style={styles.planName}>{invoice.invoice_no}</Text>
                      <Text style={styles.planMeta}>
                        {invoice.status.toUpperCase()} | {formatMoney(invoice.amount_total)} | due{" "}
                        {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString("id-ID") : "-"}
                      </Text>
                      {invoice.payment_method === "bri_qris" ? (
                        <>
                          <Text style={styles.planMeta}>
                            gateway {invoice.gateway_status?.toUpperCase() ?? "WAITING"} | ref {invoice.gateway_reference ?? "-"}
                          </Text>
                          <Text style={styles.planMeta}>
                            exp {invoice.qris_expired_at ? new Date(invoice.qris_expired_at).toLocaleString("id-ID") : "-"}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.planMeta}>proofs {invoice.proofs_count ?? 0} file</Text>
                      )}
                    </View>
                    {invoice.payment_method === "bri_qris" ? (
                      <AppButton
                        disabled={qrisInvoiceId !== null}
                        leftElement={<Ionicons color={theme.colors.info} name="qr-code-outline" size={16} />}
                        onPress={() => void handleGenerateQris(invoice.id)}
                        title={qrisInvoiceId === invoice.id ? "Menyiapkan..." : "QRIS"}
                        variant="secondary"
                      />
                    ) : (
                      <AppButton
                        disabled={uploadingInvoiceId !== null}
                        leftElement={<Ionicons color={theme.colors.info} name="cloud-upload-outline" size={16} />}
                        onPress={() => void handleUploadProof(invoice.id)}
                        title={uploadingInvoiceId === invoice.id ? "Uploading..." : "Upload"}
                        variant="secondary"
                      />
                    )}
                  </View>
                ))
              )}
            </View>
          </AppPanel>
        </>
      ) : (
        <AppPanel style={styles.panel}>
          <Text style={styles.infoText}>Data langganan tidak tersedia.</Text>
        </AppPanel>
      )}

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
      backgroundColor: theme.mode === "dark" ? "#1f2f4d" : "#f4fbff",
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
    heroSpacer: {
      width: 36,
      height: 36,
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
    panel: {
      gap: theme.spacing.xs,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    infoText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    menuList: {
      gap: theme.spacing.xs,
    },
    planRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surfaceSoft,
      padding: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    invoiceRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    planInfo: {
      flex: 1,
      gap: 4,
    },
    planName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    planMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    loadingWrap: {
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.md,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    successWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.mode === "dark" ? "rgba(76,175,80,0.2)" : "rgba(56,142,60,0.12)",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(76,175,80,0.4)" : "rgba(56,142,60,0.3)",
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 10,
    },
    successText: {
      flex: 1,
      color: theme.colors.success,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
    errorWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.mode === "dark" ? "rgba(244,67,54,0.22)" : "rgba(244,67,54,0.12)",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(244,67,54,0.45)" : "rgba(244,67,54,0.26)",
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 10,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
