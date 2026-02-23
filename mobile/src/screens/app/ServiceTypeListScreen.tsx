import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
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

type ServiceTypeListRoute = RouteProp<AccountStackParamList, "ServiceTypeList">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `${currencyFormatter.format(value)}`;
}

function buildVariantMeta(item: ServiceCatalogItem): string {
  const parts: string[] = [];
  if (item.duration_days) {
    parts.push(`${item.duration_days} Hari`);
  }

  const displayUnit = item.display_unit ?? "satuan";
  parts.push(displayUnit === "satuan" ? "Satuan" : displayUnit.toUpperCase());

  if (item.service_type === "package" && item.package_quota_value && item.package_quota_unit) {
    parts.push(`${item.package_quota_value} ${item.package_quota_unit.toUpperCase()}`);
  }

  return parts.join(" • ");
}

function resolveServiceIcon(iconName: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (iconName && iconName in Ionicons.glyphMap) {
    return iconName as keyof typeof Ionicons.glyphMap;
  }

  return "shirt-outline";
}

type ActionTarget =
  | {
      kind: "group";
      item: ServiceCatalogItem;
    }
  | {
      kind: "variant";
      item: ServiceCatalogItem;
    };

export function ServiceTypeListScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ServiceTypeList">>();
  const route = useRoute<ServiceTypeListRoute>();
  const { session, selectedOutlet } = useSession();
  const serviceType = route.params.serviceType;
  const title = route.params.title;

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<ServiceCatalogItem[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  const loadGroups = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await listServices({
          outletId: selectedOutlet?.id,
          active: true,
          serviceType,
          isGroup: true,
          parentId: null,
          withChildren: true,
          forceRefresh: isRefresh,
        });
        setGroups(data);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serviceType, selectedOutlet?.id]
  );

  useFocusEffect(
    useCallback(() => {
      if (!canView) {
        setLoading(false);
        return;
      }

      void loadGroups(true);
    }, [canView, loadGroups])
  );

  const visibleGroups = useMemo(() => {
    const keyword = searchInput.trim().toLowerCase();
    if (!keyword) {
      return groups;
    }

    return groups
      .map((group) => {
        const matchedGroup = group.name.toLowerCase().includes(keyword);
        const matchedChildren = group.children.filter((child) => child.name.toLowerCase().includes(keyword));
        if (matchedGroup) {
          return group;
        }

        if (matchedChildren.length > 0) {
          return {
            ...group,
            children: matchedChildren,
          };
        }

        return null;
      })
      .filter((item): item is ServiceCatalogItem => !!item);
  }, [groups, searchInput]);

  async function handleToggleArchive(item: ServiceCatalogItem): Promise<void> {
    if (!canManage || busyServiceId) {
      return;
    }

    setBusyServiceId(item.id);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreService(item.id);
        setActionMessage(`"${item.name}" berhasil dipulihkan.`);
      } else {
        await archiveService(item.id);
        setActionMessage(`"${item.name}" berhasil diarsipkan.`);
      }

      setActionTarget(null);
      await loadGroups(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBusyServiceId(null);
    }
  }

  function openEdit(target: ActionTarget): void {
    if (!canManage) {
      return;
    }

    if (target.kind === "group") {
      navigation.navigate("ServiceGroupForm", {
        mode: "edit",
        serviceType,
        group: target.item,
      });
      setActionTarget(null);
      return;
    }

    navigation.navigate("ServiceVariantForm", {
      mode: "edit",
      serviceType,
      variant: target.item,
      parentServiceId: target.item.parent_service_id,
    });
    setActionTarget(null);
  }

  function renderGroupItem(group: ServiceCatalogItem) {
    return (
      <View key={group.id} style={styles.groupBlock}>
        <View style={styles.groupHeader}>
          <View style={styles.groupHeaderText}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupMeta}>{group.process_summary || "Tanpa tag proses"}</Text>
          </View>
          {canManage ? (
            <Pressable onPress={() => setActionTarget({ kind: "group", item: group })} style={styles.kebabButton}>
              <Ionicons color={theme.colors.warning} name="ellipsis-horizontal" size={20} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.variantList}>
          {group.children.length === 0 ? <Text style={styles.emptyVariant}>Belum ada varian pada group ini.</Text> : null}
          {group.children.map((child) => (
            <View key={child.id} style={styles.variantItem}>
              <View style={styles.variantIconWrap}>
                <Ionicons color={theme.colors.info} name={resolveServiceIcon(child.image_icon)} size={24} />
              </View>
              <View style={styles.variantTextWrap}>
                <Text style={styles.variantName}>{child.name}</Text>
                <Text style={styles.variantPrice}>{formatMoney(child.effective_price_amount)}</Text>
                <Text style={styles.variantMeta}>{buildVariantMeta(child)}</Text>
              </View>
              {canManage ? (
                <Pressable onPress={() => setActionTarget({ kind: "variant", item: child })} style={styles.kebabButton}>
                  <Ionicons color={theme.colors.warning} name="ellipsis-horizontal" size={20} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.headerPanel}>
          <Text style={styles.title}>{title}</Text>
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
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerActions}>
            {canManage ? (
              <Pressable
                onPress={() => navigation.navigate("ProcessTagManager")}
                style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}
              >
                <Ionicons color={theme.colors.info} name="pricetags-outline" size={18} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setSearchVisible((value) => !value)} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="search-outline" size={18} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>{outletLabel}</Text>
        {searchVisible ? (
          <View style={styles.searchRow}>
            <Ionicons color={theme.colors.textMuted} name="search-outline" size={16} />
            <TextInput
              onChangeText={setSearchInput}
              placeholder="Cari group atau varian..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.searchInput}
              value={searchInput}
            />
          </View>
        ) : null}
      </AppPanel>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {actionMessage ? (
        <View style={styles.successWrap}>
          <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{actionMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <AppPanel style={styles.groupBlock}>
          <Text style={styles.emptyVariant}>Memuat data layanan...</Text>
        </AppPanel>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleGroups}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<AppPanel style={styles.groupBlock}><Text style={styles.emptyVariant}>Tidak ada data layanan.</Text></AppPanel>}
          onRefresh={() => void loadGroups(true)}
          refreshing={refreshing}
          renderItem={({ item }) => renderGroupItem(item)}
          scrollEnabled={false}
        />
      )}

      {actionTarget && canManage ? (
        <AppPanel style={styles.actionMenuPanel}>
          <Text style={styles.actionMenuTitle}>{actionTarget.kind === "group" ? "Aksi Group" : "Aksi Varian"}</Text>
          <Text style={styles.actionMenuName}>{actionTarget.item.name}</Text>
          <View style={styles.actionMenuButtons}>
            <View style={styles.actionMenuButtonItem}>
              <AppButton
                leftElement={<Ionicons color={theme.colors.info} name="create-outline" size={16} />}
                onPress={() => openEdit(actionTarget)}
                title="Edit"
                variant="secondary"
              />
            </View>
            <View style={styles.actionMenuButtonItem}>
              <AppButton
                disabled={busyServiceId === actionTarget.item.id}
                leftElement={<Ionicons color={theme.colors.textPrimary} name={actionTarget.item.deleted_at ? "refresh-outline" : "archive-outline"} size={16} />}
                loading={busyServiceId === actionTarget.item.id}
                onPress={() => void handleToggleArchive(actionTarget.item)}
                title={actionTarget.item.deleted_at ? "Restore" : "Arsipkan"}
                variant="ghost"
              />
            </View>
            <View style={styles.actionMenuButtonItem}>
              <AppButton onPress={() => setActionTarget(null)} title="Tutup" variant="ghost" />
            </View>
          </View>
        </AppPanel>
      ) : null}

      {canManage ? (
        <>
          {fabOpen ? (
            <View style={styles.fabMenu}>
              <Pressable
                onPress={() => {
                  setFabOpen(false);
                  navigation.navigate("ServiceVariantForm", {
                    mode: "create",
                    serviceType,
                    parentServiceId: groups[0]?.id ?? null,
                  });
                }}
                style={styles.fabMenuItem}
              >
                <Ionicons color={theme.colors.primaryContrast} name="cube-outline" size={18} />
                <Text style={styles.fabMenuText}>Tambah Varian</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFabOpen(false);
                  navigation.navigate("ServiceGroupForm", {
                    mode: "create",
                    serviceType,
                  });
                }}
                style={styles.fabMenuItem}
              >
                <Ionicons color={theme.colors.primaryContrast} name="albums-outline" size={18} />
                <Text style={styles.fabMenuText}>Tambah Group</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable onPress={() => setFabOpen((value) => !value)} style={styles.fabButton}>
            <Ionicons color={theme.colors.primaryContrast} name={fabOpen ? "close" : "add"} size={30} />
          </Pressable>
        </>
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
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
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
    title: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 30 : 24,
      lineHeight: isTablet ? 36 : 30,
      textAlign: "center",
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13.5,
      paddingVertical: 10,
    },
    listContent: {
      gap: theme.spacing.sm,
    },
    groupBlock: {
      gap: theme.spacing.xs,
      paddingVertical: 12,
    },
    groupHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    groupHeaderText: {
      flex: 1,
      gap: 1,
    },
    groupName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 17,
      lineHeight: 22,
    },
    groupMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    kebabButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    variantList: {
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 10,
    },
    emptyVariant: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
      paddingVertical: 8,
    },
    variantItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    variantIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    variantTextWrap: {
      flex: 1,
      gap: 1,
    },
    variantName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 16,
      lineHeight: 20,
    },
    variantPrice: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 20,
    },
    variantMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
    actionMenuPanel: {
      gap: theme.spacing.xs,
    },
    actionMenuTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    actionMenuName: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    actionMenuButtons: {
      gap: 8,
    },
    actionMenuButtonItem: {
      width: "100%",
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
    fabMenu: {
      position: "absolute",
      right: 24,
      bottom: 106,
      gap: 10,
    },
    fabMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.info,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: theme.colors.info,
      shadowOpacity: 0.26,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    fabMenuText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
  });
}
