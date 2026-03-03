import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ActivityIndicator, Animated, Easing, NativeModules, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, UIManager, View, useWindowDimensions } from "react-native";
import { captureRef } from "react-native-view-shot";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { listBillingEntries } from "../../features/billing/billingApi";
import { countOrdersByBucket, type OrderBucket } from "../../features/orders/orderBuckets";
import { listOrders } from "../../features/orders/orderApi";
import { canManageFinance } from "../../lib/accessControl";
import { formatDateLabel, formatTimeLabel, toDateToken } from "../../lib/dateTime";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { BillingEntriesSummary } from "../../types/billing";
import type { OrderSummary } from "../../types/order";

type Navigation = BottomTabNavigationProp<AppTabParamList, "ReportsTab">;
type ReportRangeKey = "today" | "7d" | "30d" | "custom";
type TrendMetricKey = "orders" | "amount";

interface RangeMeta {
  key: ReportRangeKey;
  label: string;
  subtitle: string;
  startDateToken: string;
  endDateToken: string;
  displayLabel: string;
  singleDateToken?: string;
}

interface TopCustomerInsight {
  key: string;
  name: string;
  ordersCount: number;
  totalAmount: number;
}

interface TrendPoint {
  key: string;
  label: string;
  count: number;
  amount: number;
}

const REPORT_PAGE_SIZE = 100;
const REPORT_RANGES: Array<{ key: ReportRangeKey; label: string; subtitle: string }> = [
  { key: "today", label: "Hari Ini", subtitle: "Operasional hari berjalan" },
  { key: "7d", label: "7 Hari", subtitle: "Performa mingguan" },
  { key: "30d", label: "30 Hari", subtitle: "Tren terbaru outlet" },
  { key: "custom", label: "Custom", subtitle: "Rentang manual" },
];

function isValidDateToken(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function countPaidOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.due_amount <= 0).length;
}

function countUnpaidOrders(orders: OrderSummary[]): number {
  return orders.filter((order) => order.due_amount > 0).length;
}

const currencyFormatter = new Intl.NumberFormat("id-ID");
const compactFormatter = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(value, 0))}`;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return compactFormatter.format(Math.max(value, 0));
}

function formatCompactMoney(value: number): string {
  return `Rp ${formatCompact(value)}`;
}

function getUpdatedLabel(date: Date | null, timeZone?: string): string {
  if (!date) {
    return "-";
  }

  return formatTimeLabel(date, timeZone);
}

function formatRangeDate(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
    }).format(date);
  }
}

function buildRangeMeta(rangeKey: ReportRangeKey, timeZone?: string, customRange?: { startDateToken: string; endDateToken: string }): RangeMeta {
  const config = REPORT_RANGES.find((item) => item.key === rangeKey) ?? REPORT_RANGES[0];
  if (rangeKey === "custom" && customRange) {
    const startToken = customRange.startDateToken;
    const endToken = customRange.endDateToken;

    return {
      key: rangeKey,
      label: config.label,
      subtitle: config.subtitle,
      startDateToken: startToken,
      endDateToken: endToken,
      displayLabel:
        startToken === endToken
          ? formatRangeDate(parseDateToken(startToken), timeZone)
          : `${formatRangeDate(parseDateToken(startToken), timeZone)} - ${formatRangeDate(parseDateToken(endToken), timeZone)}`,
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate);

  if (rangeKey === "7d") {
    startDate.setDate(startDate.getDate() - 6);
  } else if (rangeKey === "30d") {
    startDate.setDate(startDate.getDate() - 29);
  }

  const startDateToken = toDateToken(startDate, timeZone);
  const endDateToken = toDateToken(endDate, timeZone);

  return {
    key: rangeKey,
    label: config.label,
    subtitle: config.subtitle,
    startDateToken,
    endDateToken,
    displayLabel:
      rangeKey === "today"
        ? formatDateLabel(endDate, timeZone)
        : `${formatRangeDate(startDate, timeZone)} - ${formatRangeDate(endDate, timeZone)}`,
    singleDateToken: rangeKey === "today" ? endDateToken : undefined,
  };
}

function getDominantBucket(bucketCounts: Record<OrderBucket, number>): { label: string; count: number } | null {
  const entries = [
    { label: "Antrian", count: bucketCounts.antrian },
    { label: "Proses", count: bucketCounts.proses },
    { label: "Siap Ambil", count: bucketCounts.siap_ambil },
    { label: "Siap Antar", count: bucketCounts.siap_antar },
    { label: "Selesai", count: bucketCounts.selesai },
  ].sort((left, right) => right.count - left.count);

  return entries[0]?.count ? entries[0] : null;
}

function getTopCustomers(orders: OrderSummary[]): TopCustomerInsight[] {
  const stats = new Map<string, TopCustomerInsight>();

  for (const order of orders) {
    const customerName = order.customer?.name?.trim();
    if (!customerName) {
      continue;
    }

    const key = customerName.toLowerCase();
    const current = stats.get(key);

    if (current) {
      current.ordersCount += 1;
      current.totalAmount += Math.max(order.total_amount, 0);
      continue;
    }

    stats.set(key, {
      key,
      name: customerName,
      ordersCount: 1,
      totalAmount: Math.max(order.total_amount, 0),
    });
  }

  return Array.from(stats.values())
    .sort((left, right) => {
      if (right.ordersCount !== left.ordersCount) {
        return right.ordersCount - left.ordersCount;
      }

      return right.totalAmount - left.totalAmount;
    })
    .slice(0, 3);
}

function parseDateToken(token: string): Date {
  const [yearRaw, monthRaw, dayRaw] = token.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function listDateTokens(startToken: string, endToken: string): string[] {
  const start = parseDateToken(startToken);
  const end = parseDateToken(endToken);
  const tokens: string[] = [];

  let cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    tokens.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return tokens;
}

function getHourInTimezone(date: Date, timeZone?: string): number {
  try {
    return Number.parseInt(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      }).format(date),
      10
    );
  } catch {
    return date.getHours();
  }
}

function formatWeekdayDay(token: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "short",
      day: "2-digit",
      timeZone,
    })
      .format(parseDateToken(token))
      .replace(".", "");
  } catch {
    return token;
  }
}

function formatDayOnly(token: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      timeZone,
    }).format(parseDateToken(token));
  } catch {
    return token;
  }
}

function formatTrendRangeLabel(startToken: string, endToken: string, timeZone?: string): string {
  if (startToken === endToken) {
    return formatRangeDate(parseDateToken(startToken), timeZone);
  }

  return `${formatDayOnly(startToken, timeZone)}-${formatRangeDate(parseDateToken(endToken), timeZone)}`;
}

function buildTrendPoints(orders: OrderSummary[], rangeMeta: RangeMeta, timeZone?: string): TrendPoint[] {
  if (rangeMeta.key === "today") {
    const segments = [
      { key: "00-03", label: "00", startHour: 0, endHour: 3 },
      { key: "04-07", label: "04", startHour: 4, endHour: 7 },
      { key: "08-11", label: "08", startHour: 8, endHour: 11 },
      { key: "12-15", label: "12", startHour: 12, endHour: 15 },
      { key: "16-19", label: "16", startHour: 16, endHour: 19 },
      { key: "20-23", label: "20", startHour: 20, endHour: 23 },
    ].map((segment) => ({
      ...segment,
      count: 0,
      amount: 0,
    }));

    for (const order of orders) {
      const hour = getHourInTimezone(new Date(order.created_at), timeZone);
      const segmentIndex = Math.min(Math.floor(hour / 4), segments.length - 1);
      const segment = segments[segmentIndex];

      if (!segment) {
        continue;
      }

      segment.count += 1;
      segment.amount += Math.max(order.total_amount, 0);
    }

    return segments.map(({ key, label, count, amount }) => ({
      key,
      label,
      count,
      amount,
    }));
  }

  const tokens = listDateTokens(rangeMeta.startDateToken, rangeMeta.endDateToken);
  const dailyMap = new Map<string, TrendPoint>(
    tokens.map((token) => [
      token,
      {
        key: token,
        label: formatWeekdayDay(token, timeZone),
        count: 0,
        amount: 0,
      },
    ])
  );

  for (const order of orders) {
    const token = toDateToken(new Date(order.created_at), timeZone);
    const point = dailyMap.get(token);
    if (!point) {
      continue;
    }

    point.count += 1;
    point.amount += Math.max(order.total_amount, 0);
  }

  if (rangeMeta.key === "7d") {
    return tokens.map((token) => dailyMap.get(token) ?? { key: token, label: token, count: 0, amount: 0 });
  }

  const groupedPoints: TrendPoint[] = [];
  const chunkSize = 5;

  for (let index = 0; index < tokens.length; index += chunkSize) {
    const chunk = tokens.slice(index, index + chunkSize);
    const count = chunk.reduce((total, token) => total + (dailyMap.get(token)?.count ?? 0), 0);
    const amount = chunk.reduce((total, token) => total + (dailyMap.get(token)?.amount ?? 0), 0);
    const startToken = chunk[0] ?? tokens[0];
    const endToken = chunk[chunk.length - 1] ?? startToken;

    groupedPoints.push({
      key: `${startToken}:${endToken}`,
      label: formatTrendRangeLabel(startToken, endToken, timeZone),
      count,
      amount,
    });
  }

  return groupedPoints;
}

export function ReportsScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const { selectedOutlet, session } = useSession();
  const outletId = selectedOutlet?.id;
  const outletTimezone = selectedOutlet?.timezone;
  const todayToken = useMemo(() => toDateToken(new Date(), outletTimezone), [outletTimezone]);
  const canViewFinance = canManageFinance(session?.roles ?? []);
  const [activeRange, setActiveRange] = useState<ReportRangeKey>("today");
  const [activeTrendMetric, setActiveTrendMetric] = useState<TrendMetricKey>("orders");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [financeSummary, setFinanceSummary] = useState<BillingEntriesSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [customDateFromInput, setCustomDateFromInput] = useState(todayToken);
  const [customDateToInput, setCustomDateToInput] = useState(todayToken);
  const [appliedCustomDateFrom, setAppliedCustomDateFrom] = useState(todayToken);
  const [appliedCustomDateTo, setAppliedCustomDateTo] = useState(todayToken);
  const [datePickerTarget, setDatePickerTarget] = useState<"from" | "to" | null>(null);
  const [pickerDraftDate, setPickerDraftDate] = useState<Date>(() => parseDateToken(todayToken));
  const firstFocusHandledRef = useRef(false);
  const reportCaptureRef = useRef<View | null>(null);
  const chartTransition = useRef(new Animated.Value(1)).current;
  const firstTrendMetricHandledRef = useRef(false);
  const rangeMeta = useMemo(
    () =>
      buildRangeMeta(activeRange, outletTimezone, {
        startDateToken: appliedCustomDateFrom,
        endDateToken: appliedCustomDateTo,
      }),
    [activeRange, appliedCustomDateFrom, appliedCustomDateTo, outletTimezone]
  );

  useEffect(() => {
    setCustomDateFromInput(todayToken);
    setCustomDateToInput(todayToken);
    setAppliedCustomDateFrom(todayToken);
    setAppliedCustomDateTo(todayToken);
  }, [todayToken]);

  useEffect(() => {
    if (!firstTrendMetricHandledRef.current) {
      firstTrendMetricHandledRef.current = true;
      return;
    }

    chartTransition.stopAnimation();
    chartTransition.setValue(0.92);
    Animated.timing(chartTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTrendMetric, chartTransition]);

  const loadData = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (!outletId) {
        setOrders([]);
        setFinanceSummary(null);
        setLoading(false);
        setRefreshing(false);
        setLastUpdatedAt(null);
        return;
      }

      if (forceRefresh && !loading) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const [ordersResult, financeResult] = await Promise.all([
          listOrders({
            outletId,
            limit: REPORT_PAGE_SIZE,
            fetchAll: true,
            timezone: outletTimezone,
            forceRefresh,
            date: rangeMeta.singleDateToken,
            dateFrom: rangeMeta.singleDateToken ? undefined : rangeMeta.startDateToken,
            dateTo: rangeMeta.singleDateToken ? undefined : rangeMeta.endDateToken,
          }),
          canViewFinance
            ? listBillingEntries({
                outletId,
                startDate: rangeMeta.startDateToken,
                endDate: rangeMeta.endDateToken,
                limit: 20,
              })
            : Promise.resolve(null),
        ]);

        setOrders(ordersResult);
        setFinanceSummary(financeResult?.summary ?? null);
        setLastUpdatedAt(new Date());
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canViewFinance, loading, outletId, outletTimezone, rangeMeta.endDateToken, rangeMeta.singleDateToken, rangeMeta.startDateToken]
  );

  useEffect(() => {
    firstFocusHandledRef.current = false;
    void loadData(true);
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (!outletId) {
        return;
      }

      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }

      void loadData(true);
    }, [loadData, outletId])
  );

  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const paidOrders = countPaidOrders(orders);
    const unpaidOrders = countUnpaidOrders(orders);
    const pickupOrders = orders.filter((order) => order.is_pickup_delivery).length;
    const totalSales = orders.reduce((total, order) => total + Math.max(order.total_amount, 0), 0);
    const dueAmount = orders.reduce((total, order) => total + Math.max(order.due_amount, 0), 0);
    const averageTicket = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    const paidRate = totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0;

    return {
      totalOrders,
      paidOrders,
      unpaidOrders,
      pickupOrders,
      totalSales,
      dueAmount,
      averageTicket,
      paidRate,
      unpaidRate: Math.max(100 - paidRate, 0),
    };
  }, [orders]);

  const bucketCounts = useMemo(() => countOrdersByBucket(orders), [orders]);
  const dominantBucket = useMemo(() => getDominantBucket(bucketCounts), [bucketCounts]);
  const topCustomers = useMemo(() => getTopCustomers(orders), [orders]);
  const trendPoints = useMemo(() => buildTrendPoints(orders, rangeMeta, outletTimezone), [orders, outletTimezone, rangeMeta]);
  const trendPeak = useMemo(
    () => trendPoints.reduce<TrendPoint | null>((current, point) => (!current || point.count > current.count ? point : current), null),
    [trendPoints]
  );
  const salesTrendPeak = useMemo(
    () => trendPoints.reduce<TrendPoint | null>((current, point) => (!current || point.amount > current.amount ? point : current), null),
    [trendPoints]
  );
  const averageOrdersPerPoint = useMemo(
    () => (trendPoints.length > 0 ? Math.round(trendPoints.reduce((total, point) => total + point.count, 0) / trendPoints.length) : 0),
    [trendPoints]
  );
  const averageSalesPerPoint = useMemo(
    () => (trendPoints.length > 0 ? Math.round(trendPoints.reduce((total, point) => total + point.amount, 0) / trendPoints.length) : 0),
    [trendPoints]
  );
  const activeTrendPeak = activeTrendMetric === "amount" ? salesTrendPeak : trendPeak;
  const activeTrendColor = activeTrendMetric === "amount" ? theme.colors.success : theme.colors.info;
  const distributionData = useMemo(
    () => [
      { key: "antrian", label: "Antrian", count: bucketCounts.antrian, color: theme.colors.warning },
      { key: "proses", label: "Proses", count: bucketCounts.proses, color: theme.colors.info },
      { key: "siap_ambil", label: "Siap Ambil", count: bucketCounts.siap_ambil, color: theme.colors.success },
      { key: "siap_antar", label: "Siap Antar", count: bucketCounts.siap_antar, color: theme.mode === "dark" ? "#8ec5ff" : "#4b9cff" },
      { key: "selesai", label: "Selesai", count: bucketCounts.selesai, color: theme.mode === "dark" ? "#d7eaff" : "#1450a3" },
    ].map((item) => ({
      ...item,
      percent: summary.totalOrders > 0 ? Math.round((item.count / summary.totalOrders) * 100) : 0,
    })),
    [bucketCounts.antrian, bucketCounts.proses, bucketCounts.selesai, bucketCounts.siap_ambil, bucketCounts.siap_antar, summary.totalOrders, theme.colors.info, theme.colors.success, theme.colors.warning, theme.mode]
  );
  const refreshControl = useMemo(
    () => <RefreshControl onRefresh={() => void loadData(true)} refreshing={refreshing} tintColor={theme.colors.info} />,
    [loadData, refreshing, theme.colors.info]
  );
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Pilih outlet untuk lihat laporan";
  const updatedLabel = getUpdatedLabel(lastUpdatedAt, outletTimezone);
  const quotaRemaining = session?.quota.orders_remaining ?? null;
  const quotaLabel = quotaRemaining === null ? "Tanpa Batas" : `${formatCompact(quotaRemaining)} sisa`;
  const hasNativeDatePicker = useMemo(() => {
    const nativeDatePickerModule =
      (NativeModules as Record<string, unknown>).RNCDatePicker ??
      (NativeModules as Record<string, unknown>).RNDateTimePicker ??
      null;
    const nativeDatePickerView =
      UIManager.getViewManagerConfig?.("RNDateTimePicker") ??
      UIManager.getViewManagerConfig?.("RNCDatePicker") ??
      null;

    return Boolean(nativeDatePickerModule || nativeDatePickerView);
  }, []);
  const canApplyCustomRange = isValidDateToken(customDateFromInput) && isValidDateToken(customDateToInput);
  const chartAnimatedStyle = useMemo(
    () => ({
      opacity: chartTransition,
      transform: [
        {
          translateY: chartTransition.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [chartTransition]
  );

  const applyPickedDate = useCallback(
    (target: "from" | "to", nextDate: Date) => {
      const nextToken = toDateToken(nextDate, outletTimezone);
      if (target === "from") {
        setCustomDateFromInput(nextToken);
        return;
      }

      setCustomDateToInput(nextToken);
    },
    [outletTimezone]
  );

  const handleInlinePickerChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setDatePickerTarget(null);
      return;
    }

    if (selectedDate) {
      setPickerDraftDate(selectedDate);
    }
  }, []);

  const handleConfirmInlinePicker = useCallback(() => {
    if (!datePickerTarget) {
      return;
    }

    applyPickedDate(datePickerTarget, pickerDraftDate);
    setDatePickerTarget(null);
  }, [applyPickedDate, datePickerTarget, pickerDraftDate]);

  const openNativeDatePicker = useCallback(
    (target: "from" | "to") => {
      const sourceToken = target === "from" ? customDateFromInput : customDateToInput;
      const sourceDate = parseDateToken(sourceToken);
      const minimumDate = target === "to" && isValidDateToken(customDateFromInput) ? parseDateToken(customDateFromInput) : undefined;
      const maximumDate = target === "from" && isValidDateToken(customDateToInput) ? parseDateToken(customDateToInput) : undefined;

      setErrorMessage(null);
      setActionMessage(null);

      if (!hasNativeDatePicker) {
        setErrorMessage("Date picker native belum tersedia di build ini. Gunakan input tanggal manual atau build ulang aplikasi.");
        return;
      }

      if (Platform.OS === "android") {
        DateTimePickerAndroid.open({
          value: sourceDate,
          mode: "date",
          is24Hour: true,
          minimumDate,
          maximumDate,
          onChange: (event, selectedDate) => {
            if (event.type !== "set" || !selectedDate) {
              return;
            }

            applyPickedDate(target, selectedDate);
          },
        });
        return;
      }

      setPickerDraftDate(sourceDate);
      setDatePickerTarget(target);
    },
    [applyPickedDate, customDateFromInput, customDateToInput]
  );

  const handleApplyCustomRange = useCallback(() => {
    const nextFrom = customDateFromInput.trim();
    const nextTo = customDateToInput.trim();

    if (!isValidDateToken(nextFrom) || !isValidDateToken(nextTo)) {
      setErrorMessage("Format tanggal custom harus YYYY-MM-DD.");
      return;
    }

    if (nextFrom > nextTo) {
      setErrorMessage("Tanggal awal custom tidak boleh melebihi tanggal akhir.");
      return;
    }

    setErrorMessage(null);
    setActionMessage(null);
    setAppliedCustomDateFrom(nextFrom);
    setAppliedCustomDateTo(nextTo);
    setActiveRange("custom");
  }, [customDateFromInput, customDateToInput]);

  const handleExportReport = useCallback(async (): Promise<void> => {
    try {
      setExportingImage(true);
      setErrorMessage(null);
      setActionMessage(null);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 140);
      });

      if (!reportCaptureRef.current) {
        setErrorMessage("Laporan belum siap dibagikan. Coba beberapa detik lagi.");
        return;
      }

      const imageUri = await captureRef(reportCaptureRef.current, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const shareTitle = `Laporan Outlet ${selectedOutlet?.code ?? "-"}`;
      const shareMessage = `${shareTitle}\n${rangeMeta.displayLabel}`;

      await Share.share(
        {
          title: shareTitle,
          message: shareMessage,
          url: imageUri,
        },
        {
          dialogTitle: "Bagikan Laporan Outlet",
          subject: shareTitle,
        }
      );

      setActionMessage("Gambar laporan berhasil dibuat. Pilih aplikasi tujuan untuk membagikannya.");
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal menyiapkan gambar laporan.";
      setErrorMessage(message);
    } finally {
      setExportingImage(false);
    }
  }, [rangeMeta.displayLabel, selectedOutlet?.code]);

  return (
    <AppScreen contentContainerStyle={styles.content} refreshControl={refreshControl} scroll>
      <View collapsable={false} ref={reportCaptureRef} style={styles.captureWrap}>
        <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="analytics-outline" size={16} />
            <Text style={styles.heroBadgeText}>Laporan Ringkas</Text>
          </View>
          <Text style={styles.heroMeta}>Update {updatedLabel}</Text>
        </View>
        <Text style={styles.title}>Ringkasan Kinerja Outlet</Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {outletLabel}
        </Text>
        <View style={styles.filterRow}>
          {REPORT_RANGES.map((item) => {
            const active = item.key === activeRange;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setActiveRange(item.key);
                  if (item.key !== "custom") {
                    setDatePickerTarget(null);
                  }
                }}
                style={({ pressed }) => [styles.filterChip, active ? styles.filterChipActive : null, pressed ? styles.filterChipPressed : null]}
              >
                <Text style={[styles.filterChipLabel, active ? styles.filterChipLabelActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.rangeMetaText}>
          {rangeMeta.displayLabel} • seluruh transaksi pada periode ini
        </Text>
        {activeRange === "custom" ? (
          <View style={styles.customRangePanel}>
            <Text style={styles.customRangeLabel}>Rentang custom</Text>
            {hasNativeDatePicker ? (
              <View style={styles.customRangeRow}>
                <Pressable onPress={() => openNativeDatePicker("from")} style={({ pressed }) => [styles.customDateInputWrap, pressed ? styles.customDateInputPressed : null]}>
                  <Text style={styles.customDatePrefix}>Dari</Text>
                  <Text style={styles.customDateValue}>{formatRangeDate(parseDateToken(customDateFromInput), outletTimezone)}</Text>
                  <Ionicons color={theme.colors.textMuted} name="calendar-outline" size={16} />
                </Pressable>
                <Pressable onPress={() => openNativeDatePicker("to")} style={({ pressed }) => [styles.customDateInputWrap, pressed ? styles.customDateInputPressed : null]}>
                  <Text style={styles.customDatePrefix}>Sampai</Text>
                  <Text style={styles.customDateValue}>{formatRangeDate(parseDateToken(customDateToInput), outletTimezone)}</Text>
                  <Ionicons color={theme.colors.textMuted} name="calendar-outline" size={16} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.customRangeRow}>
                <View style={styles.customDateInputWrap}>
                  <Text style={styles.customDatePrefix}>Dari</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    onChangeText={setCustomDateFromInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.customDateInput}
                    value={customDateFromInput}
                  />
                </View>
                <View style={styles.customDateInputWrap}>
                  <Text style={styles.customDatePrefix}>Sampai</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    onChangeText={setCustomDateToInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.customDateInput}
                    value={customDateToInput}
                  />
                </View>
              </View>
            )}
            <View style={styles.customRangeActionRow}>
              <AppButton disabled={!canApplyCustomRange} onPress={handleApplyCustomRange} title="Terapkan Range" variant="secondary" />
            </View>
            {!hasNativeDatePicker ? <Text style={styles.noteText}>Build yang terpasang belum memuat native date picker. Format manual tetap `YYYY-MM-DD`.</Text> : null}
            {hasNativeDatePicker && Platform.OS === "ios" && datePickerTarget ? (
              <View style={styles.inlinePickerCard}>
                <Text style={styles.inlinePickerTitle}>{datePickerTarget === "from" ? "Pilih tanggal mulai" : "Pilih tanggal akhir"}</Text>
                <DateTimePicker
                  display="spinner"
                  mode="date"
                  onChange={handleInlinePickerChange}
                  value={pickerDraftDate}
                />
                <View style={styles.inlinePickerActions}>
                  <AppButton onPress={() => setDatePickerTarget(null)} title="Tutup" variant="ghost" />
                  <AppButton onPress={handleConfirmInlinePicker} title="Pakai Tanggal" variant="secondary" />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        </AppPanel>

      <AppPanel style={styles.summaryPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Snapshot Operasional</Text>
          <Text style={styles.sectionMeta}>{rangeMeta.subtitle}</Text>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.loadingText}>Memuat seluruh data laporan...</Text>
          </View>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <View style={styles.metricItem}>
                <Ionicons color={theme.colors.info} name="receipt-outline" size={16} />
                <Text style={styles.metricValue}>{formatCompact(summary.totalOrders)}</Text>
                <Text style={styles.metricLabel}>Total Order</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons color={theme.colors.success} name="checkmark-done-outline" size={16} />
                <Text style={styles.metricValue}>{formatCompact(summary.paidOrders)}</Text>
                <Text style={styles.metricLabel}>Lunas</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons color={theme.colors.warning} name="time-outline" size={16} />
                <Text style={styles.metricValue}>{formatCompact(summary.unpaidOrders)}</Text>
                <Text style={styles.metricLabel}>Belum Lunas</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons color={theme.colors.info} name="wallet-outline" size={16} />
                <Text style={styles.metricValue}>{formatCompact(summary.averageTicket)}</Text>
                <Text style={styles.metricLabel}>Avg Ticket</Text>
              </View>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaCard}>
                <Text style={styles.metaCardLabel}>Penjualan</Text>
                <Text style={styles.metaCardValue}>{formatMoney(summary.totalSales)}</Text>
                <Text style={styles.metaCardCaption}>Piutang {formatMoney(summary.dueAmount)}</Text>
              </View>
              <View style={styles.metaCard}>
                <Text style={styles.metaCardLabel}>Pickup & Delivery</Text>
                <Text style={styles.metaCardValue}>{formatCompact(summary.pickupOrders)}</Text>
                <Text style={styles.metaCardCaption}>Order pickup antar aktif</Text>
              </View>
              <View style={styles.metaCard}>
                <Text style={styles.metaCardLabel}>Pembayaran</Text>
                <Text style={styles.metaCardValue}>{summary.paidRate}%</Text>
                <Text style={styles.metaCardCaption}>Tingkat order lunas</Text>
              </View>
              <View style={styles.metaCard}>
                <Text style={styles.metaCardLabel}>Sisa Kuota</Text>
                <Text style={styles.metaCardValue}>{quotaLabel}</Text>
                <Text style={styles.metaCardCaption}>{session?.quota.period ?? "-"}</Text>
              </View>
            </View>
          </>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </AppPanel>

      {!loading ? (
        <AppPanel style={styles.trendPanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Tren Transaksi</Text>
            <Text style={styles.sectionMeta}>{rangeMeta.label}</Text>
          </View>
          {trendPoints.length > 0 ? (
            <>
              <View style={styles.chartSummaryRow}>
                <View style={styles.chartSummaryItem}>
                  <Text style={styles.chartSummaryLabel}>Puncak</Text>
                  <Text style={styles.chartSummaryValue}>
                    {activeTrendMetric === "amount" ? formatCompactMoney(activeTrendPeak?.amount ?? 0) : `${activeTrendPeak?.count ?? 0} order`}
                  </Text>
                  <Text style={styles.chartSummaryCaption}>{activeTrendPeak?.label ?? "-"}</Text>
                </View>
                <View style={styles.chartSummaryItem}>
                  <Text style={styles.chartSummaryLabel}>Rata-rata</Text>
                  <Text style={styles.chartSummaryValue}>{activeTrendMetric === "amount" ? formatCompactMoney(averageSalesPerPoint) : `${averageOrdersPerPoint} order`}</Text>
                  <Text style={styles.chartSummaryCaption}>per titik chart</Text>
                </View>
                <View style={styles.chartSummaryItem}>
                  <Text style={styles.chartSummaryLabel}>Total Order</Text>
                  <Text style={styles.chartSummaryValue}>{summary.totalOrders}</Text>
                  <Text style={styles.chartSummaryCaption}>transaksi pada periode ini</Text>
                </View>
                <View style={styles.chartSummaryItem}>
                  <Text style={styles.chartSummaryLabel}>Total Penjualan</Text>
                  <Text style={styles.chartSummaryValue}>{formatCompactMoney(summary.totalSales)}</Text>
                  <Text style={styles.chartSummaryCaption}>{summary.totalOrders} transaksi</Text>
                </View>
              </View>

              <Animated.View style={[styles.chartGroup, chartAnimatedStyle]}>
                <View style={styles.chartMetricRow}>
                  <Pressable
                    onPress={() => setActiveTrendMetric("orders")}
                    style={({ pressed }) => [
                      styles.chartMetricChip,
                      activeTrendMetric === "orders" ? styles.chartMetricChipActive : null,
                      pressed ? styles.chartMetricChipPressed : null,
                    ]}
                  >
                    <Text style={[styles.chartMetricChipLabel, activeTrendMetric === "orders" ? styles.chartMetricChipLabelActive : null]}>Order</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTrendMetric("amount")}
                    style={({ pressed }) => [
                      styles.chartMetricChip,
                      activeTrendMetric === "amount" ? styles.chartMetricChipActive : null,
                      pressed ? styles.chartMetricChipPressed : null,
                    ]}
                  >
                    <Text style={[styles.chartMetricChipLabel, activeTrendMetric === "amount" ? styles.chartMetricChipLabelActive : null]}>Nominal</Text>
                  </Pressable>
                </View>
                <Text style={styles.chartGroupTitle}>{activeTrendMetric === "amount" ? "Nilai Penjualan" : "Volume Order"}</Text>
                <Text style={styles.chartGroupMeta}>
                  {activeTrendMetric === "amount" ? "Nominal omzet per titik periode" : "Jumlah transaksi per titik periode"}
                </Text>
                <View style={styles.barChartRow}>
                  {trendPoints.map((point) => {
                    const currentValue = activeTrendMetric === "amount" ? point.amount : point.count;
                    const maxValue = Math.max(activeTrendMetric === "amount" ? salesTrendPeak?.amount ?? 0 : trendPeak?.count ?? 0, 1);
                    const barHeight = currentValue > 0 ? Math.max((currentValue / maxValue) * 100, 14) : 4;
                    const isPeak = point.key === activeTrendPeak?.key && currentValue > 0;

                    return (
                      <View key={`${point.key}:${activeTrendMetric}`} style={styles.barColumn}>
                        <Text
                          style={[
                            styles.barValueText,
                            isPeak ? (activeTrendMetric === "amount" ? styles.barValueMoneyActive : styles.barValueTextActive) : null,
                          ]}
                        >
                          {activeTrendMetric === "amount" ? formatCompactMoney(point.amount) : point.count}
                        </Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: `${barHeight}%`,
                                backgroundColor:
                                  isPeak
                                    ? activeTrendColor
                                    : activeTrendMetric === "amount"
                                      ? theme.mode === "dark"
                                        ? "#4d8367"
                                        : "#b7ebcf"
                                      : theme.mode === "dark"
                                        ? "#4f7698"
                                        : "#9bd2ff",
                              },
                            ]}
                          />
                        </View>
                        <Text numberOfLines={1} style={styles.barLabel}>
                          {point.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>

              <Text style={styles.chartFootnote}>
                {activeTrendMetric === "amount"
                  ? "Toggle Nominal menyorot titik dengan omzet tertinggi pada periode ini."
                  : "Toggle Order menyorot titik dengan jumlah transaksi tertinggi pada periode ini."}
              </Text>
            </>
          ) : (
            <Text style={styles.noteText}>Belum ada transaksi pada periode ini.</Text>
          )}
        </AppPanel>
      ) : null}

      {!loading ? (
        <AppPanel style={styles.distributionPanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Distribusi Status</Text>
            <Text style={styles.sectionMeta}>{summary.totalOrders} order</Text>
          </View>
          <View style={styles.distributionList}>
            {distributionData.map((item) => (
              <View key={item.key} style={styles.distributionRow}>
                <View style={styles.distributionHeader}>
                  <View style={styles.distributionLabelWrap}>
                    <View style={[styles.distributionDot, { backgroundColor: item.color }]} />
                    <Text style={styles.distributionLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.distributionCount}>
                    {item.count} • {item.percent}%
                  </Text>
                </View>
                <View style={styles.distributionTrack}>
                  <View
                    style={[
                      styles.distributionFill,
                      {
                        width: `${item.count > 0 ? Math.max(item.percent, 6) : 0}%`,
                        backgroundColor: item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </AppPanel>
      ) : null}

      {!loading ? (
        <AppPanel style={styles.paymentPanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Komposisi Pembayaran</Text>
            <Text style={styles.sectionMeta}>{summary.paidRate}% lunas</Text>
          </View>
          <View style={styles.progressRail}>
            <View style={[styles.progressPaid, { flex: Math.max(summary.paidRate, 1) }]} />
            <View style={[styles.progressUnpaid, { flex: Math.max(summary.unpaidRate, 1) }]} />
          </View>
          <View style={styles.paymentMetaRow}>
            <Text style={styles.paymentMetaLabel}>Bucket Terdominan</Text>
            <Text style={styles.paymentMetaValue}>{dominantBucket ? `${dominantBucket.label} (${dominantBucket.count})` : "-"}</Text>
          </View>
          <View style={styles.paymentMetaRow}>
            <Text style={styles.paymentMetaLabel}>Selesai</Text>
            <Text style={styles.paymentMetaValue}>{bucketCounts.selesai} order</Text>
          </View>
        </AppPanel>
      ) : null}

      {!loading ? (
        <AppPanel style={styles.pipelinePanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Alur Operasional</Text>
            <Text style={styles.sectionMeta}>{rangeMeta.label}</Text>
          </View>
          <View style={styles.pipelineGrid}>
            <View style={styles.pipelineItem}>
              <Text style={styles.pipelineValue}>{bucketCounts.antrian}</Text>
              <Text style={styles.pipelineLabel}>Antrian</Text>
            </View>
            <View style={styles.pipelineItem}>
              <Text style={styles.pipelineValue}>{bucketCounts.proses}</Text>
              <Text style={styles.pipelineLabel}>Proses</Text>
            </View>
            <View style={styles.pipelineItem}>
              <Text style={styles.pipelineValue}>{bucketCounts.siap_ambil}</Text>
              <Text style={styles.pipelineLabel}>Siap Ambil</Text>
            </View>
            <View style={styles.pipelineItem}>
              <Text style={styles.pipelineValue}>{bucketCounts.siap_antar}</Text>
              <Text style={styles.pipelineLabel}>Siap Antar</Text>
            </View>
            <View style={styles.pipelineItem}>
              <Text style={styles.pipelineValue}>{bucketCounts.selesai}</Text>
              <Text style={styles.pipelineLabel}>Selesai</Text>
            </View>
          </View>
        </AppPanel>
      ) : null}

      {canViewFinance && !loading ? (
        <AppPanel style={styles.financePanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Arus Kas Ringkas</Text>
            <Text style={styles.sectionMeta}>{rangeMeta.label}</Text>
          </View>
          <View style={styles.financeGrid}>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Pemasukan</Text>
              <Text style={styles.financeValue}>{formatMoney(financeSummary?.total_income ?? 0)}</Text>
            </View>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Pengeluaran</Text>
              <Text style={styles.financeValue}>{formatMoney(financeSummary?.total_expense ?? 0)}</Text>
            </View>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Adjustment</Text>
              <Text style={styles.financeValue}>{formatMoney(Math.abs(financeSummary?.total_adjustment ?? 0))}</Text>
            </View>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Net</Text>
              <Text style={styles.financeValue}>{formatMoney(Math.abs(financeSummary?.net_amount ?? 0))}</Text>
            </View>
          </View>
          <Text style={styles.noteText}>
            {(financeSummary?.entries_count ?? 0) > 0
              ? `${financeSummary?.entries_count ?? 0} entri keuangan terhitung pada periode ini`
              : "Belum ada entri keuangan pada periode ini"}
          </Text>
        </AppPanel>
      ) : null}

      <AppPanel style={styles.notePanel}>
        <Text style={styles.sectionTitle}>Insight Cepat</Text>
        {topCustomers.length > 0 ? (
          <View style={styles.insightList}>
            {topCustomers.map((customer, index) => (
              <View key={customer.key} style={styles.insightRow}>
                <View style={styles.insightRank}>
                  <Text style={styles.insightRankText}>{index + 1}</Text>
                </View>
                <View style={styles.insightContent}>
                  <Text numberOfLines={1} style={styles.insightTitle}>
                    {customer.name}
                  </Text>
                  <Text style={styles.insightSubtitle}>
                    {customer.ordersCount} order • {formatMoney(customer.totalAmount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noteText}>Belum ada pelanggan dominan pada rentang yang dipilih.</Text>
        )}
        <Text style={styles.noteText}>Tarik layar ke bawah untuk refresh cepat, atau buka modul detail untuk audit lebih lanjut.</Text>
        <View style={styles.actionsColumn}>
          <AppButton
            leftElement={<Ionicons color={theme.colors.info} name="image-outline" size={18} />}
            loading={exportingImage}
            onPress={() => void handleExportReport()}
            title={exportingImage ? "Menyiapkan Gambar..." : "Bagikan Laporan"}
            variant="secondary"
          />
          <AppButton
            leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={18} />}
            onPress={() => void loadData(true)}
            title="Refresh Data"
            variant="secondary"
          />
          <AppButton
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="receipt-outline" size={18} />}
            onPress={() => navigation.navigate("OrdersTab", { screen: "OrdersToday" })}
            title="Buka Pesanan"
          />
          {canViewFinance ? (
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="cash-outline" size={18} />}
              onPress={() => navigation.navigate("AccountTab", { screen: "FinanceTools" })}
              title="Buka Keuangan"
              variant="ghost"
            />
          ) : null}
        </View>
        {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
      </AppPanel>
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
    },
    captureWrap: {
      gap: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
    },
    heroPanel: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
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
    },
    heroBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    heroMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 28 : 24,
      lineHeight: isTablet ? 34 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      lineHeight: isTablet ? 20 : 18,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.84)",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.mode === "dark" ? "rgba(56,189,248,0.18)" : "#dff4ff",
    },
    filterChipPressed: {
      opacity: 0.82,
    },
    filterChipLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    filterChipLabelActive: {
      color: theme.colors.info,
    },
    rangeMetaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    customRangePanel: {
      gap: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.78)",
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    customRangeLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    customRangeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    customDateInputWrap: {
      minWidth: isTablet ? 180 : 132,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "31%" : "48%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: 10,
    },
    customDateInputPressed: {
      opacity: 0.84,
    },
    customDatePrefix: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    customDateInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      paddingVertical: 10,
    },
    customDateValue: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      paddingVertical: 10,
      textAlign: "right",
    },
    customRangeActionRow: {
      alignSelf: "flex-start",
      marginTop: 2,
    },
    inlinePickerCard: {
      marginTop: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: theme.spacing.xs,
    },
    inlinePickerTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    inlinePickerActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      justifyContent: "flex-end",
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
    sectionMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    metricItem: {
      minWidth: isTablet ? 160 : 130,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "24%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 11,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 21 : 19,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "center",
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    metaCard: {
      minWidth: isTablet ? 180 : 145,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "24%" : "48%",
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 3,
    },
    metaCardLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    metaCardValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 17 : 15,
    },
    metaCardCaption: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    paymentPanel: {
      gap: theme.spacing.xs,
    },
    trendPanel: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
    },
    chartSummaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    chartSummaryItem: {
      minWidth: isTablet ? 160 : 132,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "31%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 2,
    },
    chartSummaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    chartSummaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 17 : 15,
    },
    chartSummaryCaption: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    chartGroup: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    chartGroupTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    chartGroupMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    chartMetricRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    chartMetricChip: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.86)",
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chartMetricChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.mode === "dark" ? "rgba(56,189,248,0.18)" : "#dff4ff",
    },
    chartMetricChipPressed: {
      opacity: 0.84,
    },
    chartMetricChipLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    chartMetricChipLabelActive: {
      color: theme.colors.info,
    },
    barChartRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.spacing.xs,
      minHeight: 180,
      marginTop: theme.spacing.xs,
    },
    barColumn: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    barValueText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    barValueTextActive: {
      color: theme.colors.info,
    },
    barValueMoneyActive: {
      color: theme.colors.success,
    },
    barTrack: {
      width: "100%",
      minHeight: 130,
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.05)" : "#edf6fd",
      justifyContent: "flex-end",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    barFill: {
      width: "100%",
      minHeight: 4,
      borderRadius: theme.radii.md,
    },
    barLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "center",
    },
    chartFootnote: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    distributionPanel: {
      gap: theme.spacing.sm,
      backgroundColor: theme.mode === "dark" ? "#151f2a" : "#f9fcff",
      borderColor: theme.colors.borderStrong,
    },
    distributionList: {
      gap: theme.spacing.sm,
    },
    distributionRow: {
      gap: 6,
    },
    distributionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    distributionLabelWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    distributionDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    distributionLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    distributionCount: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    distributionTrack: {
      width: "100%",
      height: 10,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "#eaf2f8",
      overflow: "hidden",
    },
    distributionFill: {
      height: "100%",
      borderRadius: theme.radii.pill,
    },
    progressRail: {
      height: 12,
      borderRadius: theme.radii.pill,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
      flexDirection: "row",
      alignItems: "stretch",
    },
    progressPaid: {
      backgroundColor: theme.colors.success,
    },
    progressUnpaid: {
      backgroundColor: theme.colors.warning,
    },
    paymentMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    paymentMetaLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    paymentMetaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    pipelinePanel: {
      gap: theme.spacing.sm,
    },
    pipelineGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    pipelineItem: {
      minWidth: isTablet ? 128 : 104,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "19%" : "31%",
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      paddingHorizontal: 10,
      gap: 4,
    },
    pipelineValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 22 : 20,
    },
    pipelineLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    financePanel: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#1a2a1c" : "#f6fff7",
    },
    financeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    financeItem: {
      minWidth: isTablet ? 160 : 132,
      flexGrow: 1,
      flexBasis: isCompactLandscape ? "24%" : "48%",
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 3,
    },
    financeLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    financeValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 17 : 15,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    notePanel: {
      gap: theme.spacing.sm,
    },
    noteText: {
      color: theme.colors.textSecondary,
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
    insightList: {
      gap: theme.spacing.sm,
    },
    insightRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    insightRank: {
      width: 30,
      height: 30,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.mode === "dark" ? "rgba(56,189,248,0.18)" : "#e3f5ff",
    },
    insightRankText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 13,
    },
    insightContent: {
      flex: 1,
      gap: 2,
    },
    insightTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    insightSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    actionsColumn: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
  });
}
