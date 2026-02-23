import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { listCustomers } from "../../features/customers/customerApi";
import { formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { Customer } from "../../types/customer";

const PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;

type SortMode = "az" | "latest";
type LoadMode = "initial" | "refresh";

function isNewCustomer(createdAt: string): boolean {
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) {
    return false;
  }

  return Date.now() - createdTime <= 1000 * 60 * 60 * 24 * 7;
}

function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "??";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function resolveAvatarTone(name: string): string {
  const tones = ["#f5a300", "#1fa3e8", "#35b76c", "#e08a1a", "#5b79f6"];
  const seed = name.trim().toUpperCase().charCodeAt(0) || 0;
  return tones[seed % tones.length];
}

export function CustomersScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape, isCompactLandscape), [theme, isTablet, isLandscape, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Customers">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firstFocusHandledRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSubmittedQuery(queryInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [queryInput]);

  const loadCustomers = useCallback(async (mode: LoadMode, query: string): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listCustomers({
        limit: PAGE_LIMIT,
        fetchAll: true,
        query: query || undefined,
        forceRefresh: mode === "refresh",
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setCustomers(data);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    firstFocusHandledRef.current = false;
  }, [submittedQuery]);

  useEffect(() => {
    void loadCustomers("initial", submittedQuery);
  }, [loadCustomers, submittedQuery]);

  useFocusEffect(
    useCallback(() => {
      if (!firstFocusHandledRef.current) {
        firstFocusHandledRef.current = true;
        return;
      }

      void loadCustomers("refresh", submittedQuery);
    }, [loadCustomers, submittedQuery])
  );

  const sortedCustomers = useMemo(() => {
    const result = [...customers];

    if (sortMode === "latest") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
    }

    return result;
  }, [customers, sortMode]);

  const newCustomersCount = useMemo(() => customers.filter((item) => isNewCustomer(item.created_at)).length, [customers]);

  const sortLabel = sortMode === "az" ? "A-Z" : "Terbaru";

  function openCustomerDetail(customer: Customer): void {
    navigation.navigate("CustomerDetail", { customer });
  }

  function openCustomerForm(mode: "create" | "edit", customer?: Customer): void {
    navigation.navigate("CustomerForm", {
      mode,
      customer,
    });
  }

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 5 }).map((_, index) => (
          <View key={`customer-skeleton-${index}`} style={styles.skeletonRow}>
            <AppSkeletonBlock height={52} radius={26} width={52} />
            <View style={styles.skeletonTextWrap}>
              <AppSkeletonBlock height={14} width="44%" />
              <AppSkeletonBlock height={12} width="58%" />
              <AppSkeletonBlock height={11} width="76%" />
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderItem({ item }: { item: Customer }) {
    const meta = parseCustomerProfileMeta(item.notes);
    const phoneText = formatCustomerPhoneDisplay(item.phone_normalized);
    const noteText = meta.note || "Tanpa catatan";
    const isNew = isNewCustomer(item.created_at);

    return (
      <Pressable onPress={() => openCustomerDetail(item)} style={({ pressed }) => [styles.customerCard, pressed ? styles.customerCardPressed : null]}>
        <View style={[styles.avatar, { backgroundColor: resolveAvatarTone(item.name) }]}>
          <Text style={styles.avatarText}>{customerInitials(item.name)}</Text>
        </View>

        <View style={styles.customerMain}>
          <View style={styles.customerNameRow}>
            <Text numberOfLines={1} style={styles.customerName}>
              {item.name}
            </Text>

            {isNew ? (
              <View style={styles.badgeNew}>
                <Text style={styles.badgeNewText}>Baru</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.lineRow}>
            <Ionicons color={theme.colors.textMuted} name="call-outline" size={13} />
            <Text numberOfLines={1} style={styles.customerPhone}>
              {phoneText}
            </Text>
          </View>

          <View style={styles.lineRow}>
            <Ionicons color={theme.colors.textMuted} name="document-text-outline" size={13} />
            <Text numberOfLines={1} style={[styles.customerMeta, !meta.note ? styles.customerMetaMuted : null]}>
              {noteText}
            </Text>
          </View>
        </View>

        <View style={styles.trailingActions}>
          {canCreateOrEdit ? (
            <Pressable onPress={() => openCustomerForm("edit", item)} style={styles.editInlineButton}>
              <Ionicons color={theme.colors.info} name="create-outline" size={17} />
            </Pressable>
          ) : null}
          <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={17} />
        </View>
      </Pressable>
    );
  }

  function renderEmptyState() {
    return (
      <AppPanel style={styles.emptyPanel}>
        <Ionicons color={theme.colors.info} name="people-outline" size={28} />
        <Text style={styles.emptyTitle}>Belum ada pelanggan</Text>
        <Text style={styles.emptyText}>{queryInput.trim() ? "Tidak ada data sesuai kata kunci." : "Tambah pelanggan pertama untuk mempercepat transaksi harian."}</Text>
        {canCreateOrEdit ? <AppButton onPress={() => openCustomerForm("create")} title="Tambah Pelanggan" /> : null}
      </AppPanel>
    );
  }

  return (
    <AppScreen scroll={false}>
      <FlatList
        contentContainerStyle={styles.content}
        data={loading ? [] : sortedCustomers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <View style={styles.heroLayerPrimary} />
              <View style={styles.heroLayerSecondary} />
              <View style={styles.heroGlow} />

              <View style={styles.heroContent}>
                <View style={styles.heroTopRow}>
                  <Pressable onPress={() => navigation.goBack()} style={styles.topIconButton}>
                    <Ionicons color="#eaf6ff" name="arrow-back" size={21} />
                  </Pressable>

                  <View style={styles.heroBrandWrap}>
                    <Text style={styles.brandText}>Cuci Laundry</Text>
                    <Text style={styles.heroSubtitle}>Pelanggan</Text>
                  </View>

                  <Pressable onPress={() => setSortMode((mode) => (mode === "az" ? "latest" : "az"))} style={styles.sortPill}>
                    <Ionicons color="#eaf6ff" name={sortMode === "az" ? "text-outline" : "time-outline"} size={13} />
                    <Text style={styles.sortPillText}>{sortLabel}</Text>
                  </Pressable>
                </View>

                <View style={styles.heroMetrics}>
                  <View style={styles.heroMetricItem}>
                    <Text style={styles.heroMetricValue}>{customers.length}</Text>
                    <Text style={styles.heroMetricLabel}>Total</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroMetricItem}>
                    <Text style={styles.heroMetricValue}>{newCustomersCount}</Text>
                    <Text style={styles.heroMetricLabel}>Baru</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroMetricItem}>
                    <Text style={styles.heroMetricValue}>{sortedCustomers.length}</Text>
                    <Text style={styles.heroMetricLabel}>Tampil</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
              <TextInput
                onChangeText={setQueryInput}
                onSubmitEditing={() => void loadCustomers("refresh", queryInput.trim())}
                placeholder="Cari nama, nomor, atau catatan..."
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                style={styles.searchInput}
                value={queryInput}
              />
              {queryInput ? (
                <Pressable onPress={() => setQueryInput("")} style={styles.clearButton}>
                  <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
                </Pressable>
              ) : null}
            </View>

            {errorMessage ? (
              <View style={styles.errorWrap}>
                <Ionicons color={theme.colors.danger} name="warning-outline" size={16} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={loading ? renderSkeletonList() : renderEmptyState()}
        onRefresh={() => void loadCustomers("refresh", submittedQuery)}
        refreshing={refreshing}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />

      {canCreateOrEdit ? (
        <Pressable onPress={() => openCustomerForm("create")} style={styles.fabButton}>
          <Ionicons color={theme.colors.primaryContrast} name="add" size={30} />
        </Pressable>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isLandscape: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: 112,
      gap: theme.spacing.xs,
    },
    headerWrap: {
      gap: theme.spacing.sm,
    },
    heroCard: {
      position: "relative",
      borderRadius: isTablet ? 28 : isCompactLandscape ? 20 : 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(91,174,255,0.35)" : "rgba(83,166,248,0.32)",
      minHeight: isTablet ? 174 : isLandscape ? 156 : 172,
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
      width: "68%",
      backgroundColor: "#1fa3e8",
      opacity: 0.74,
    },
    heroGlow: {
      position: "absolute",
      right: -72,
      top: -80,
      width: 200,
      height: 200,
      borderRadius: 130,
      borderWidth: 28,
      borderColor: "rgba(255,255,255,0.12)",
    },
    heroContent: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    topIconButton: {
      width: isCompactLandscape ? 34 : 36,
      height: isCompactLandscape ? 34 : 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.32)",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    heroBrandWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      gap: 1,
    },
    brandText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 24 : isCompactLandscape ? 20 : 22,
      lineHeight: isTablet ? 30 : isCompactLandscape ? 24 : 27,
      letterSpacing: 0.3,
    },
    heroSubtitle: {
      color: "rgba(233,247,255,0.9)",
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10 : 11,
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    sortPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.32)",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 5,
      minWidth: 64,
      justifyContent: "center",
    },
    sortPillText: {
      color: "#eaf6ff",
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
    },
    heroMetrics: {
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
      borderRadius: theme.radii.md,
      backgroundColor: "rgba(5,32,61,0.16)",
      overflow: "hidden",
    },
    heroMetricItem: {
      flex: 1,
      alignItems: "center",
      gap: 1,
      paddingHorizontal: 10,
      paddingVertical: isCompactLandscape ? 6 : 8,
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
      letterSpacing: 0.35,
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
      minHeight: isCompactLandscape ? 42 : 46,
      paddingLeft: 10,
      paddingRight: 8,
      gap: 4,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 12 : 13,
      paddingVertical: isCompactLandscape ? 9 : 11,
      paddingHorizontal: 6,
    },
    clearButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    errorWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
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
    skeletonWrap: {
      gap: isCompactLandscape ? 8 : theme.spacing.xs,
    },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.md : theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isCompactLandscape ? 10 : 11,
      paddingVertical: isCompactLandscape ? 9 : 10,
    },
    skeletonTextWrap: {
      flex: 1,
      gap: 6,
    },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.md : theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: isCompactLandscape ? 10 : 11,
      paddingVertical: isCompactLandscape ? 9 : 10,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
      minHeight: isCompactLandscape ? 86 : 94,
    },
    customerCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.995 }],
    },
    avatar: {
      width: isCompactLandscape ? 46 : 50,
      height: isCompactLandscape ? 46 : 50,
      borderRadius: isCompactLandscape ? 23 : 25,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: isCompactLandscape ? 14 : 16,
    },
    customerMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    customerNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      minWidth: 0,
    },
    customerName: {
      flexShrink: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 15 : 16,
      lineHeight: isCompactLandscape ? 20 : 22,
    },
    badgeNew: {
      borderRadius: theme.radii.pill,
      backgroundColor: "#f4bf4f",
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    badgeNewText: {
      color: "#ffffff",
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
    },
    lineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    customerPhone: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 11 : 12,
      lineHeight: isCompactLandscape ? 14 : 16,
    },
    customerMeta: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 10.5 : 11,
      lineHeight: isCompactLandscape ? 14 : 15,
    },
    customerMetaMuted: {
      color: theme.colors.textMuted,
    },
    trailingActions: {
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      marginLeft: 2,
    },
    editInlineButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.ring,
    },
    emptyPanel: {
      marginTop: 4,
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    fabButton: {
      position: "absolute",
      right: isCompactLandscape ? 18 : 24,
      bottom: isCompactLandscape ? 18 : 24,
      width: isCompactLandscape ? 60 : 66,
      height: isCompactLandscape ? 60 : 66,
      borderRadius: isCompactLandscape ? 30 : 33,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primaryStrong,
      borderWidth: 2,
      borderColor: theme.colors.surface,
      shadowColor: theme.colors.primaryStrong,
      shadowOpacity: theme.mode === "dark" ? 0.34 : 0.24,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  });
}
