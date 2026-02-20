import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { listOrders } from "../../features/orders/orderApi";
import { formatStatusLabel, resolveLaundryTone } from "../../features/orders/orderStatus";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<AppStackParamList, "OrdersToday">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatOrderTime(value: string): string {
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

export function OrdersTodayScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet } = useSession();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOutlet) {
      navigation.replace("OutletSelect");
      return;
    }

    void loadOrders(false);
  }, [selectedOutlet?.id]);

  const titleLine = useMemo(() => {
    if (!selectedOutlet) {
      return "-";
    }

    return `${selectedOutlet.code} - ${selectedOutlet.name}`;
  }, [selectedOutlet]);

  const filteredOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return orders;
    }

    return orders.filter((order) => {
      const values = [order.invoice_no, order.order_code, order.customer?.name, order.laundry_status, order.courier_status]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      return values.some((value) => value.includes(keyword));
    });
  }, [orders, query]);

  const summary = useMemo(() => {
    const total = orders.length;
    const due = orders.filter((order) => order.due_amount > 0).length;
    const done = orders.filter((order) => order.laundry_status === "completed").length;
    return { total, due, done };
  }, [orders]);

  async function loadOrders(isRefresh: boolean): Promise<void> {
    if (!selectedOutlet) {
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listOrders({
        outletId: selectedOutlet.id,
        limit: 30,
      });
      setOrders(data);
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

  function renderOrderCard({ item }: { item: OrderSummary }) {
    return (
      <Pressable onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })} style={styles.orderCard}>
        <View style={styles.orderTop}>
          <View style={styles.orderTitleWrap}>
            <Text style={styles.orderTitle}>{item.invoice_no ?? item.order_code}</Text>
            <Text style={styles.orderCustomer}>{item.customer?.name ?? "-"}</Text>
          </View>
          <StatusPill label={formatStatusLabel(item.laundry_status)} tone={resolveLaundryTone(item.laundry_status)} />
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Kurir</Text>
          <Text style={styles.metaValue}>{formatStatusLabel(item.courier_status)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Total</Text>
          <Text style={styles.metaValue}>{formatMoney(item.total_amount)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Sisa Bayar</Text>
          <Text style={[styles.metaValue, item.due_amount > 0 ? styles.dueValue : styles.successValue]}>{formatMoney(item.due_amount)}</Text>
        </View>
        <Text style={styles.orderTime}>{formatOrderTime(item.created_at)}</Text>
      </Pressable>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>Orders Hari Ini</Text>
        <Text style={styles.headerSubtitle}>{titleLine}</Text>
      </View>

      <AppPanel style={styles.summaryPanel}>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.total}</Text>
            <Text style={styles.summaryLabel}>Total Order</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.done}</Text>
            <Text style={styles.summaryLabel}>Selesai</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.due}</Text>
            <Text style={styles.summaryLabel}>Belum Lunas</Text>
          </View>
        </View>
      </AppPanel>

      <View style={styles.actionRow}>
        <View style={styles.actionItem}>
          <AppButton onPress={() => navigation.navigate("HomeDashboard")} title="Dashboard" variant="secondary" />
        </View>
        <View style={styles.actionItem}>
          <AppButton onPress={() => navigation.replace("OutletSelect")} title="Ganti Outlet" variant="ghost" />
        </View>
      </View>

      <TextInput
        onChangeText={setQuery}
        placeholder="Cari invoice, customer, atau status..."
        placeholderTextColor={theme.colors.textMuted}
        style={styles.searchInput}
        value={query}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
          <Text style={styles.loadingText}>Mengambil data order...</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadOrders(true)}
          refreshing={refreshing}
          renderItem={renderOrderCard}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>Tidak ada order yang cocok dengan filter saat ini.</Text>}
          ListHeaderComponent={
            errorMessage ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screenContent: {
      flex: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    headerBlock: {
      gap: 2,
    },
    headerTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 34,
    },
    headerSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    summaryPanel: {
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    summaryGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    summaryItem: {
      flex: 1,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      gap: 2,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 19,
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    actionRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    actionItem: {
      flex: 1,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    listContainer: {
      paddingTop: 4,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
      flexGrow: 1,
    },
    list: {
      flex: 1,
    },
    orderCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    orderTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    orderTitleWrap: {
      flex: 1,
      gap: 1,
    },
    orderTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
    },
    orderCustomer: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    metaLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    metaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    dueValue: {
      color: theme.colors.danger,
    },
    successValue: {
      color: theme.colors.success,
    },
    orderTime: {
      marginTop: 1,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "right",
    },
    emptyText: {
      marginTop: theme.spacing.md,
      textAlign: "center",
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    errorWrap: {
      marginBottom: 8,
      borderWidth: 1,
      borderRadius: theme.radii.md,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
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
