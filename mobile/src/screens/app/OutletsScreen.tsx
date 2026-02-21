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
import { archiveOutlet, listOutlets, restoreOutlet } from "../../features/outlets/outletApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OutletItem } from "../../types/outlet";

const LIMIT = 80;

export function OutletsScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Outlets">>();
  const { session, selectedOutlet, selectOutlet, refreshSession } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin"]);
  const canArchive = hasAnyRole(roles, ["owner"]);

  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Belum ada outlet aktif";

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    void loadOutlets(false, true, submittedQuery);
  }, [canView, includeDeleted]);

  async function loadOutlets(isRefresh: boolean, forceRefresh = false, queryParam = submittedQuery): Promise<void> {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listOutlets({
        query: queryParam,
        limit: LIMIT,
        includeDeleted: includeDeleted && canArchive ? true : undefined,
        forceRefresh: isRefresh || forceRefresh,
      });
      setOutlets(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleSearch(): Promise<void> {
    const keyword = search.trim();
    setSubmittedQuery(keyword);
    await loadOutlets(false, true, keyword);
  }

  function handleSelectAsActive(item: OutletItem): void {
    if (item.deleted_at) {
      return;
    }

    selectOutlet({
      id: item.id,
      tenant_id: item.tenant_id,
      name: item.name,
      code: item.code,
      timezone: item.timezone,
    });

    setActionMessage(`${item.code} - ${item.name} dijadikan outlet aktif.`);
    setErrorMessage(null);
  }

  async function handleToggleArchive(item: OutletItem): Promise<void> {
    if (!canArchive) {
      return;
    }

    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreOutlet(item.id);
        setActionMessage("Outlet berhasil dipulihkan.");
      } else {
        await archiveOutlet(item.id);
        setActionMessage("Outlet berhasil diarsipkan.");
      }

      await refreshSession();
      await loadOutlets(false, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function renderStatus(item: OutletItem): { label: string; tone: "warning" | "success" } {
    if (item.deleted_at) {
      return { label: "Arsip", tone: "warning" };
    }

    return { label: "Aktif", tone: "success" };
  }

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`outlet-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={14} width="48%" />
            <AppSkeletonBlock height={11} width="68%" />
            <AppSkeletonBlock height={11} width="44%" />
          </View>
        ))}
      </View>
    );
  }

  function renderItem({ item }: { item: OutletItem }) {
    const status = renderStatus(item);
    const isActiveOutlet = selectedOutlet?.id === item.id;

    return (
      <View style={styles.outletCard}>
        <View style={styles.outletTop}>
          <View style={styles.outletTitleWrap}>
            <Text style={styles.outletName}>
              {item.code} - {item.name}
            </Text>
            <Text style={styles.outletMeta}>Timezone: {item.timezone}</Text>
          </View>
          <StatusPill label={status.label} tone={status.tone} />
        </View>

        <Text style={styles.outletMeta}>Alamat: {item.address?.trim() ? item.address : "-"}</Text>

        <View style={styles.actionRow}>
          {item.deleted_at ? null : (
            <AppButton
              disabled={isActiveOutlet}
              leftElement={<Ionicons color={theme.colors.info} name={isActiveOutlet ? "checkmark-circle-outline" : "radio-button-on-outline"} size={17} />}
              onPress={() => handleSelectAsActive(item)}
              title={isActiveOutlet ? "Outlet Aktif" : "Jadikan Aktif"}
              variant="secondary"
            />
          )}
          {item.deleted_at ? null : (
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="navigate-outline" size={17} />}
              onPress={() =>
                navigation.navigate("ShippingZones", {
                  outletId: item.id,
                  outletLabel: `${item.code} - ${item.name}`,
                })
              }
              title="Zona Antar"
              variant="secondary"
            />
          )}
          {canArchive ? (
            <AppButton
              leftElement={<Ionicons color={theme.colors.textPrimary} name={item.deleted_at ? "refresh-outline" : "archive-outline"} size={17} />}
              onPress={() => void handleToggleArchive(item)}
              title={item.deleted_at ? "Restore" : "Arsipkan"}
              variant="ghost"
            />
          ) : null}
        </View>
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
              <Ionicons color={theme.colors.info} name="business-outline" size={15} />
              <Text style={styles.heroBadgeText}>Kelola Outlet</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Kelola Outlet</Text>
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
            <Ionicons color={theme.colors.info} name="business-outline" size={15} />
            <Text style={styles.heroBadgeText}>Kelola Outlet</Text>
          </View>
          <Pressable onPress={() => void loadOutlets(true, true)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Kelola Outlet</Text>
        <Text style={styles.subtitle}>Monitoring outlet tenant, pilih outlet aktif, dan kelola status arsip outlet.</Text>
        <Text numberOfLines={1} style={styles.heroMetaText}>
          Outlet aktif: {outletLabel}
        </Text>
      </AppPanel>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama / kode outlet..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={search}
        />
        <AppButton
          leftElement={<Ionicons color={theme.colors.info} name="search-outline" size={17} />}
          onPress={() => void handleSearch()}
          title="Cari"
          variant="secondary"
        />
      </View>

      <View style={styles.filterRow}>
        {canArchive ? (
          <Pressable onPress={() => setIncludeDeleted((value) => !value)} style={[styles.toggleChip, includeDeleted ? styles.toggleChipActive : null]}>
            <Text style={[styles.toggleChipText, includeDeleted ? styles.toggleChipTextActive : null]}>
              {includeDeleted ? "Menampilkan Arsip" : "Sembunyikan Arsip"}
            </Text>
          </Pressable>
        ) : null}
        <AppButton
          leftElement={<Ionicons color={theme.colors.textPrimary} name="refresh-outline" size={17} />}
          onPress={() => void loadOutlets(true, true)}
          title="Refresh"
          variant="ghost"
        />
      </View>

      {loading ? (
        renderSkeletonList()
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={outlets}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadOutlets(true, true)}
          refreshing={refreshing}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada outlet untuk filter saat ini.</Text>}
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
    heroMetaText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
      alignItems: "center",
      justifyContent: "space-between",
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
    outletCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    outletTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    outletTitleWrap: {
      flex: 1,
      gap: 1,
    },
    outletName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    outletMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
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
