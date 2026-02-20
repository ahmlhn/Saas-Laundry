import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { getOrderDetail, updateCourierStatus, updateLaundryStatus } from "../../features/orders/orderApi";
import { formatStatusLabel, getNextCourierStatus, getNextLaundryStatus, resolveCourierTone, resolveLaundryTone } from "../../features/orders/orderStatus";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<AppStackParamList, "OrderDetail">;
type DetailRoute = RouteProp<AppStackParamList, "OrderDetail">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function formatItemMetric(weightKg: string | number | null, qty: string | number | null, unitType: string): string {
  if (unitType === "kg") {
    return `${weightKg ?? 0} kg`;
  }
  return `${qty ?? 0} pcs`;
}

function hasAnyRole(roles: string[], allowList: string[]): boolean {
  return roles.some((role) => allowList.includes(role));
}

export function OrderDetailScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const route = useRoute<DetailRoute>();
  const { session, selectedOutlet } = useSession();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingLaundry, setUpdatingLaundry] = useState(false);
  const [updatingCourier, setUpdatingCourier] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const roles = session?.roles ?? [];
  const canUpdateLaundry = hasAnyRole(roles, ["owner", "admin", "worker"]);
  const canUpdateCourier = hasAnyRole(roles, ["owner", "admin", "courier"]);

  useEffect(() => {
    if (!selectedOutlet) {
      navigation.replace("OutletSelect");
      return;
    }

    void loadDetail();
  }, [route.params.orderId, selectedOutlet?.id]);

  async function loadDetail(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await getOrderDetail(route.params.orderId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const nextLaundryStatus = useMemo(() => getNextLaundryStatus(detail?.laundry_status), [detail?.laundry_status]);
  const nextCourierStatus = useMemo(() => {
    const candidate = getNextCourierStatus(detail?.courier_status);
    if (!candidate) {
      return null;
    }

    if (candidate === "delivery_pending" && !["ready", "completed"].includes(detail?.laundry_status ?? "")) {
      return null;
    }

    return candidate;
  }, [detail?.courier_status, detail?.laundry_status]);

  async function handleNextLaundry(): Promise<void> {
    if (!detail || !nextLaundryStatus || updatingLaundry) {
      return;
    }

    setUpdatingLaundry(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await updateLaundryStatus({
        orderId: detail.id,
        status: nextLaundryStatus,
      });
      const latest = await getOrderDetail(detail.id);
      setDetail(latest);
      setActionMessage(`Laundry dipindah ke ${formatStatusLabel(nextLaundryStatus)}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUpdatingLaundry(false);
    }
  }

  async function handleNextCourier(): Promise<void> {
    if (!detail || !nextCourierStatus || updatingCourier) {
      return;
    }

    setUpdatingCourier(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await updateCourierStatus({
        orderId: detail.id,
        status: nextCourierStatus,
      });
      const latest = await getOrderDetail(detail.id);
      setDetail(latest);
      setActionMessage(`Kurir dipindah ke ${formatStatusLabel(nextCourierStatus)}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUpdatingCourier(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <AppButton onPress={() => void loadDetail()} title="Refresh" variant="ghost" />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Memuat detail order...</Text>
        </View>
      ) : detail ? (
        <View style={styles.stack}>
          <AppPanel style={styles.heroPanel}>
            <Text style={styles.invoiceTitle}>{detail.invoice_no ?? detail.order_code}</Text>
            <Text style={styles.customerText}>{detail.customer?.name ?? "-"}</Text>

            <View style={styles.statusRow}>
              <StatusPill label={`Laundry: ${formatStatusLabel(detail.laundry_status)}`} tone={resolveLaundryTone(detail.laundry_status)} />
              {detail.is_pickup_delivery ? (
                <StatusPill label={`Kurir: ${formatStatusLabel(detail.courier_status)}`} tone={resolveCourierTone(detail.courier_status)} />
              ) : (
                <StatusPill label="Pickup/Delivery: Tidak" tone="neutral" />
              )}
            </View>

            <Text style={styles.metaText}>Dibuat: {formatDateTime(detail.created_at)}</Text>
            <Text style={styles.metaText}>Terakhir update: {formatDateTime(detail.updated_at)}</Text>
          </AppPanel>

          <AppPanel>
            <Text style={styles.sectionTitle}>Ringkasan Pembayaran</Text>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Total</Text>
              <Text style={styles.metaValue}>{formatMoney(detail.total_amount)}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Sudah Bayar</Text>
              <Text style={styles.metaValue}>{formatMoney(detail.paid_amount)}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Sisa Bayar</Text>
              <Text style={[styles.metaValue, detail.due_amount > 0 ? styles.dueValue : styles.successValue]}>{formatMoney(detail.due_amount)}</Text>
            </View>
          </AppPanel>

          {(canUpdateLaundry && nextLaundryStatus) || (canUpdateCourier && detail.is_pickup_delivery && nextCourierStatus) ? (
            <AppPanel>
              <Text style={styles.sectionTitle}>Quick Action Status</Text>
              <View style={styles.actionStack}>
                {canUpdateLaundry && nextLaundryStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    loading={updatingLaundry}
                    onPress={() => void handleNextLaundry()}
                    title={updatingLaundry ? "Memproses..." : `Laundry -> ${formatStatusLabel(nextLaundryStatus)}`}
                  />
                ) : null}

                {canUpdateCourier && detail.is_pickup_delivery && nextCourierStatus ? (
                  <AppButton
                    disabled={updatingLaundry || updatingCourier}
                    loading={updatingCourier}
                    onPress={() => void handleNextCourier()}
                    title={updatingCourier ? "Memproses..." : `Kurir -> ${formatStatusLabel(nextCourierStatus)}`}
                    variant="secondary"
                  />
                ) : null}
              </View>
            </AppPanel>
          ) : null}

          {detail.items && detail.items.length > 0 ? (
            <AppPanel>
              <Text style={styles.sectionTitle}>Item Laundry</Text>
              <View style={styles.itemList}>
                {detail.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName}>{item.service_name_snapshot}</Text>
                      <Text style={styles.itemMeta}>{formatItemMetric(item.weight_kg, item.qty, item.unit_type_snapshot)}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{formatMoney(item.subtotal_amount)}</Text>
                  </View>
                ))}
              </View>
            </AppPanel>
          ) : null}

          <AppPanel>
            <Text style={styles.sectionTitle}>Pembayaran</Text>
            {detail.payments && detail.payments.length > 0 ? (
              <View style={styles.paymentList}>
                {detail.payments.map((payment) => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View style={styles.paymentMain}>
                      <Text style={styles.paymentMethod}>{payment.method}</Text>
                      <Text style={styles.paymentMeta}>{formatDateTime(payment.paid_at)}</Text>
                    </View>
                    <Text style={styles.paymentAmount}>{formatMoney(payment.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>Belum ada pembayaran.</Text>
            )}
          </AppPanel>

          {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Detail order tidak ditemukan.</Text>
        </View>
      )}
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
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    backButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    centered: {
      paddingVertical: 60,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    stack: {
      gap: theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    invoiceTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 24,
      lineHeight: 30,
    },
    customerText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: 2,
    },
    metaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      marginBottom: 2,
    },
    metaLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    metaKey: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    metaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    dueValue: {
      color: theme.colors.danger,
    },
    successValue: {
      color: theme.colors.success,
    },
    actionStack: {
      gap: theme.spacing.xs,
    },
    itemList: {
      gap: theme.spacing.xs,
    },
    itemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSoft,
    },
    itemMain: {
      flex: 1,
      gap: 1,
    },
    itemName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    itemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    itemPrice: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    paymentList: {
      gap: theme.spacing.xs,
    },
    paymentRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSoft,
    },
    paymentMain: {
      flex: 1,
      gap: 1,
    },
    paymentMethod: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    paymentMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    paymentAmount: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    successText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
