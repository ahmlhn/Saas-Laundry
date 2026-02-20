import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
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
  const styles = useMemo(() => createStyles(theme), [theme]);
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
            <AppButton onPress={() => void handleToggleArchive(item)} title={item.deleted_at ? "Restore" : "Arsipkan"} variant="ghost" />
          </View>
        ) : null}
      </View>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Kembali</Text>
          </Pressable>
          <Text style={styles.title}>Layanan/Produk</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses untuk membuka modul ini.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Layanan/Produk</Text>
        <Text style={styles.subtitle}>
          {selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet"} - Kelola katalog layanan tenant.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama layanan / unit..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={search}
        />
        <AppButton onPress={() => void loadServices(true, true)} title="Refresh" variant="secondary" />
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
          <Text style={styles.successText}>{actionMessage}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
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
    header: {
      gap: 2,
    },
    backButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 2,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    searchRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
      alignItems: "center",
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
      fontSize: 12,
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
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
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
      fontSize: 14,
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
      paddingVertical: 9,
    },
    successText: {
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
