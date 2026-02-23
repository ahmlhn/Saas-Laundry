import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { StatusPill } from "../../components/ui/StatusPill";
import { archiveService, listServices, restoreService } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { ServiceCatalogItem } from "../../types/service";

type ServiceCatalogRoute = RouteProp<AccountStackParamList, "ServiceCatalog">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatUnitType(value: string): string {
  const unit = value.trim().toLowerCase();
  if (!unit) {
    return "-";
  }

  if (unit === "kg") {
    return "Kg";
  }

  if (unit === "pcs") {
    return "Pcs";
  }

  return value;
}

export function ServiceCatalogScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ServiceCatalog">>();
  const route = useRoute<ServiceCatalogRoute>();
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canManageCatalog = hasAnyRole(roles, ["owner", "admin"]);
  const canArchive = canManageCatalog;
  const sectionTitle = route.params?.title ?? "Daftar Layanan";
  const sectionDescription = route.params?.description ?? "Atur katalog, harga, dan status layanan.";
  const initialKeyword = route.params?.initialKeyword ?? "";

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword.trim().toLowerCase());
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchKeyword(searchInput.trim().toLowerCase());
    }, 240);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    const preset = initialKeyword.trim();
    setSearchInput(preset);
    setSearchKeyword(preset.toLowerCase());
  }, [initialKeyword]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setActionMessage(null);
    }, 2600);

    return () => {
      clearTimeout(timer);
    };
  }, [actionMessage]);

  const loadServices = useCallback(
    async (isRefresh: boolean, forceRefresh = false): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const data = await listServices({
          outletId: selectedOutlet?.id,
          includeDeleted: includeDeleted && canArchive ? true : undefined,
          active: onlyActive ? true : undefined,
          forceRefresh: isRefresh || forceRefresh,
        });
        setServices(data);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedOutlet?.id, includeDeleted, canArchive, onlyActive]
  );

  useFocusEffect(
    useCallback(() => {
      if (!canView) {
        setLoading(false);
        return;
      }

      void loadServices(false, true);
    }, [canView, loadServices])
  );

  async function handleToggleArchive(item: ServiceCatalogItem): Promise<void> {
    if (!canArchive || busyServiceId) {
      return;
    }

    setBusyServiceId(item.id);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreService(item.id);
        setActionMessage(`Layanan "${item.name}" berhasil dipulihkan.`);
      } else {
        await archiveService(item.id);
        setActionMessage(`Layanan "${item.name}" berhasil diarsipkan.`);
      }

      await loadServices(false, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBusyServiceId(null);
    }
  }

  const visibleServices = useMemo(() => {
    if (!searchKeyword) {
      return services;
    }

    return services.filter((item) => {
      const name = item.name.toLowerCase();
      const unit = item.unit_type.toLowerCase();
      return name.includes(searchKeyword) || unit.includes(searchKeyword);
    });
  }, [services, searchKeyword]);

  const summary = useMemo(() => {
    const total = services.length;
    const active = services.filter((item) => item.active && !item.deleted_at).length;
    const archived = services.filter((item) => !!item.deleted_at).length;
    const overrides = services.filter(
      (item) => item.outlet_override?.price_override_amount !== null && item.outlet_override?.price_override_amount !== undefined
    ).length;

    return { total, active, archived, overrides };
  }, [services]);

  const hasFilters = searchInput.trim().length > 0 || includeDeleted || !onlyActive;

  function resetFilters(): void {
    setSearchInput("");
    setIncludeDeleted(false);
    setOnlyActive(true);
  }

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`service-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={13} width="42%" />
            <AppSkeletonBlock height={11} width="74%" />
            <View style={styles.skeletonPriceRow}>
              <AppSkeletonBlock height={10} width="44%" />
              <AppSkeletonBlock height={10} width="28%" />
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderStatus(item: ServiceCatalogItem): { label: string; tone: "warning" | "success" | "neutral" } {
    if (item.deleted_at) {
      return { label: "Arsip", tone: "warning" };
    }

    if (item.active) {
      return { label: "Aktif", tone: "success" };
    }

    return { label: "Nonaktif", tone: "neutral" };
  }

  function renderEmptyState() {
    return (
      <AppPanel style={styles.emptyPanel}>
        <View style={styles.emptyIconWrap}>
          <Ionicons color={theme.colors.info} name="cube-outline" size={20} />
        </View>
        <Text style={styles.emptyTitle}>Tidak ada layanan ditemukan</Text>
        <Text style={styles.emptyText}>
          {hasFilters ? "Coba reset filter pencarian atau ubah status filter layanan." : "Belum ada layanan pada outlet ini."}
        </Text>
        <View style={styles.emptyActionRow}>
          {hasFilters ? (
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="funnel-outline" size={16} />}
              onPress={resetFilters}
              title="Reset Filter"
              variant="secondary"
            />
          ) : null}
          {canManageCatalog ? (
            <AppButton
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="add-circle-outline" size={16} />}
              onPress={() => navigation.navigate("ServiceForm", { mode: "create" })}
              title="Tambah Layanan"
            />
          ) : null}
        </View>
      </AppPanel>
    );
  }

  function renderItem({ item }: { item: ServiceCatalogItem }) {
    const status = renderStatus(item);
    const hasOverride = item.outlet_override?.price_override_amount !== null && item.outlet_override?.price_override_amount !== undefined;
    const isMutating = busyServiceId === item.id;

    return (
      <View style={styles.serviceCard}>
        <View style={styles.serviceTop}>
          <View style={styles.serviceTitleWrap}>
            <Text style={styles.serviceName}>{item.name}</Text>
            <Text style={styles.serviceMeta}>Unit {formatUnitType(item.unit_type)}</Text>
          </View>
          <StatusPill label={status.label} tone={status.tone} />
        </View>

        <View style={styles.priceGrid}>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Harga Dasar</Text>
            <Text style={styles.priceValue}>{formatMoney(item.base_price_amount)}</Text>
          </View>
          <View style={[styles.priceBox, hasOverride ? styles.priceBoxHighlight : null]}>
            <Text style={styles.priceLabel}>Harga Berlaku</Text>
            <Text style={[styles.priceValue, hasOverride ? styles.priceValueHighlight : null]}>{formatMoney(item.effective_price_amount)}</Text>
          </View>
        </View>

        {hasOverride ? <Text style={styles.overrideHint}>Menggunakan override harga outlet aktif.</Text> : null}

        {canManageCatalog || canArchive ? (
          <View style={styles.actionRow}>
            {canManageCatalog ? (
              <View style={styles.actionItem}>
                <AppButton
                  disabled={isMutating}
                  leftElement={<Ionicons color={theme.colors.info} name="create-outline" size={16} />}
                  onPress={() => navigation.navigate("ServiceForm", { mode: "edit", service: item })}
                  title="Edit"
                  variant="secondary"
                />
              </View>
            ) : null}

            {canArchive ? (
              <View style={styles.actionItem}>
                <AppButton
                  disabled={isMutating}
                  leftElement={<Ionicons color={theme.colors.textPrimary} name={item.deleted_at ? "refresh-outline" : "archive-outline"} size={16} />}
                  loading={isMutating}
                  onPress={() => void handleToggleArchive(item)}
                  title={item.deleted_at ? "Restore" : "Arsipkan"}
                  variant="ghost"
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.heroBadge}>
              <Ionicons color={theme.colors.info} name="cube-outline" size={15} />
              <Text style={styles.heroBadgeText}>Katalog Layanan</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>{sectionTitle}</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses untuk membuka modul ini.</Text>
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
            <Ionicons color={theme.colors.info} name="cube-outline" size={15} />
            <Text style={styles.heroBadgeText}>Katalog Layanan</Text>
          </View>
          <Pressable onPress={() => void loadServices(true, true)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>{sectionTitle}</Text>
        <Text style={styles.subtitle}>
          {outletLabel} - {sectionDescription}
        </Text>
      </AppPanel>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>{summary.total}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Aktif</Text>
          <Text style={styles.summaryValue}>{summary.active}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Arsip</Text>
          <Text style={styles.summaryValue}>{summary.archived}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Override</Text>
          <Text style={styles.summaryValue}>{summary.overrides}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchInputWrap}>
          <Ionicons color={theme.colors.textMuted} name="search-outline" size={17} />
          <TextInput
            onChangeText={setSearchInput}
            placeholder="Cari nama layanan / unit..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={searchInput}
          />
          {searchInput.trim().length > 0 ? (
            <Pressable onPress={() => setSearchInput("")} style={({ pressed }) => [styles.clearSearchButton, pressed ? styles.clearSearchButtonPressed : null]}>
              <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.searchActionRow}>
          {canManageCatalog ? (
            <View style={styles.searchActionButton}>
              <AppButton
                leftElement={<Ionicons color={theme.colors.primaryContrast} name="add-circle-outline" size={16} />}
                onPress={() => navigation.navigate("ServiceForm", { mode: "create" })}
                title="Tambah"
              />
            </View>
          ) : null}
          <View style={styles.searchActionButton}>
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={16} />}
              onPress={() => void loadServices(true, true)}
              title="Refresh"
              variant="secondary"
            />
          </View>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Pressable onPress={() => setOnlyActive((value) => !value)} style={[styles.toggleChip, onlyActive ? styles.toggleChipActive : null]}>
          <Text style={[styles.toggleChipText, onlyActive ? styles.toggleChipTextActive : null]}>{onlyActive ? "Hanya Aktif" : "Semua Status"}</Text>
        </Pressable>
        {canArchive ? (
          <Pressable
            onPress={() => setIncludeDeleted((value) => !value)}
            style={[styles.toggleChip, includeDeleted ? styles.toggleChipActive : null]}
          >
            <Text style={[styles.toggleChipText, includeDeleted ? styles.toggleChipTextActive : null]}>
              {includeDeleted ? "Arsip Ditampilkan" : "Arsip Disembunyikan"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.resultInfo}>{visibleServices.length} layanan ditampilkan</Text>

      {loading ? (
        renderSkeletonList()
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleServices}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState()}
          onRefresh={() => void loadServices(true, true)}
          refreshing={refreshing}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      )}

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
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    summaryCard: {
      minWidth: isTablet ? 128 : 100,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#10283d" : "#f7fcff",
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 1,
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 18,
      lineHeight: 22,
    },
    searchWrap: {
      gap: theme.spacing.xs,
    },
    searchInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: 12,
      minHeight: 46,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingVertical: 10,
    },
    clearSearchButton: {
      borderRadius: theme.radii.pill,
      padding: 2,
    },
    clearSearchButtonPressed: {
      opacity: 0.72,
    },
    searchActionRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      gap: theme.spacing.xs,
      alignItems: "stretch",
    },
    searchActionButton: {
      flex: isTablet || isCompactLandscape ? 1 : undefined,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    toggleChip: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: theme.colors.surface,
    },
    toggleChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    toggleChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    toggleChipTextActive: {
      color: theme.colors.info,
    },
    resultInfo: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
      marginTop: -2,
    },
    skeletonWrap: {
      gap: theme.spacing.xs,
      paddingVertical: 2,
    },
    skeletonCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 8,
    },
    skeletonPriceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    listContent: {
      gap: theme.spacing.xs,
    },
    serviceCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    serviceTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    serviceTitleWrap: {
      flex: 1,
      gap: 2,
    },
    serviceName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    serviceMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    priceGrid: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    priceBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    priceBoxHighlight: {
      borderColor: theme.colors.info,
      backgroundColor: theme.mode === "dark" ? "rgba(42,124,226,0.2)" : "rgba(42,124,226,0.1)",
    },
    priceLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    priceValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      lineHeight: 18,
    },
    priceValueHighlight: {
      color: theme.colors.info,
    },
    overrideHint: {
      color: theme.colors.info,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    actionRow: {
      marginTop: 3,
      flexDirection: "row",
      gap: theme.spacing.xs,
      alignItems: "center",
    },
    actionItem: {
      flex: 1,
    },
    emptyPanel: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 18,
    },
    emptyIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      textAlign: "center",
    },
    emptyText: {
      textAlign: "center",
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    emptyActionRow: {
      width: "100%",
      gap: theme.spacing.xs,
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
