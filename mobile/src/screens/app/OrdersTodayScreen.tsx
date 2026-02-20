import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { ORDER_BUCKETS, type OrderBucket, resolveOrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { formatStatusLabel, resolveLaundryTone } from "../../features/orders/orderStatus";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { OrdersStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrdersToday">;
type OrdersRoute = RouteProp<OrdersStackParamList, "OrdersToday">;

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
  const route = useRoute<OrdersRoute>();
  const { selectedOutlet, selectOutlet } = useSession();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<OrderBucket>(route.params?.initialBucket ?? "validasi");

  useEffect(() => {
    if (route.params?.initialBucket) {
      setActiveBucket(route.params.initialBucket);
    }
  }, [route.params?.initialBucket]);

  useEffect(() => {
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

    return orders.filter((order) => {
      if (resolveOrderBucket(order) !== activeBucket) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const values = [order.invoice_no, order.order_code, order.customer?.name, order.laundry_status, order.courier_status]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      return values.some((value) => value.includes(keyword));
    });
  }, [orders, query, activeBucket]);

  const bucketCounts = useMemo(() => {
    const counts: Record<OrderBucket, number> = {
      validasi: 0,
      antrian: 0,
      proses: 0,
      siap_ambil: 0,
      siap_antar: 0,
    };

    for (const order of orders) {
      counts[resolveOrderBucket(order)] += 1;
    }

    return counts;
  }, [orders]);

  async function loadOrders(isRefresh: boolean): Promise<void> {
    if (!selectedOutlet) {
      setOrders([]);
      setLoading(false);
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
        limit: 60,
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
        <Text style={styles.headerTitle}>Pesanan</Text>
        <Text style={styles.headerSubtitle}>{titleLine}</Text>
      </View>

      <View style={styles.filterTabs}>
        {ORDER_BUCKETS.map((bucket) => {
          const isActive = bucket.key === activeBucket;
          return (
            <Pressable key={bucket.key} onPress={() => setActiveBucket(bucket.key)} style={[styles.filterTab, isActive ? styles.filterTabActive : null]}>
              <Text style={[styles.filterTabText, isActive ? styles.filterTabTextActive : null]}>{bucket.label}</Text>
              <Text style={[styles.filterCount, isActive ? styles.filterCountActive : null]}>{bucketCounts[bucket.key]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionItem}>
          <AppButton onPress={() => void loadOrders(false)} title="Refresh" variant="secondary" />
        </View>
        <View style={styles.actionItem}>
          <AppButton
            onPress={() => {
              selectOutlet(null);
            }}
            title="Ganti Outlet"
            variant="ghost"
          />
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
          ListEmptyComponent={
            <AppPanel style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Belum ada data</Text>
              <Text style={styles.emptyText}>Tidak ada pesanan pada kategori {ORDER_BUCKETS.find((item) => item.key === activeBucket)?.label ?? "-"}.</Text>
            </AppPanel>
          }
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
    filterTabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    filterTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    filterTabActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    filterTabText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    filterTabTextActive: {
      color: theme.colors.info,
    },
    filterCount: {
      minWidth: 18,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      textAlign: "center",
    },
    filterCountActive: {
      color: theme.colors.info,
      backgroundColor: theme.colors.surface,
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
    emptyPanel: {
      gap: theme.spacing.xs,
      alignItems: "center",
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
      marginTop: theme.spacing.md,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    emptyText: {
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
