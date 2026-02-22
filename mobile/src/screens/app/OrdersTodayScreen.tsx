import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { StatusPill } from "../../components/ui/StatusPill";
import { listOrders } from "../../features/orders/orderApi";
import { ORDER_BUCKETS, type OrderBucket, resolveOrderBucket } from "../../features/orders/orderBuckets";
import { formatStatusLabel, resolveLaundryTone } from "../../features/orders/orderStatus";
import { toDateToken } from "../../lib/dateTime";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { OrdersStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderSummary } from "../../types/order";

type Navigation = NativeStackNavigationProp<OrdersStackParamList, "OrdersToday">;
type OrdersRoute = RouteProp<OrdersStackParamList, "OrdersToday">;
type LoadMode = "initial" | "refresh" | "more";

interface LoadOrdersArgs {
  mode: LoadMode;
  targetLimit: number;
  query: string;
  forceRefresh?: boolean;
}

const currencyFormatter = new Intl.NumberFormat("id-ID");
const PAGE_SIZE = 20;
const INITIAL_LIMIT = 30;
const MAX_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;

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

function resolveToneColor(theme: AppTheme, tone: "info" | "warning" | "success" | "danger"): string {
  if (tone === "warning") {
    return theme.colors.warning;
  }
  if (tone === "success") {
    return theme.colors.success;
  }
  if (tone === "danger") {
    return theme.colors.danger;
  }

  return theme.colors.info;
}

export function OrdersTodayScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape, isCompactLandscape), [theme, isTablet, isLandscape, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const route = useRoute<OrdersRoute>();
  const { selectedOutlet } = useSession();
  const outletTimezone = selectedOutlet?.timezone;

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<OrderBucket>(route.params?.initialBucket ?? "validasi");
  const [isFilterRaised, setIsFilterRaised] = useState(false);

  const requestIdRef = useRef(0);
  const firstFocusHandledRef = useRef(false);
  const latestLimitRef = useRef(limit);
  const latestQueryRef = useRef(submittedQuery);
  const listTransition = useRef(new Animated.Value(1)).current;
  const hasAnimatedListRef = useRef(false);

  useEffect(() => {
    latestLimitRef.current = limit;
  }, [limit]);

  useEffect(() => {
    latestQueryRef.current = submittedQuery;
  }, [submittedQuery]);

  useEffect(() => {
    if (route.params?.initialBucket) {
      setActiveBucket(route.params.initialBucket);
    }
  }, [route.params?.initialBucket]);

  useEffect(() => {
    firstFocusHandledRef.current = false;
  }, [selectedOutlet?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSubmittedQuery(queryInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [queryInput]);

  const loadOrders = useCallback(
    async ({ mode, targetLimit, query, forceRefresh = false }: LoadOrdersArgs): Promise<void> => {
      const outletId = selectedOutlet?.id;
      if (!outletId) {
        setOrders([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        setIsLoadingMore(false);
        return;
      }

      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;

      if (mode === "initial") {
        setLoading(true);
      } else if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setIsLoadingMore(true);
      }

      setErrorMessage(null);

      try {
        const data = await listOrders({
          outletId,
          limit: targetLimit,
          query,
          date: toDateToken(new Date(), outletTimezone),
          timezone: outletTimezone,
          forceRefresh,
        });

        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        setOrders(data);
        setLimit(targetLimit);
        latestLimitRef.current = targetLimit;
        setHasMore(data.length >= targetLimit && targetLimit < MAX_LIMIT);
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        setErrorMessage(getApiErrorMessage(error));
      } finally {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        setLoading(false);
        setRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [selectedOutlet?.id, outletTimezone]
  );

  useEffect(() => {
    const nextLimit = INITIAL_LIMIT;
    setLimit(nextLimit);
    latestLimitRef.current = nextLimit;
    setHasMore(false);

    void loadOrders({
      mode: "initial",
      targetLimit: nextLimit,
      query: submittedQuery,
      forceRefresh: true,
    });
  }, [selectedOutlet?.id, submittedQuery, loadOrders]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedOutlet?.id) {
        return;
      }

      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }

      void loadOrders({
        mode: "refresh",
        targetLimit: latestLimitRef.current,
        query: latestQueryRef.current,
        forceRefresh: true,
      });
    }, [selectedOutlet?.id, loadOrders])
  );

  const titleLine = useMemo(() => {
    if (!selectedOutlet) {
      return "Outlet belum dipilih";
    }

    return `${selectedOutlet.code} - ${selectedOutlet.name}`;
  }, [selectedOutlet]);

  const bucketedOrders = useMemo(() => {
    return orders.filter((order) => resolveOrderBucket(order) === activeBucket);
  }, [orders, activeBucket]);

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

  const pendingCount = useMemo(() => bucketCounts.validasi + bucketCounts.antrian + bucketCounts.proses, [bucketCounts]);
  const dueCount = useMemo(() => orders.filter((order) => order.due_amount > 0).length, [orders]);
  const activeBucketLabel = useMemo(() => ORDER_BUCKETS.find((item) => item.key === activeBucket)?.label ?? "-", [activeBucket]);

  const animateListTransition = useCallback(() => {
    listTransition.stopAnimation();
    listTransition.setValue(0.9);
    Animated.timing(listTransition, {
      toValue: 1,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [listTransition]);

  useEffect(() => {
    if (!hasAnimatedListRef.current) {
      hasAnimatedListRef.current = true;
      return;
    }

    animateListTransition();
    setIsFilterRaised(false);
  }, [activeBucket, submittedQuery, animateListTransition]);

  const listAnimatedStyle = useMemo(
    () => ({
      opacity: listTransition,
      transform: [
        {
          translateY: listTransition.interpolate({
            inputRange: [0, 1],
            outputRange: [7, 0],
          }),
        },
      ],
    }),
    [listTransition]
  );

  const handleRefresh = useCallback(() => {
    void loadOrders({
      mode: "refresh",
      targetLimit: latestLimitRef.current,
      query: latestQueryRef.current,
      forceRefresh: true,
    });
  }, [loadOrders]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || refreshing || isLoadingMore) {
      return;
    }

    const currentLimit = latestLimitRef.current;
    const nextLimit = Math.min(currentLimit + PAGE_SIZE, MAX_LIMIT);
    if (nextLimit === currentLimit) {
      return;
    }

    void loadOrders({
      mode: "more",
      targetLimit: nextLimit,
      query: latestQueryRef.current,
      forceRefresh: true,
    });
  }, [hasMore, isLoadingMore, loading, refreshing, loadOrders]);

  const handleBucketChange = useCallback(
    (bucket: OrderBucket) => {
      if (bucket === activeBucket) {
        return;
      }

      setActiveBucket(bucket);
    },
    [activeBucket]
  );

  const handleListScroll = useCallback((offsetY: number) => {
    const shouldRaise = offsetY > 8;
    setIsFilterRaised((previous) => (previous === shouldRaise ? previous : shouldRaise));
  }, []);

  function renderOrderCard({ item }: { item: OrderSummary }) {
    const laundryTone = resolveLaundryTone(item.laundry_status);
    const accentColor = resolveToneColor(theme, laundryTone);
    const isDue = item.due_amount > 0;
    const identitySecondary = item.invoice_no ? item.order_code : "Tanpa invoice";
    const pickupLabel = item.is_pickup_delivery ? (isCompactLandscape ? "Antar" : "Antar Jemput") : (isCompactLandscape ? "Ambil" : "Ambil Sendiri");
    const paymentLabel = isDue ? (isCompactLandscape ? "Piutang" : "Belum Lunas") : "Lunas";
    const subtleIconColor = theme.mode === "dark" ? "#a8c6e1" : theme.colors.textMuted;

    return (
      <Pressable onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })} style={({ pressed }) => [styles.orderCard, pressed ? styles.orderCardPressed : null]}>
        <View style={[styles.orderAccent, { backgroundColor: accentColor }]} />
        <View style={styles.orderContent}>
          <View style={styles.orderTop}>
            <View style={styles.orderTitleWrap}>
              <Text numberOfLines={1} style={styles.orderTitle}>
                {item.invoice_no ?? item.order_code}
              </Text>
              <Text numberOfLines={1} style={styles.orderCode}>
                {identitySecondary}
              </Text>
              <View style={styles.customerRow}>
                <Ionicons color={subtleIconColor} name="person-outline" size={14} />
                <Text numberOfLines={1} style={styles.orderCustomer}>
                  {item.customer?.name ?? "-"}
                </Text>
              </View>
            </View>
            <StatusPill label={formatStatusLabel(item.laundry_status)} tone={laundryTone} />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Kurir</Text>
              <Text numberOfLines={1} style={styles.metricValue}>
                {formatStatusLabel(item.courier_status)}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Total</Text>
              <Text numberOfLines={1} style={styles.metricValue}>
                {formatMoney(item.total_amount)}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Sisa</Text>
              <Text numberOfLines={1} style={[styles.metricValue, isDue ? styles.metricDue : styles.metricPaid]}>
                {formatMoney(item.due_amount)}
              </Text>
            </View>
          </View>

          <View style={styles.orderBottom}>
            <View style={styles.badgeRow}>
              <View style={[styles.tag, isCompactLandscape ? styles.tagCompact : null, item.is_pickup_delivery ? styles.tagInfo : styles.tagNeutral]}>
                <Ionicons color={item.is_pickup_delivery ? theme.colors.info : subtleIconColor} name={item.is_pickup_delivery ? "bicycle-outline" : "walk-outline"} size={12} />
                <Text numberOfLines={1} style={[styles.tagText, item.is_pickup_delivery ? styles.tagTextInfo : styles.tagTextNeutral]}>
                  {pickupLabel}
                </Text>
              </View>
              <View style={[styles.tag, isCompactLandscape ? styles.tagCompact : null, isDue ? styles.tagWarning : styles.tagSuccess]}>
                <Ionicons color={isDue ? theme.colors.warning : theme.colors.success} name={isDue ? "alert-circle-outline" : "checkmark-circle-outline"} size={12} />
                <Text numberOfLines={1} style={[styles.tagText, isDue ? styles.tagTextWarning : styles.tagTextSuccess]}>
                  {paymentLabel}
                </Text>
              </View>
            </View>
            <View style={styles.timePill}>
              <View style={styles.timeRow}>
                <Ionicons color={subtleIconColor} name="time-outline" size={12} />
                <Text style={styles.orderTime}>{formatOrderTime(item.created_at)}</Text>
              </View>
              <Ionicons color={subtleIconColor} name="chevron-forward" size={14} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  function renderLoadingSkeleton() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`order-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={14} width="45%" />
            <AppSkeletonBlock height={11} width="36%" />
            <View style={styles.skeletonMetrics}>
              <AppSkeletonBlock height={40} width="31%" />
              <AppSkeletonBlock height={40} width="31%" />
              <AppSkeletonBlock height={40} width="31%" />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <View style={styles.heroCard}>
        <View style={styles.heroLayerPrimary} />
        <View style={styles.heroLayerSecondary} />
        <View style={styles.heroGlow} />

        <View style={styles.heroContent}>
          <View style={styles.heroHead}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.headerTitle}>Pesanan</Text>
              <Text style={styles.headerSubtitle}>{titleLine}</Text>
            </View>
            <View style={styles.totalBadge}>
              <Ionicons color="#ecf8ff" name="receipt-outline" size={12} />
              <Text style={styles.totalBadgeText}>{orders.length}</Text>
            </View>
          </View>

          <View style={styles.heroMetrics}>
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{bucketedOrders.length}</Text>
              <Text style={styles.heroMetricLabel}>Ditampilkan</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{pendingCount}</Text>
              <Text style={styles.heroMetricLabel}>Perlu Aksi</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{dueCount}</Text>
              <Text style={styles.heroMetricLabel}>Belum Lunas</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
        <TextInput
          onChangeText={setQueryInput}
          placeholder="Cari kode, invoice, pelanggan, atau no HP..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={queryInput}
        />
        {queryInput ? (
          <Pressable onPress={() => setQueryInput("")} style={styles.clearButton}>
            <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.filterSurface, isFilterRaised ? styles.filterSurfaceRaised : null]}>
        <ScrollView contentContainerStyle={styles.filterTabs} horizontal showsHorizontalScrollIndicator={false}>
          {ORDER_BUCKETS.map((bucket) => {
            const isActive = bucket.key === activeBucket;
            return (
              <Pressable key={bucket.key} onPress={() => handleBucketChange(bucket.key)} style={[styles.filterTab, isActive ? styles.filterTabActive : null]}>
                <Text style={[styles.filterTabText, isActive ? styles.filterTabTextActive : null]}>{bucket.label}</Text>
                <Text style={[styles.filterCount, isActive ? styles.filterCountActive : null]}>{bucketCounts[bucket.key]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listMetaRow}>
          <Text numberOfLines={1} style={styles.listMetaText}>
            {bucketedOrders.length} dari {orders.length} pesanan • {activeBucketLabel}
          </Text>
          {refreshing ? (
            <View style={styles.refreshingChip}>
              <Ionicons color={theme.colors.info} name="sync-outline" size={12} />
              <Text style={styles.refreshingText}>Memperbarui...</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Animated.View style={[styles.listAnimatedWrap, listAnimatedStyle]}>
        {loading ? (
          renderLoadingSkeleton()
        ) : (
          <FlatList
            key={`${activeBucket}:${submittedQuery}`}
            contentContainerStyle={styles.listContainer}
            data={bucketedOrders}
            keyExtractor={(item) => item.id}
            onRefresh={handleRefresh}
            onScroll={(event) => handleListScroll(event.nativeEvent.contentOffset.y)}
            refreshing={refreshing}
            renderItem={renderOrderCard}
            scrollEventThrottle={16}
            style={styles.list}
            ListEmptyComponent={
              <AppPanel style={styles.emptyPanel}>
                <Ionicons color={theme.colors.info} name="file-tray-outline" size={26} />
                <Text style={styles.emptyTitle}>Belum ada pesanan</Text>
                <Text style={styles.emptyText}>
                  {queryInput
                    ? "Data tidak ditemukan untuk kata kunci ini."
                    : `Tidak ada pesanan pada kategori ${ORDER_BUCKETS.find((item) => item.key === activeBucket)?.label ?? "-"}.`}
                </Text>
              </AppPanel>
            }
            ListHeaderComponent={
              errorMessage ? (
                <View style={styles.errorWrap}>
                  <Ionicons color={theme.colors.danger} name="warning-outline" size={16} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              hasMore ? (
                <View style={styles.footerWrap}>
                  <AppButton
                    disabled={isLoadingMore}
                    leftElement={<Ionicons color={theme.colors.info} name="chevron-down-outline" size={16} />}
                    loading={isLoadingMore}
                    onPress={handleLoadMore}
                    title={isLoadingMore ? "Memuat..." : "Muat Lebih Banyak"}
                    variant="secondary"
                  />
                </View>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isLandscape: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    screenContent: {
      flex: 1,
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    heroCard: {
      position: "relative",
      borderRadius: isTablet ? 28 : isCompactLandscape ? 20 : 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(91,174,255,0.35)" : "rgba(83,166,248,0.32)",
      minHeight: isTablet ? 164 : isCompactLandscape ? 134 : isLandscape ? 148 : 158,
      backgroundColor: "#1368bc",
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1368bc",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -40,
      bottom: 0,
      width: "70%",
      backgroundColor: "#1fa3e8",
      opacity: 0.74,
    },
    heroGlow: {
      position: "absolute",
      right: -78,
      top: -82,
      width: 210,
      height: 210,
      borderRadius: 140,
      borderWidth: 30,
      borderColor: "rgba(255,255,255,0.12)",
    },
    heroContent: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    heroHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    heroTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    headerTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 31 : isCompactLandscape ? 24 : 27,
      lineHeight: isTablet ? 37 : isCompactLandscape ? 29 : 33,
    },
    headerSubtitle: {
      color: "rgba(240,249,255,0.9)",
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 11 : 12,
      lineHeight: isCompactLandscape ? 15 : 17,
    },
    totalBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    totalBadgeText: {
      color: "#ecf8ff",
      fontFamily: theme.fonts.bold,
      fontSize: isCompactLandscape ? 10 : 11,
    },
    heroMetrics: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: "rgba(5,32,61,0.16)",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
      overflow: "hidden",
    },
    heroMetricItem: {
      flex: 1,
      paddingHorizontal: isCompactLandscape ? 8 : 10,
      paddingVertical: isCompactLandscape ? 6 : 8,
      alignItems: "center",
      gap: 1,
    },
    heroMetricValue: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 20 : isCompactLandscape ? 16 : 18,
      lineHeight: isTablet ? 25 : isCompactLandscape ? 20 : 22,
    },
    heroMetricLabel: {
      color: "rgba(228,244,255,0.9)",
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 9 : 10,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    heroDivider: {
      width: 1,
      backgroundColor: "rgba(255,255,255,0.2)",
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      paddingLeft: 11,
      paddingRight: 8,
      minHeight: isCompactLandscape ? 42 : 46,
      gap: 4,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 12 : 13,
      paddingHorizontal: 6,
      paddingVertical: isCompactLandscape ? 9 : 11,
    },
    clearButton: {
      width: isCompactLandscape ? 24 : 26,
      height: isCompactLandscape ? 24 : 26,
      borderRadius: isCompactLandscape ? 12 : 13,
      alignItems: "center",
      justifyContent: "center",
    },
    filterSurface: {
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isCompactLandscape ? 7 : 8,
      paddingTop: isCompactLandscape ? 5 : 6,
      paddingBottom: isCompactLandscape ? 7 : 8,
      gap: isCompactLandscape ? 4 : 6,
    },
    filterSurfaceRaised: {
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.24 : 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
      borderColor: theme.colors.borderStrong,
    },
    filterTabs: {
      flexDirection: "row",
      gap: isCompactLandscape ? 6 : 8,
      paddingRight: theme.spacing.md,
      paddingBottom: 2,
    },
    filterTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: isCompactLandscape ? 5 : 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.pill,
      paddingHorizontal: isCompactLandscape ? 10 : 12,
      paddingVertical: isTablet ? 10 : isCompactLandscape ? 7 : 8,
    },
    filterTabActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    filterTabText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 11 : 12,
    },
    filterTabTextActive: {
      color: theme.colors.info,
    },
    filterCount: {
      minWidth: isCompactLandscape ? 18 : 20,
      paddingHorizontal: isCompactLandscape ? 4 : 5,
      paddingVertical: 2,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      color: theme.colors.textMuted,
      textAlign: "center",
      fontFamily: theme.fonts.bold,
      fontSize: isCompactLandscape ? 10 : 11,
    },
    filterCountActive: {
      color: theme.colors.primaryContrast,
      backgroundColor: theme.colors.info,
    },
    listMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
      minHeight: isCompactLandscape ? 18 : 20,
      flexWrap: isCompactLandscape ? "wrap" : "nowrap",
    },
    listMetaText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 10.5 : 11,
      lineHeight: isCompactLandscape ? 14 : 15,
    },
    refreshingChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: isCompactLandscape ? 7 : 8,
      paddingVertical: isCompactLandscape ? 2 : 3,
    },
    refreshingText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 9.5 : 10,
    },
    skeletonWrap: {
      flex: 1,
      paddingTop: 4,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    skeletonCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.md : theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isCompactLandscape ? 12 : theme.spacing.md,
      paddingVertical: isCompactLandscape ? 10 : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    skeletonMetrics: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    listAnimatedWrap: {
      flex: 1,
    },
    list: {
      flex: 1,
    },
    listContainer: {
      paddingTop: 2,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
      flexGrow: 1,
    },
    orderCard: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.md : theme.radii.lg,
      backgroundColor: theme.colors.surface,
      overflow: "hidden",
      minHeight: isCompactLandscape ? 136 : 150,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.08,
      shadowRadius: isCompactLandscape ? 6 : 8,
      shadowOffset: { width: 0, height: isCompactLandscape ? 2 : 3 },
      elevation: isCompactLandscape ? 1 : 2,
    },
    orderCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.995 }],
    },
    orderAccent: {
      width: 4,
    },
    orderContent: {
      flex: 1,
      paddingHorizontal: isCompactLandscape ? 10 : theme.spacing.md,
      paddingVertical: isCompactLandscape ? 8 : theme.spacing.sm,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    orderTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    orderTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: isCompactLandscape ? 3 : 4,
    },
    orderTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : isCompactLandscape ? 14 : 15,
      lineHeight: isTablet ? 22 : isCompactLandscape ? 18 : 20,
    },
    orderCode: {
      color: theme.mode === "dark" ? "#a9c6df" : theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10 : 10.5,
      lineHeight: isCompactLandscape ? 13 : 14,
    },
    customerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    orderCustomer: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 11 : 12,
      lineHeight: isCompactLandscape ? 15 : 17,
    },
    metricsRow: {
      flexDirection: "row",
      gap: isCompactLandscape ? 5 : 7,
    },
    metricCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.sm : theme.radii.md,
      paddingHorizontal: isCompactLandscape ? 6 : 8,
      paddingVertical: isCompactLandscape ? 6 : 7,
      backgroundColor: theme.colors.surfaceSoft,
      gap: 1,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 9 : 10,
      textTransform: "uppercase",
      letterSpacing: 0.35,
    },
    metricValue: {
      color: theme.mode === "dark" ? "#edf6ff" : theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10.5 : 11,
      lineHeight: isCompactLandscape ? 14 : 16,
    },
    metricDue: {
      color: theme.mode === "dark" ? "#ffc86a" : theme.colors.warning,
    },
    metricPaid: {
      color: theme.mode === "dark" ? "#61df9f" : theme.colors.success,
    },
    orderBottom: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: isCompactLandscape ? 4 : theme.spacing.xs,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: isCompactLandscape ? 4 : 5,
      flex: 1,
      minWidth: 0,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    timePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginLeft: isCompactLandscape ? 4 : theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(169,198,223,0.38)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : theme.colors.surfaceSoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: isCompactLandscape ? 6 : 7,
      paddingVertical: isCompactLandscape ? 2 : 3,
    },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      gap: isCompactLandscape ? 3 : 4,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: isCompactLandscape ? 7 : 8,
      paddingVertical: isCompactLandscape ? 3 : 4,
    },
    tagCompact: {
      maxWidth: "49%",
    },
    tagNeutral: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderStrong,
    },
    tagInfo: {
      backgroundColor: theme.mode === "dark" ? "rgba(112,177,255,0.2)" : "rgba(42,124,226,0.12)",
      borderColor: theme.mode === "dark" ? "rgba(112,177,255,0.48)" : "rgba(42,124,226,0.3)",
    },
    tagWarning: {
      backgroundColor: theme.mode === "dark" ? "rgba(241,173,58,0.16)" : "rgba(221,140,16,0.1)",
      borderColor: theme.mode === "dark" ? "rgba(241,173,58,0.44)" : "rgba(221,140,16,0.32)",
    },
    tagSuccess: {
      backgroundColor: theme.mode === "dark" ? "rgba(56,211,133,0.14)" : "rgba(31,158,99,0.1)",
      borderColor: theme.mode === "dark" ? "rgba(56,211,133,0.44)" : "rgba(31,158,99,0.3)",
    },
    tagText: {
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 9.5 : 10,
    },
    tagTextNeutral: {
      color: theme.mode === "dark" ? "#afcbe3" : theme.colors.textMuted,
    },
    tagTextInfo: {
      color: theme.colors.info,
    },
    tagTextWarning: {
      color: theme.colors.warning,
    },
    tagTextSuccess: {
      color: theme.colors.success,
    },
    orderTime: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 10 : 10.5,
      lineHeight: isCompactLandscape ? 13 : 14,
      textAlign: "right",
    },
    emptyPanel: {
      marginTop: theme.spacing.md,
      alignItems: "center",
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    footerWrap: {
      marginTop: theme.spacing.xs,
    },
    errorWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      marginBottom: 8,
      borderWidth: 1,
      borderRadius: theme.radii.md,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
