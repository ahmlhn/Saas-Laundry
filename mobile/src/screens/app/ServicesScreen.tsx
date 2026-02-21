import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
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

export function ServicesScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Services">>();
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canArchive = hasAnyRole(roles, ["owner", "admin"]);

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    void loadServices(false, true);
  }, [selectedOutlet?.id, includeDeleted, onlyActive, canView]);

  async function loadServices(isRefresh: boolean, forceRefresh = false): Promise<void> {
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
  }

  async function handleToggleArchive(item: ServiceCatalogItem): Promise<void> {
    if (!canArchive) {
      return;
    }

    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreService(item.id);
        setActionMessage("Layanan berhasil dipulihkan.");
      } else {
        await archiveService(item.id);
        setActionMessage("Layanan berhasil diarsipkan.");
      }

      await loadServices(false, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  const visibleServices = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return services;
    }

    return services.filter((item) => {
      const name = item.name.toLowerCase();
      const unit = item.unit_type.toLowerCase();
      return name.includes(keyword) || unit.includes(keyword);
    });
  }, [services, search]);

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`service-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={14} width="52%" />
            <AppSkeletonBlock height={11} width="76%" />
            <AppSkeletonBlock height={10} width="42%" />
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

  function renderItem({ item }: { item: ServiceCatalogItem }) {
    const status = renderStatus(item);
    const hasOverride = item.outlet_override?.price_override_amount !== null && item.outlet_override?.price_override_amount !== undefined;

    return (
      <View style={styles.serviceCard}>
        <View style={styles.serviceTop}>
          <View style={styles.serviceTitleWrap}>
            <Text style={styles.serviceName}>{item.name}</Text>
            <Text style={styles.serviceMeta}>
              Unit {formatUnitType(item.unit_type)} - Harga Dasar {formatMoney(item.base_price_amount)}
            </Text>
          </View>
          <StatusPill label={status.label} tone={status.tone} />
        </View>

        <Text style={styles.servicePrice}>Harga Berlaku: {formatMoney(item.effective_price_amount)}</Text>

        {hasOverride ? <StatusPill label="Override Outlet Aktif" tone="info" /> : null}

        {canArchive ? (
          <View style={styles.actionRow}>
            <AppButton
              leftElement={<Ionicons color={theme.colors.textPrimary} name={item.deleted_at ? "refresh-outline" : "archive-outline"} size={17} />}
              onPress={() => void handleToggleArchive(item)}
              title={item.deleted_at ? "Restore" : "Arsipkan"}
              variant="ghost"
            />
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
              <Text style={styles.heroBadgeText}>Layanan/Produk</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Layanan/Produk</Text>
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
            <Text style={styles.heroBadgeText}>Layanan/Produk</Text>
          </View>
          <Pressable onPress={() => void loadServices(true, true)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Layanan/Produk</Text>
        <Text style={styles.subtitle}>{outletLabel} - Kelola katalog layanan tenant.</Text>
      </AppPanel>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama layanan / unit..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={search}
        />
        <AppButton
          leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={17} />}
          onPress={() => void loadServices(true, true)}
          title="Refresh"
          variant="secondary"
        />
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
              {includeDeleted ? "Menampilkan Arsip" : "Sembunyikan Arsip"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        renderSkeletonList()
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleServices}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadServices(true, true)}
          refreshing={refreshing}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada layanan untuk filter saat ini.</Text>}
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
    searchRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      gap: theme.spacing.xs,
      alignItems: isTablet || isCompactLandscape ? "center" : "stretch",
    },
    searchInput: {
      flex: isTablet || isCompactLandscape ? 1 : undefined,
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
      gap: 7,
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
    servicePrice: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    actionRow: {
      marginTop: 2,
    },
    emptyText: {
      textAlign: "center",
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
      marginBottom: 4,
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
