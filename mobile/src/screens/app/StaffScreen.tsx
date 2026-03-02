import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { StatusPill } from "../../components/ui/StatusPill";
import { canManageStaffAssignment, getStaffMainRoleKey, getStaffRoleMeta } from "../../features/staff/staffHelpers";
import { listStaff } from "../../features/staff/staffApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { StaffMember } from "../../types/staff";

const STAFF_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 260;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length > 0 ? parts.map((part) => part.slice(0, 1).toUpperCase()).join("") : "ST";
}

function getStatus(item: StaffMember): { label: string; tone: "success" | "warning" | "neutral"; accent: string } {
  if (item.deleted_at) {
    return { label: "Arsip", tone: "warning", accent: "#dd8c10" };
  }
  if (item.status === "active") {
    return { label: "Aktif", tone: "success", accent: "#1f9e63" };
  }
  return { label: "Nonaktif", tone: "neutral", accent: "#6f8ba4" };
}

export function StaffScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Staff">>();
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin"]);
  const canCreate = hasAnyRole(roles, ["owner", "admin"]);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useFocusEffect(
    useCallback(() => {
      if (!canView) {
        setLoading(false);
        return;
      }

      void loadWorkspace(false, true, searchQuery);
    }, [canView, searchQuery])
  );

  async function loadWorkspace(isRefresh: boolean, forceRefresh = false, queryParam = searchQuery): Promise<void> {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const staffRows = await listStaff({ query: queryParam, limit: STAFF_LIMIT, includeDeleted: true, forceRefresh: isRefresh || forceRefresh });
      setStaff(staffRows);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function openCreateScreen(): void {
    navigation.navigate("StaffForm", { mode: "create" });
  }

  function openEditScreen(item: StaffMember): void {
    navigation.navigate("StaffForm", { mode: "edit", staff: item });
  }

  const visibleStaff = staff;

  function renderBlockedState() {
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
            <View pointerEvents="none" style={styles.heroIconPlaceholder} />
          </View>
          <Text style={styles.title}>Kelola Pegawai</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses untuk membuka modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  function renderSkeleton() {
    return (
      <View style={styles.listWrap}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`staff-skeleton-${index}`} style={styles.skeletonCard}>
            <View style={styles.skeletonHead}>
              <AppSkeletonBlock height={42} width={42} />
              <View style={styles.skeletonText}>
                <AppSkeletonBlock height={14} width="60%" />
                <AppSkeletonBlock height={11} width="78%" />
              </View>
            </View>
            <AppSkeletonBlock height={11} width="44%" />
            <AppSkeletonBlock height={11} width="85%" />
          </View>
        ))}
      </View>
    );
  }

  if (!canView) {
    return renderBlockedState();
  }

  return (
    <AppScreen contentContainerStyle={styles.screenShell}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: canCreate ? (isCompactLandscape ? 94 : 112) : theme.spacing.lg }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl onRefresh={() => void loadWorkspace(true, true, searchQuery)} refreshing={refreshing} />}
        showsVerticalScrollIndicator={false}
        style={styles.scrollBody}
      >
        <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="people-outline" size={15} />
            <Text style={styles.heroBadgeText}>Kelola Pegawai</Text>
          </View>
          <View pointerEvents="none" style={styles.heroIconPlaceholder} />
        </View>

        <Text style={styles.title}>Kelola Pegawai</Text>
        <Text style={styles.subtitle}>
          {selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet"} - Pantau akun tim, role, dan assignment outlet.
        </Text>
      </AppPanel>

      <View style={styles.searchWrap}>
        <View style={styles.searchInputWrap}>
          <Ionicons color={theme.colors.textMuted} name="search-outline" size={17} />
          <TextInput
            onChangeText={setSearchInput}
            placeholder="Cari nama, email, atau no HP pegawai..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={searchInput}
          />
          {searchInput ? (
            <Pressable onPress={() => setSearchInput("")} style={({ pressed }) => [styles.clearSearchButton, pressed ? styles.clearSearchButtonPressed : null]}>
              <Ionicons color={theme.colors.textMuted} name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.resultInfo}>{visibleStaff.length} pegawai ditampilkan</Text>
      {errorMessage ? (
        <View style={styles.feedbackError}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.feedbackErrorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <AppPanel style={styles.panel}>
        <View style={styles.listHead}>
          <View>
            <Text style={styles.listEyebrow}>Roster</Text>
            <Text style={styles.listTitle}>Tim Operasional</Text>
          </View>
          <StatusPill label={`${visibleStaff.length} akun`} tone="info" />
        </View>

        {loading ? (
          renderSkeleton()
        ) : visibleStaff.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons color={theme.colors.info} name="people-outline" size={22} />
            </View>
            <Text style={styles.emptyTitle}>Tidak ada pegawai ditemukan</Text>
            <Text style={styles.emptyText}>{searchQuery ? "Coba ubah kata kunci pencarian agar akun yang dicari muncul." : canCreate ? "Belum ada akun pegawai. Gunakan tombol + di kanan bawah untuk menambah pegawai pertama." : "Belum ada akun pegawai yang terdaftar untuk outlet ini."}</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {visibleStaff.map((item) => {
              const status = getStatus(item);
              const roleMeta = getStaffRoleMeta(getStaffMainRoleKey(item));
              const editable = canManageStaffAssignment(roles, session?.user.id, item);
              const isSelf = item.id === session?.user.id;
              const outletLabel = item.outlets.map((outlet) => outlet.code).join(", ") || "Belum ada outlet";

              return (
                <Pressable
                  key={item.id}
                  accessibilityRole={editable ? "button" : undefined}
                  disabled={!editable}
                  onPress={() => openEditScreen(item)}
                  style={({ pressed }) => [
                    styles.staffCard,
                    editable ? styles.staffCardInteractive : null,
                    editable && pressed ? styles.staffCardPressed : null,
                  ]}
                >
                  <View style={styles.staffTop}>
                    <View style={styles.staffIdentity}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                      </View>
                      <View style={styles.staffTitleWrap}>
                        <View style={styles.staffNameRow}>
                          <Text numberOfLines={1} style={styles.staffName}>{item.name}</Text>
                          {isSelf ? <StatusPill label="Akun Anda" tone="info" /> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.staffEmail}>{item.email}</Text>
                      </View>
                    </View>
                    <View style={styles.staffTrailing}>
                      <StatusPill label={status.label} tone={status.tone} />
                      {editable ? <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} /> : null}
                    </View>
                  </View>

                  <View style={styles.staffMetaLine}>
                    <View style={styles.staffMetaItem}>
                      <Ionicons color={theme.colors.info} name={roleMeta.icon} size={14} />
                      <Text style={styles.staffMetaText}>{roleMeta.label}</Text>
                    </View>
                    <Text style={styles.staffMetaDivider}>•</Text>
                    <View style={[styles.staffMetaItem, styles.staffMetaItemWide]}>
                      <Ionicons color={theme.colors.textMuted} name="business-outline" size={14} />
                      <Text numberOfLines={1} style={styles.staffMetaText}>{outletLabel}</Text>
                    </View>
                  </View>

                  {!editable ? <Text style={styles.lockedText}>{isSelf ? "Akun ini sedang Anda gunakan." : "Role ini tidak bisa Anda kelola."}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        </AppPanel>
      </ScrollView>

      {canCreate ? (
        <Pressable onPress={openCreateScreen} style={({ pressed }) => [styles.fabButton, pressed ? styles.fabButtonPressed : null]}>
          <Ionicons color={theme.colors.primaryContrast} name="add" size={30} />
        </Pressable>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    screenShell: { flex: 1 },
    scrollBody: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg, paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
    heroPanel: { gap: theme.spacing.xs, backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff", borderColor: theme.colors.borderStrong },
    heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing.sm },
    heroIconButton: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    heroIconButtonPressed: { opacity: 0.82 },
    heroBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill, backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.92)", paddingHorizontal: 10, paddingVertical: 5 },
    heroBadgeText: { color: theme.colors.info, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.2, textTransform: "uppercase" },
    heroIconPlaceholder: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, width: 36, height: 36, opacity: 0.38 },
    title: { color: theme.colors.textPrimary, fontFamily: theme.fonts.heavy, fontSize: isTablet ? 27 : 24, lineHeight: isTablet ? 33 : 30 },
    subtitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 12.5, lineHeight: 18 },
    panel: { gap: theme.spacing.sm },
    searchWrap: { gap: theme.spacing.xs },
    searchInputWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.md, backgroundColor: theme.colors.inputBg, paddingHorizontal: 12, minHeight: 46 },
    searchInput: { flex: 1, color: theme.colors.textPrimary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 14 : 13, paddingVertical: 10 },
    clearSearchButton: { borderRadius: theme.radii.pill, padding: 2 },
    clearSearchButtonPressed: { opacity: 0.72 },
    resultInfo: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 17, marginTop: -2 },
    feedbackError: { borderWidth: 1, borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5", borderRadius: theme.radii.md, backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
    feedbackErrorText: { flex: 1, color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 18 },
    listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    listEyebrow: { color: theme.colors.textMuted, fontFamily: theme.fonts.semibold, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 },
    listTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 19, lineHeight: 24 },
    listWrap: { gap: theme.spacing.xs },
    skeletonCard: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
    skeletonHead: { flexDirection: "row", alignItems: "center", gap: 10 },
    skeletonText: { flex: 1, gap: 7 },
    emptyWrap: { alignItems: "center", gap: 8, paddingVertical: 18, paddingHorizontal: theme.spacing.md },
    emptyIconWrap: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" },
    emptyTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 15, textAlign: "center" },
    emptyText: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 18, textAlign: "center" },
    staffCard: { borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
    staffCardInteractive: { shadowColor: theme.shadows.color, shadowOpacity: theme.mode === "dark" ? 0.12 : 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    staffCardPressed: { opacity: 0.94, transform: [{ scale: 0.992 }] },
    staffTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: theme.spacing.sm },
    staffIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.mode === "dark" ? "#173a56" : "#e9f5ff", alignItems: "center", justifyContent: "center" },
    avatarText: { color: theme.colors.info, fontFamily: theme.fonts.bold, fontSize: 14 },
    staffTitleWrap: { flex: 1, gap: 1, minWidth: 0 },
    staffNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    staffName: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 14.5, lineHeight: 19, maxWidth: "100%" },
    staffEmail: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 17 },
    staffTrailing: { flexDirection: "row", alignItems: "center", gap: 4 },
    staffMetaLine: { flexDirection: "row", alignItems: "center", gap: 8 },
    staffMetaItem: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
    staffMetaItemWide: { flex: 1 },
    staffMetaDivider: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: 12 },
    staffMetaText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 12, lineHeight: 17 },
    lockedText: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: 11.5, lineHeight: 16, paddingTop: 2 },
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
    fabButtonPressed: { opacity: 0.94, transform: [{ scale: 0.98 }] },
  });
}
