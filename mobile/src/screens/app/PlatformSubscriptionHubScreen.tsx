import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  activatePlatformSubscriptionTenant,
  getPlatformSubscriptionTenantDetail,
  listPlatformSubscriptionPaymentEvents,
  listPlatformSubscriptionTenants,
  suspendPlatformSubscriptionTenant,
  verifyPlatformSubscriptionInvoice,
} from "../../features/subscription/platformSubscriptionApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type {
  PlatformSubscriptionPaymentEvent,
  PlatformSubscriptionTenantDetailPayload,
  PlatformSubscriptionTenantListItem,
} from "../../types/subscription";

type TenantFilterState = "all" | "active" | "past_due" | "suspended";

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(0, Math.round(value)))}`;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "-";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("id-ID");
}

function toneByState(state: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (state) {
    case "active":
      return "success";
    case "past_due":
      return "warning";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

function toneByInvoiceStatus(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "paid":
      return "success";
    case "pending_verification":
      return "warning";
    case "overdue":
      return "danger";
    case "rejected":
      return "danger";
    case "issued":
      return "info";
    default:
      return "neutral";
  }
}

function toneByEventStatus(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "accepted":
      return "success";
    case "duplicate":
      return "info";
    case "rejected":
    case "amount_mismatch":
      return "danger";
    default:
      return "warning";
  }
}

export function PlatformSubscriptionHubScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const { session, logout } = useSession();

  const roles = session?.roles ?? [];
  const canVerify = roles.includes("platform_owner") || roles.includes("platform_billing");
  const canControlTenantState = roles.includes("platform_owner");
  const inPlatformWorkspace = session?.workspace === "platform";

  const [searchInput, setSearchInput] = useState("");
  const [stateFilter, setStateFilter] = useState<TenantFilterState>("all");
  const [tenants, setTenants] = useState<PlatformSubscriptionTenantListItem[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<PlatformSubscriptionTenantDetailPayload | null>(null);
  const [paymentEvents, setPaymentEvents] = useState<PlatformSubscriptionPaymentEvent[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!inPlatformWorkspace) {
      setLoadingTenants(false);
      return;
    }

    void loadTenants();
  }, [inPlatformWorkspace]);

  async function loadTenants(preferredTenantId?: string | null): Promise<void> {
    if (!inPlatformWorkspace) {
      return;
    }

    setLoadingTenants(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const list = await listPlatformSubscriptionTenants({
        q: searchInput.trim() || undefined,
        state: stateFilter === "all" ? undefined : stateFilter,
        limit: 60,
      });
      setTenants(list);

      const nextTenantId =
        (preferredTenantId && list.some((item) => item.id === preferredTenantId) ? preferredTenantId : null) ??
        (selectedTenantId && list.some((item) => item.id === selectedTenantId) ? selectedTenantId : null) ??
        list[0]?.id ??
        null;

      setSelectedTenantId(nextTenantId);

      if (nextTenantId) {
        await loadTenantDetail(nextTenantId);
      } else {
        setTenantDetail(null);
        setPaymentEvents([]);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingTenants(false);
    }
  }

  async function loadTenantDetail(tenantId: string): Promise<void> {
    setLoadingDetail(true);
    setErrorMessage(null);

    try {
      const detail = await getPlatformSubscriptionTenantDetail(tenantId);
      const events = await listPlatformSubscriptionPaymentEvents({
        tenantId,
        limit: 30,
      });
      setTenantDetail(detail);
      setPaymentEvents(events);
      setSelectedTenantId(tenantId);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      setTenantDetail(null);
      setPaymentEvents([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleVerifyInvoice(invoiceId: string, decision: "approve" | "reject"): Promise<void> {
    if (!canVerify || actionLoading || !tenantDetail) {
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await verifyPlatformSubscriptionInvoice({
        invoiceId,
        decision,
      });
      await Promise.all([loadTenantDetail(tenantDetail.tenant.id), loadTenants(tenantDetail.tenant.id)]);
      setSuccessMessage(decision === "approve" ? "Invoice berhasil di-approve." : "Invoice berhasil di-reject.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSuspendTenant(): Promise<void> {
    if (!canControlTenantState || actionLoading || !tenantDetail) {
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await suspendPlatformSubscriptionTenant(tenantDetail.tenant.id);
      await Promise.all([loadTenantDetail(tenantDetail.tenant.id), loadTenants(tenantDetail.tenant.id)]);
      setSuccessMessage("Tenant berhasil disuspend (read-only).");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleActivateTenant(): Promise<void> {
    if (!canControlTenantState || actionLoading || !tenantDetail) {
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await activatePlatformSubscriptionTenant(tenantDetail.tenant.id);
      await Promise.all([loadTenantDetail(tenantDetail.tenant.id), loadTenants(tenantDetail.tenant.id)]);
      setSuccessMessage("Tenant berhasil diaktifkan kembali.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  if (!inPlatformWorkspace) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.heroPanel}>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="shield-checkmark-outline" size={16} />
            <Text style={styles.heroBadgeText}>Platform</Text>
          </View>
          <Text style={styles.title}>Platform Subscription</Text>
          <Text style={styles.subtitle}>Akun ini bukan workspace platform.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="shield-checkmark-outline" size={16} />
            <Text style={styles.heroBadgeText}>Platform</Text>
          </View>
          <StatusPill label={(roles[0] ?? "platform").toUpperCase()} tone="info" />
        </View>
        <Text style={styles.title}>Platform Subscription</Text>
        <Text style={styles.subtitle}>Kelola verifikasi invoice tenant, suspend/activate, dan audit status langganan langsung dari mobile.</Text>
      </AppPanel>

      <AppPanel style={styles.filterPanel}>
        <Text style={styles.label}>Cari Tenant</Text>
        <TextInput
          onChangeText={setSearchInput}
          placeholder="Nama atau tenant id"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={searchInput}
        />
        <View style={styles.filterChipRow}>
          {(["all", "active", "past_due", "suspended"] as const).map((state) => {
            const active = stateFilter === state;
            const label = state === "all" ? "Semua" : state.toUpperCase();

            return (
              <Pressable key={state} onPress={() => setStateFilter(state)} style={[styles.filterChip, active ? styles.filterChipActive : null]}>
                <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.filterActionRow}>
          <View style={styles.filterActionButtonWrap}>
            <AppButton
              disabled={loadingTenants || actionLoading}
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="search-outline" size={17} />}
              loading={loadingTenants}
              onPress={() => void loadTenants(selectedTenantId)}
              title="Muat Tenant"
            />
          </View>
          <View style={styles.filterActionButtonWrap}>
            <AppButton
              disabled={actionLoading}
              leftElement={<Ionicons color={theme.colors.textPrimary} name="log-out-outline" size={17} />}
              onPress={() => void logout()}
              title="Logout"
              variant="ghost"
            />
          </View>
        </View>
      </AppPanel>

      <AppPanel style={styles.listPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Daftar Tenant</Text>
          <StatusPill label={`${tenants.length} item`} tone="info" />
        </View>
        {loadingTenants ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat data tenant...</Text>
          </View>
        ) : tenants.length === 0 ? (
          <Text style={styles.helperText}>Tidak ada tenant sesuai filter.</Text>
        ) : (
          <View style={styles.menuList}>
            {tenants.map((tenant) => {
              const active = selectedTenantId === tenant.id;

              return (
                <Pressable
                  key={tenant.id}
                  onPress={() => void loadTenantDetail(tenant.id)}
                  style={({ pressed }) => [styles.tenantRow, active ? styles.tenantRowActive : null, pressed ? styles.tenantRowPressed : null]}
                >
                  <View style={styles.tenantMeta}>
                    <Text numberOfLines={1} style={styles.tenantTitle}>
                      {tenant.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.tenantSubtitle}>
                      {tenant.id} | plan {tenant.current_plan?.key?.toUpperCase() ?? "-"}
                    </Text>
                    <Text numberOfLines={1} style={styles.tenantSubtitle}>
                      next due: {tenant.next_due_invoice ? `${tenant.next_due_invoice.invoice_no} (${formatDate(tenant.next_due_invoice.due_at)})` : "-"}
                    </Text>
                  </View>
                  <View style={styles.tenantPillColumn}>
                    <StatusPill label={tenant.subscription_state.toUpperCase()} tone={toneByState(tenant.subscription_state)} />
                    <StatusPill label={tenant.write_access_mode.toUpperCase()} tone={tenant.write_access_mode === "full" ? "success" : "warning"} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </AppPanel>

      <AppPanel style={styles.detailPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Detail Tenant</Text>
          {tenantDetail ? <StatusPill label={tenantDetail.tenant.subscription_state.toUpperCase()} tone={toneByState(tenantDetail.tenant.subscription_state)} /> : null}
        </View>
        {loadingDetail ? (
          <Text style={styles.helperText}>Memuat detail tenant...</Text>
        ) : !tenantDetail ? (
          <Text style={styles.helperText}>Pilih tenant untuk melihat detail.</Text>
        ) : (
          <>
            <Text style={styles.infoText}>Tenant: {tenantDetail.tenant.name}</Text>
            <Text style={styles.infoText}>ID: {tenantDetail.tenant.id}</Text>
            <Text style={styles.infoText}>
              Plan: {tenantDetail.current_plan?.name ?? "-"} ({tenantDetail.current_plan?.key?.toUpperCase() ?? "-"})
            </Text>
            <Text style={styles.infoText}>
              Cycle: {formatDate(tenantDetail.current_cycle?.cycle_start_at ?? null)} - {formatDate(tenantDetail.current_cycle?.cycle_end_at ?? null)}
            </Text>

            <View style={styles.controlRow}>
              <View style={styles.controlButtonWrap}>
                <AppButton
                  disabled={!canControlTenantState || actionLoading}
                  leftElement={<Ionicons color={theme.colors.warning} name="pause-circle-outline" size={16} />}
                  onPress={() => void handleSuspendTenant()}
                  title="Suspend"
                  variant="secondary"
                />
              </View>
              <View style={styles.controlButtonWrap}>
                <AppButton
                  disabled={!canControlTenantState || actionLoading}
                  leftElement={<Ionicons color={theme.colors.success} name="play-circle-outline" size={16} />}
                  onPress={() => void handleActivateTenant()}
                  title="Activate"
                  variant="secondary"
                />
              </View>
            </View>
            {!canControlTenantState ? <Text style={styles.helperText}>Hanya role platform_owner yang bisa suspend/activate tenant.</Text> : null}

            <View style={styles.invoiceListWrap}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Invoice</Text>
                <StatusPill label={`${tenantDetail.invoices.length} item`} tone="info" />
              </View>
              {tenantDetail.invoices.length === 0 ? (
                <Text style={styles.helperText}>Belum ada invoice pada tenant ini.</Text>
              ) : (
                <View style={styles.menuList}>
                  {tenantDetail.invoices.map((invoice) => (
                    <View key={invoice.id} style={styles.invoiceRow}>
                      <View style={styles.invoiceMeta}>
                        <Text style={styles.invoiceTitle}>{invoice.invoice_no}</Text>
                        <Text style={styles.invoiceSubtitle}>
                          {formatMoney(invoice.amount_total)} | due {formatDate(invoice.due_at)}
                        </Text>
                        <Text style={styles.invoiceSubtitle}>
                          {invoice.payment_method.toUpperCase()} | gateway {invoice.gateway_status?.toUpperCase() ?? "-"}
                        </Text>
                        <Text style={styles.invoiceSubtitle}>proofs: {invoice.proofs.length}</Text>
                      </View>
                      <View style={styles.invoiceActionColumn}>
                        <StatusPill label={invoice.status.toUpperCase()} tone={toneByInvoiceStatus(invoice.status)} />
                        <View style={styles.invoiceActionRow}>
                          <Pressable
                            disabled={!canVerify || actionLoading || invoice.status === "paid" || invoice.payment_method !== "bank_transfer"}
                            onPress={() => void handleVerifyInvoice(invoice.id, "approve")}
                            style={({ pressed }) => [
                              styles.invoiceActionChip,
                              styles.invoiceActionChipApprove,
                              (!canVerify || actionLoading || invoice.status === "paid" || invoice.payment_method !== "bank_transfer")
                                ? styles.invoiceActionChipDisabled
                                : null,
                              pressed ? styles.invoiceActionChipPressed : null,
                            ]}
                          >
                            <Text style={styles.invoiceActionText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            disabled={!canVerify || actionLoading || invoice.status === "paid" || invoice.payment_method !== "bank_transfer"}
                            onPress={() => void handleVerifyInvoice(invoice.id, "reject")}
                            style={({ pressed }) => [
                              styles.invoiceActionChip,
                              styles.invoiceActionChipReject,
                              (!canVerify || actionLoading || invoice.status === "paid" || invoice.payment_method !== "bank_transfer")
                                ? styles.invoiceActionChipDisabled
                                : null,
                              pressed ? styles.invoiceActionChipPressed : null,
                            ]}
                          >
                            <Text style={styles.invoiceActionText}>Reject</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.invoiceListWrap}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Gateway Events</Text>
                <StatusPill label={`${paymentEvents.length} item`} tone="info" />
              </View>
              {paymentEvents.length === 0 ? (
                <Text style={styles.helperText}>Belum ada event gateway untuk tenant ini.</Text>
              ) : (
                <View style={styles.menuList}>
                  {paymentEvents.map((event) => (
                    <View key={event.id} style={styles.invoiceRow}>
                      <View style={styles.invoiceMeta}>
                        <Text style={styles.invoiceTitle}>{event.gateway_event_id}</Text>
                        <Text style={styles.invoiceSubtitle}>
                          {event.event_type.toUpperCase()} | {event.process_status.toUpperCase()}
                        </Text>
                        <Text style={styles.invoiceSubtitle}>
                          {event.amount_total !== null ? formatMoney(event.amount_total) : "-"} | {formatDate(event.received_at)}
                        </Text>
                      </View>
                      <StatusPill label={(event.process_status || "unknown").toUpperCase()} tone={toneByEventStatus(event.process_status)} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
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
    heroHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
      alignSelf: "flex-start",
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
      fontSize: isTablet ? 26 : 23,
      lineHeight: isTablet ? 32 : 29,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    filterPanel: {
      gap: theme.spacing.xs,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    filterChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    filterChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      letterSpacing: 0.2,
    },
    filterChipTextActive: {
      color: theme.colors.info,
    },
    filterActionRow: {
      flexDirection: "row",
      gap: 8,
    },
    filterActionButtonWrap: {
      flex: 1,
    },
    listPanel: {
      gap: theme.spacing.xs,
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
      fontSize: 14,
    },
    loadingWrap: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    menuList: {
      gap: 8,
    },
    tenantRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    tenantRowActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    tenantRowPressed: {
      opacity: 0.86,
    },
    tenantMeta: {
      flex: 1,
      gap: 2,
    },
    tenantTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    tenantSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    tenantPillColumn: {
      alignItems: "flex-end",
      gap: 4,
    },
    detailPanel: {
      gap: 8,
    },
    infoText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    controlRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 2,
    },
    controlButtonWrap: {
      flex: 1,
    },
    invoiceListWrap: {
      gap: 8,
      marginTop: 4,
    },
    invoiceRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    invoiceMeta: {
      flex: 1,
      gap: 2,
    },
    invoiceTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    invoiceSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    invoiceActionColumn: {
      alignItems: "flex-end",
      gap: 6,
    },
    invoiceActionRow: {
      flexDirection: "row",
      gap: 6,
    },
    invoiceActionChip: {
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    invoiceActionChipApprove: {
      borderColor: theme.mode === "dark" ? "#2b5d45" : "#9fdab6",
      backgroundColor: theme.mode === "dark" ? "#183629" : "#ecf9f1",
    },
    invoiceActionChipReject: {
      borderColor: theme.mode === "dark" ? "#7f3a53" : "#f3c1cd",
      backgroundColor: theme.mode === "dark" ? "#472130" : "#ffe8ed",
    },
    invoiceActionChipDisabled: {
      opacity: 0.45,
    },
    invoiceActionChipPressed: {
      opacity: 0.8,
    },
    invoiceActionText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    helperText: {
      color: theme.colors.textMuted,
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
