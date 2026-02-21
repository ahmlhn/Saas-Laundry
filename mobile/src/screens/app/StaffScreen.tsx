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
import { archiveStaff, listStaff, restoreStaff } from "../../features/staff/staffApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { StaffMember } from "../../types/staff";

const LIMIT = 80;

export function StaffScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Staff">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin"]);
  const canArchive = hasAnyRole(roles, ["owner"]);

  const [staff, setStaff] = useState<StaffMember[]>([]);
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

    void loadStaff(false, true, submittedQuery);
  }, [canView, includeDeleted]);

  async function loadStaff(isRefresh: boolean, forceRefresh = false, queryParam = submittedQuery): Promise<void> {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listStaff({
        query: queryParam,
        limit: LIMIT,
        includeDeleted: includeDeleted ? true : undefined,
        forceRefresh: isRefresh || forceRefresh,
      });
      setStaff(data);
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
    await loadStaff(false, true, keyword);
  }

  async function handleToggleArchive(item: StaffMember): Promise<void> {
    if (!canArchive || !session || item.id === session.user.id) {
      return;
    }

    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreStaff(item.id);
        setActionMessage("Pegawai berhasil dipulihkan.");
      } else {
        await archiveStaff(item.id);
        setActionMessage("Pegawai berhasil diarsipkan.");
      }

      await loadStaff(false, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function renderStatus(item: StaffMember): { label: string; tone: "warning" | "success" | "neutral" } {
    if (item.deleted_at) {
      return { label: "Arsip", tone: "warning" };
    }

    if (item.status === "active") {
      return { label: "Aktif", tone: "success" };
    }

    return { label: item.status || "Unknown", tone: "neutral" };
  }

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`staff-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={14} width="44%" />
            <AppSkeletonBlock height={11} width="66%" />
            <AppSkeletonBlock height={11} width="54%" />
          </View>
        ))}
      </View>
    );
  }

  function renderItem({ item }: { item: StaffMember }) {
    const status = renderStatus(item);
    const isSelf = item.id === session?.user.id;
    const roleKeys = item.roles.map((role) => role.key).join(", ") || "-";
    const outletCodes = item.outlets.map((outlet) => outlet.code).join(", ") || "-";

    return (
      <View style={styles.staffCard}>
        <View style={styles.staffTop}>
          <View style={styles.staffTitleWrap}>
            <Text style={styles.staffName}>{item.name}</Text>
            <Text style={styles.staffEmail}>{item.email}</Text>
          </View>
          <StatusPill label={status.label} tone={status.tone} />
        </View>

        <Text style={styles.staffMeta}>Role: {roleKeys}</Text>
        <Text style={styles.staffMeta}>Outlet: {outletCodes}</Text>
        {item.phone ? <Text style={styles.staffMeta}>HP: {item.phone}</Text> : null}

        {canArchive ? (
          <View style={styles.actionRow}>
            {isSelf ? (
              <StatusPill label="Akun Anda" tone="info" />
            ) : (
              <AppButton
                leftElement={<Ionicons color={theme.colors.textPrimary} name={item.deleted_at ? "refresh-outline" : "archive-outline"} size={17} />}
                onPress={() => void handleToggleArchive(item)}
                title={item.deleted_at ? "Restore" : "Arsipkan"}
                variant="ghost"
              />
            )}
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
              <Ionicons color={theme.colors.info} name="people-outline" size={15} />
              <Text style={styles.heroBadgeText}>Kelola Pegawai</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Kelola Pegawai</Text>
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
            <Ionicons color={theme.colors.info} name="people-outline" size={15} />
            <Text style={styles.heroBadgeText}>Kelola Pegawai</Text>
          </View>
          <Pressable onPress={() => void loadStaff(true, true)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Kelola Pegawai</Text>
        <Text style={styles.subtitle}>Kelola daftar akun tim laundry dari perangkat mobile.</Text>
      </AppPanel>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama / email / HP..."
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
        <Pressable onPress={() => setIncludeDeleted((value) => !value)} style={[styles.toggleChip, includeDeleted ? styles.toggleChipActive : null]}>
          <Text style={[styles.toggleChipText, includeDeleted ? styles.toggleChipTextActive : null]}>
            {includeDeleted ? "Menampilkan Arsip" : "Sembunyikan Arsip"}
          </Text>
        </Pressable>
        <AppButton
          leftElement={<Ionicons color={theme.colors.textPrimary} name="refresh-outline" size={17} />}
          onPress={() => void loadStaff(true, true)}
          title="Refresh"
          variant="ghost"
        />
      </View>

      {loading ? (
        renderSkeletonList()
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={staff}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadStaff(true, true)}
          refreshing={refreshing}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada pegawai untuk filter saat ini.</Text>}
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
    staffCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    staffTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    staffTitleWrap: {
      flex: 1,
      gap: 1,
    },
    staffName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    staffEmail: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    staffMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
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
