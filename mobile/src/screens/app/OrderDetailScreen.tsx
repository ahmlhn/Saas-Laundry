import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { getOrderDetail, updateCourierStatus, updateLaundryStatus } from "../../features/orders/orderApi";
import { formatStatusLabel, getNextCourierStatus, getNextLaundryStatus, resolveCourierTone, resolveLaundryTone } from "../../features/orders/orderStatus";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { OrdersStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrderDetail">;
type DetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;

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
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
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
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";

  useEffect(() => {
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
  const canShowStatusActions =
    (canUpdateLaundry && Boolean(nextLaundryStatus)) || (canUpdateCourier && Boolean(detail?.is_pickup_delivery) && Boolean(nextCourierStatus));

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
      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Memuat detail order...</Text>
        </View>
      ) : detail ? (
        <View style={styles.stack}>
          <AppPanel style={styles.heroPanel}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
              </Pressable>
              <View style={styles.heroBadge}>
                <Ionicons color={theme.colors.info} name="receipt-outline" size={15} />
                <Text style={styles.heroBadgeText}>Order Detail</Text>
              </View>
              <Pressable onPress={() => void loadDetail()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
              </Pressable>
            </View>
            <Text style={styles.invoiceTitle}>{detail.invoice_no ?? detail.order_code}</Text>
            <Text numberOfLines={1} style={styles.customerText}>
              {detail.customer?.name ?? "-"}
            </Text>
            <Text numberOfLines={1} style={styles.heroMetaText}>
              {outletLabel}
            </Text>

            <View style={styles.statusRow}>
              <StatusPill label={`Laundry: ${formatStatusLabel(detail.laundry_status)}`} tone={resolveLaundryTone(detail.laundry_status)} />
              {detail.is_pickup_delivery ? (
                <StatusPill label={`Kurir: ${formatStatusLabel(detail.courier_status)}`} tone={resolveCourierTone(detail.courier_status)} />
              ) : (
                <StatusPill label="Pickup/Delivery: Tidak" tone="neutral" />
              )}
            </View>

            <View style={styles.heroMetaRow}>
              <Ionicons color={theme.colors.textMuted} name="time-outline" size={14} />
              <Text style={styles.metaText}>Dibuat: {formatDateTime(detail.created_at)}</Text>
            </View>
            <View style={styles.heroMetaRow}>
              <Ionicons color={theme.colors.textMuted} name="sync-outline" size={14} />
              <Text style={styles.metaText}>Terakhir update: {formatDateTime(detail.updated_at)}</Text>
            </View>
          </AppPanel>

          <AppPanel style={styles.summaryPanel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Ringkasan Pembayaran</Text>
              <Ionicons color={theme.colors.info} name="wallet-outline" size={16} />
            </View>
            <View style={styles.paymentStatGrid}>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Total</Text>
                <Text style={styles.paymentStatValue}>{formatMoney(detail.total_amount)}</Text>
              </View>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Sudah Bayar</Text>
                <Text style={styles.paymentStatValue}>{formatMoney(detail.paid_amount)}</Text>
              </View>
              <View style={styles.paymentStatCard}>
                <Text style={styles.paymentStatLabel}>Sisa Bayar</Text>
                <Text style={[styles.paymentStatValue, detail.due_amount > 0 ? styles.dueValue : styles.successValue]}>
                  {formatMoney(detail.due_amount)}
                </Text>
              </View>
            </View>
          </AppPanel>

          {canShowStatusActions ? (
            <AppPanel style={styles.actionPanel}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Quick Action Status</Text>
                <Ionicons color={theme.colors.warning} name="flash-outline" size={16} />
              </View>
              <View style={[styles.actionStack, isTablet || isCompactLandscape ? styles.actionStackWide : null]}>
                {canUpdateLaundry && nextLaundryStatus ? (
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      disabled={updatingLaundry || updatingCourier}
                      leftElement={<Ionicons color={theme.colors.primaryContrast} name="color-wand-outline" size={17} />}
                      loading={updatingLaundry}
                      onPress={() => void handleNextLaundry()}
                      title={updatingLaundry ? "Memproses..." : `Laundry -> ${formatStatusLabel(nextLaundryStatus)}`}
                    />
                  </View>
                ) : null}

                {canUpdateCourier && detail.is_pickup_delivery && nextCourierStatus ? (
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      disabled={updatingLaundry || updatingCourier}
                      leftElement={<Ionicons color={theme.colors.info} name="bicycle-outline" size={17} />}
                      loading={updatingCourier}
                      onPress={() => void handleNextCourier()}
                      title={updatingCourier ? "Memproses..." : `Kurir -> ${formatStatusLabel(nextCourierStatus)}`}
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </View>
            </AppPanel>
          ) : null}

          {detail.items && detail.items.length > 0 ? (
            <AppPanel>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Item Laundry</Text>
                <Ionicons color={theme.colors.info} name="list-outline" size={16} />
              </View>
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Pembayaran</Text>
              <Ionicons color={theme.colors.info} name="card-outline" size={16} />
            </View>
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

          {actionMessage ? (
            <View style={styles.successWrap}>
              <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
              <Text style={styles.successText}>{actionMessage}</Text>
            </View>
          ) : null}
          {errorMessage ? (
            <View style={styles.errorWrap}>
              <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <AppPanel style={styles.centeredState}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={20} />
          <Text style={styles.errorText}>Detail order tidak ditemukan.</Text>
          <AppButton
            leftElement={<Ionicons color={theme.colors.textPrimary} name="arrow-back-outline" size={17} />}
            onPress={() => navigation.goBack()}
            title="Kembali"
            variant="ghost"
          />
        </AppPanel>
      )}
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
    centeredState: {
      minHeight: 220,
      paddingVertical: 50,
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
    invoiceTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    customerText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    heroMetaText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    heroMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
    paymentStatGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    paymentStatCard: {
      minWidth: isTablet ? 180 : 140,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "31%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 3,
    },
    paymentStatLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    paymentStatValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
    },
    dueValue: {
      color: theme.colors.danger,
    },
    successValue: {
      color: theme.colors.success,
    },
    actionPanel: {
      gap: theme.spacing.sm,
    },
    actionStack: {
      gap: theme.spacing.xs,
    },
    actionStackWide: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionButtonWrap: {
      flex: 1,
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
      fontSize: isTablet ? 14 : 13,
    },
    itemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    itemPrice: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
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
      fontSize: isTablet ? 14 : 13,
    },
    paymentMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    paymentAmount: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 14 : 13,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
    successText: {
      flex: 1,
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
