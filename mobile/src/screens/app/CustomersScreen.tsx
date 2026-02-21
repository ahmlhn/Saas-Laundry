import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

const INITIAL_LIMIT = 80;

type SortMode = "az" | "latest";

function isNewCustomer(createdAt: string): boolean {
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) {
    return false;
  }

  const diffMs = Date.now() - createdTime;
  return diffMs <= 1000 * 60 * 60 * 24 * 7;
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

export function CustomersScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Customers">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openCustomerDetail = useCallback(
    (customer: Customer): void => {
      navigation.navigate("CustomerDetail", { customer });
    },
    [navigation]
  );

  const openCustomerForm = useCallback(
    (customer: Customer): void => {
      navigation.navigate("CustomerForm", {
        mode: "edit",
        customer,
      });
    },
    [navigation]
  );

  const loadCustomers = useCallback(
    async (isRefresh: boolean, query?: string): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const data = await listCustomers({
          limit: INITIAL_LIMIT,
          query: query?.trim() || undefined,
          forceRefresh: isRefresh,
        });
        setCustomers(data);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void loadCustomers(false, search);
    }, [loadCustomers, search])
  );

  const visibleCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
      ? customers.filter((customer) => {
          const meta = parseCustomerProfileMeta(customer.notes);
          return (
            customer.name.toLowerCase().includes(normalizedSearch) ||
            customer.phone_normalized.toLowerCase().includes(normalizedSearch) ||
            meta.note.toLowerCase().includes(normalizedSearch)
          );
        })
      : customers;

    const sorted = [...filtered];
    if (sortMode === "latest") {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
    }

    return sorted;
  }, [customers, search, sortMode]);

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 5 }).map((_, index) => (
          <View key={`customer-skeleton-${index}`} style={styles.skeletonRow}>
            <AppSkeletonBlock width={52} height={52} radius={26} />
            <View style={styles.skeletonTextWrap}>
              <AppSkeletonBlock width="48%" height={14} />
              <AppSkeletonBlock width="64%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderItem({ item }: { item: Customer }) {
    const meta = parseCustomerProfileMeta(item.notes);
    const subtitle = meta.note || formatCustomerPhoneDisplay(item.phone_normalized);
    const isNew = isNewCustomer(item.created_at);

    return (
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{customerInitials(item.name)}</Text>
        </View>

        <View style={styles.customerMain}>
          <View style={styles.customerNameRow}>
            <Pressable onPress={() => openCustomerDetail(item)} style={({ pressed }) => [styles.namePressable, pressed ? styles.namePressed : null]}>
              <Text numberOfLines={1} style={styles.customerName}>
                {item.name}
              </Text>
            </Pressable>
            {isNew ? (
              <View style={styles.badgeNew}>
                <Text style={styles.badgeNewText}>Baru</Text>
              </View>
            ) : null}
            {canCreateOrEdit ? (
              <Pressable onPress={() => openCustomerForm(item)} style={styles.editInlineButton}>
                <Ionicons color={theme.colors.info} name="create-outline" size={18} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => openCustomerDetail(item)} style={({ pressed }) => (pressed ? styles.subTextPressed : null)}>
            <Text numberOfLines={1} style={styles.customerPhone}>
              {subtitle}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderEmptyState() {
    return (
      <AppPanel style={styles.emptyPanel}>
        <Text style={styles.emptyTitle}>Belum ada pelanggan</Text>
        <Text style={styles.emptyText}>
          {search.trim() ? "Tidak ada data yang cocok dengan pencarian." : "Tambah pelanggan pertama untuk mulai transaksi lebih cepat."}
        </Text>
        {canCreateOrEdit ? (
          <AppButton
            onPress={() =>
              navigation.navigate("CustomerForm", {
                mode: "create",
              })
            }
            title="Tambah Pelanggan"
          />
        ) : null}
      </AppPanel>
    );
  }

  return (
    <AppScreen scroll={false}>
      <FlatList
        contentContainerStyle={styles.content}
        data={loading ? [] : visibleCustomers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.topBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.topIconButton}>
                <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={22} />
              </Pressable>
              <Text style={styles.brandText}>Cuci Laundry</Text>
              <Pressable onPress={() => setSortMode((mode) => (mode === "az" ? "latest" : "az"))} style={styles.topIconButton}>
                <Ionicons color={theme.colors.info} name={sortMode === "az" ? "text" : "time-outline"} size={20} />
              </Pressable>
            </View>

            <AppPanel style={styles.headerPanel}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>Pelanggan ({visibleCustomers.length})</Text>
                <Pressable onPress={() => setSearchOpen((value) => !value)} style={styles.searchToggleButton}>
                  <Ionicons color={theme.colors.textPrimary} name={searchOpen ? "close" : "search"} size={22} />
                </Pressable>
              </View>

              {searchOpen ? (
                <View style={styles.searchRow}>
                  <TextInput
                    onChangeText={setSearch}
                    onSubmitEditing={() => void loadCustomers(true, search)}
                    placeholder="Cari nama / nomor..."
                    placeholderTextColor={theme.colors.textMuted}
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={search}
                  />
                  <View style={styles.searchButtonWrap}>
                    <AppButton onPress={() => void loadCustomers(true, search)} title="Cari" variant="secondary" />
                  </View>
                </View>
              ) : (
                <View style={styles.filterRow}>
                  <View style={styles.filterChipActive}>
                    <Text style={styles.filterChipActiveText}>Semua</Text>
                  </View>
                  <View style={styles.filterChip}>
                    <Text style={styles.filterChipText}>{sortMode === "az" ? "A-Z" : "Terbaru"}</Text>
                  </View>
                </View>
              )}
            </AppPanel>

            {errorMessage ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={loading ? renderSkeletonList() : renderEmptyState()}
        onRefresh={() => void loadCustomers(true, search)}
        refreshing={refreshing}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />

      {canCreateOrEdit ? (
        <Pressable
          onPress={() =>
            navigation.navigate("CustomerForm", {
              mode: "create",
            })
          }
          style={styles.fabButton}
        >
          <Ionicons color={theme.colors.primaryContrast} name="add" size={32} />
        </Pressable>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: 112,
      gap: theme.spacing.xs,
    },
    headerWrap: {
      gap: theme.spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    brandText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 23,
      letterSpacing: 0.3,
    },
    headerPanel: {
      gap: theme.spacing.sm,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    headerTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 20,
      lineHeight: 26,
    },
    searchToggleButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchButtonWrap: {
      minWidth: 94,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    filterChipActive: {
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.info,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    filterChipActiveText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    filterChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    skeletonWrap: {
      gap: theme.spacing.xs,
    },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    skeletonTextWrap: {
      flex: 1,
      gap: 6,
    },
    customerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f5a300",
    },
    avatarText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    customerMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    customerNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    namePressable: {
      flexShrink: 1,
      minWidth: 0,
    },
    namePressed: {
      opacity: 0.72,
    },
    customerName: {
      flexShrink: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 16,
      lineHeight: 22,
    },
    badgeNew: {
      borderRadius: theme.radii.pill,
      backgroundColor: "#f4bf4f",
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    badgeNewText: {
      color: "#ffffff",
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    editInlineButton: {
      marginLeft: "auto",
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.ring,
    },
    subTextPressed: {
      opacity: 0.72,
    },
    customerPhone: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    emptyPanel: {
      gap: theme.spacing.xs,
      marginTop: 4,
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
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
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
    fabButton: {
      position: "absolute",
      right: 24,
      bottom: 24,
      width: 66,
      height: 66,
      borderRadius: 33,
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
