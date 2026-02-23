import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { archiveService, listServices, restoreService } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { ServiceCatalogItem } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type TabType = "perfume" | "item";

export function ParfumItemScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ParfumItem">>();
  const { session, selectedOutlet } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  const [activeTab, setActiveTab] = useState<TabType>("perfume");
  const [items, setItems] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ServiceCatalogItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadItems = useCallback(
    async (tab: TabType, isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await listServices({
          outletId: selectedOutlet?.id,
          serviceType: tab,
          isGroup: false,
          parentId: null,
          active: true,
          forceRefresh: isRefresh,
          sort: "name",
        });
        setItems(data);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedOutlet?.id]
  );

  useFocusEffect(
    useCallback(() => {
      if (!canView) {
        setLoading(false);
        return;
      }

      void loadItems(activeTab, true);
    }, [activeTab, canView, loadItems])
  );

  async function handleArchiveToggle(item: ServiceCatalogItem): Promise<void> {
    if (!canManage || busyId) {
      return;
    }

    setBusyId(item.id);
    try {
      if (item.deleted_at) {
        await restoreService(item.id);
      } else {
        await archiveService(item.id);
      }
      setActionTarget(null);
      await loadItems(activeTab, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.headerPanel}>
          <Text style={styles.title}>Parfum & Item</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses ke modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.headerPanel}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <Text style={styles.title}>Parfum & Item</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.subtitle}>{outletLabel}</Text>
      </AppPanel>

      <View style={styles.tabRow}>
        {(["perfume", "item"] as const).map((tab) => {
          const selected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                setActiveTab(tab);
                void loadItems(tab, true);
              }}
              style={[styles.tabItem, selected ? styles.tabItemActive : null]}
            >
              <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>{tab === "perfume" ? "PARFUM" : "ITEM"}</Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <AppPanel style={styles.emptyPanel}>
            <Ionicons color={theme.colors.info} name={activeTab === "perfume" ? "flask-outline" : "shirt-outline"} size={54} />
            <Text style={styles.emptyTitle}>Belum ada data {activeTab === "perfume" ? "parfum" : "item"}.</Text>
            <Text style={styles.emptyText}>Tambah data baru agar bisa dipilih di transaksi.</Text>
          </AppPanel>
        }
        onRefresh={() => void loadItems(activeTab, true)}
        refreshing={refreshing}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.listItemTitle}>{item.name}</Text>
            {canManage ? (
              <Pressable onPress={() => setActionTarget(item)} style={styles.kebabButton}>
                <Ionicons color={theme.colors.warning} name="ellipsis-horizontal" size={20} />
              </Pressable>
            ) : null}
          </View>
        )}
        scrollEnabled={false}
      />

      {actionTarget && canManage ? (
        <AppPanel style={styles.actionPanel}>
          <Text style={styles.actionTitle}>{actionTarget.name}</Text>
          <View style={styles.actionButtonWrap}>
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="create-outline" size={16} />}
              onPress={() => {
                navigation.navigate("ParfumItemForm", {
                  mode: "edit",
                  serviceType: activeTab,
                  item: actionTarget,
                });
                setActionTarget(null);
              }}
              title="Edit"
              variant="secondary"
            />
          </View>
          <View style={styles.actionButtonWrap}>
            <AppButton
              disabled={busyId === actionTarget.id}
              loading={busyId === actionTarget.id}
              onPress={() => void handleArchiveToggle(actionTarget)}
              title={actionTarget.deleted_at ? "Restore" : "Arsipkan"}
              variant="ghost"
            />
          </View>
          <View style={styles.actionButtonWrap}>
            <AppButton onPress={() => setActionTarget(null)} title="Tutup" variant="ghost" />
          </View>
        </AppPanel>
      ) : null}

      {canManage ? (
        <Pressable
          onPress={() =>
            navigation.navigate("ParfumItemForm", {
              mode: "create",
              serviceType: activeTab,
            })
          }
          style={styles.fabButton}
        >
          <Ionicons color={theme.colors.primaryContrast} name="add" size={30} />
        </Pressable>
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
      paddingBottom: 120,
      gap: theme.spacing.sm,
    },
    headerPanel: {
      backgroundColor: theme.mode === "dark" ? "#12304a" : "#f7f9fb",
      gap: theme.spacing.xs,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    headerIconButton: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconButtonPressed: {
      opacity: 0.82,
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    title: {
      flex: 1,
      textAlign: "center",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 30 : 24,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
    },
    tabRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      borderRadius: theme.radii.md,
      overflow: "hidden",
      backgroundColor: theme.colors.surface,
    },
    tabItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },
    tabItemActive: {
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    tabText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      letterSpacing: 0.3,
    },
    tabTextActive: {
      color: theme.colors.info,
    },
    listContent: {
      gap: theme.spacing.xs,
    },
    emptyPanel: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 28,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      textAlign: "center",
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
    },
    listItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    listItemTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 18,
      lineHeight: 23,
    },
    kebabButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    actionPanel: {
      gap: theme.spacing.xs,
    },
    actionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    actionButtonWrap: {
      width: "100%",
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
    fabButton: {
      position: "absolute",
      right: 24,
      bottom: 30,
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: theme.colors.info,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.info,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
  });
}
