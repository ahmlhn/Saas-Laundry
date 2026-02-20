import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
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
  const styles = useMemo(() => createStyles(theme), [theme]);
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
              onPress={() => handleSelectAsActive(item)}
              title={isActiveOutlet ? "Outlet Aktif" : "Jadikan Aktif"}
              variant="secondary"
            />
          )}
          {item.deleted_at ? null : (
            <AppButton
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
          {canArchive ? <AppButton onPress={() => void handleToggleArchive(item)} title={item.deleted_at ? "Restore" : "Arsipkan"} variant="ghost" /> : null}
        </View>
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
          <Text style={styles.title}>Kelola Outlet</Text>
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
        <Text style={styles.title}>Kelola Outlet</Text>
        <Text style={styles.subtitle}>Monitoring outlet tenant, pilih outlet aktif, dan kelola status arsip outlet.</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama / kode outlet..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={search}
        />
        <AppButton onPress={() => void handleSearch()} title="Cari" variant="secondary" />
      </View>

      <View style={styles.filterRow}>
        {canArchive ? (
          <Pressable onPress={() => setIncludeDeleted((value) => !value)} style={[styles.toggleChip, includeDeleted ? styles.toggleChipActive : null]}>
            <Text style={[styles.toggleChipText, includeDeleted ? styles.toggleChipTextActive : null]}>
              {includeDeleted ? "Menampilkan Arsip" : "Sembunyikan Arsip"}
            </Text>
          </Pressable>
        ) : null}
        <AppButton onPress={() => void loadOutlets(true, true)} title="Refresh" variant="ghost" />
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
      alignItems: "center",
      justifyContent: "space-between",
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
    outletCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 7,
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
      fontSize: 14,
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
