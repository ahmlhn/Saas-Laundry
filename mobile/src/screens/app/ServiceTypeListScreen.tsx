import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { ServiceModuleHeader } from "../../components/services/ServiceModuleHeader";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { listServices } from "../../features/services/serviceApi";
import { formatServiceDuration } from "../../features/services/defaultDuration";
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
  return `Rp ${currencyFormatter.format(value)}`;
}

function buildVariantMeta(item: ServiceCatalogItem): string {
  const parts: string[] = [];
  parts.push(formatServiceDuration(item.duration_days, item.duration_hours, "Tanpa durasi"));

  const displayUnit = item.display_unit ?? "pcs";
  parts.push(displayUnit.toUpperCase());

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
  const scrollY = useRef(new Animated.Value(0)).current;
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
  const [fabOpen, setFabOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 96],
    outputRange: [0, -6],
    extrapolate: "clamp",
  });
  const headerScaleX = scrollY.interpolate({
    inputRange: [0, 96],
    outputRange: [1, 0.94],
    extrapolate: "clamp",
  });
  const headerScaleY = scrollY.interpolate({
    inputRange: [0, 96],
    outputRange: [1, 0.86],
    extrapolate: "clamp",
  });

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

  const totalVariants = useMemo(() => groups.reduce((total, group) => total + group.children.length, 0), [groups]);

  function renderGroupItem(group: ServiceCatalogItem) {
    const headerContent = (
      <View style={styles.groupHeader}>
        <View style={styles.groupHeaderLeft}>
          <View style={styles.groupIconWrap}>
            <Ionicons color={theme.colors.info} name="albums-outline" size={18} />
          </View>
          <View style={styles.groupHeaderCopy}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupMeta}>{group.process_summary || "Tanpa tag proses"}</Text>
          </View>
        </View>

        <View style={styles.groupHeaderRight}>
          <StatusPill label={`${group.children.length} varian`} tone="neutral" />
        </View>
      </View>
    );

    return (
      <AppPanel key={group.id} style={styles.groupCard}>
        {canManage ? (
          <Pressable
            onPress={() =>
              navigation.navigate("ServiceGroupForm", {
                mode: "edit",
                serviceType,
                group,
              })
            }
            style={({ pressed }) => [styles.groupHeaderPressable, pressed ? styles.listItemPressed : null]}
          >
            {headerContent}
          </Pressable>
        ) : (
          headerContent
        )}

        <View style={styles.variantList}>
          {group.children.length === 0 ? <Text style={styles.emptyVariant}>Belum ada varian pada group ini.</Text> : null}
          {group.children.map((child) => (
            <Pressable
              key={child.id}
              disabled={!canManage}
              onPress={() =>
                navigation.navigate("ServiceVariantForm", {
                  mode: "edit",
                  serviceType,
                  variant: child,
                  parentServiceId: child.parent_service_id,
                })
              }
              style={({ pressed }) => [styles.variantItem, canManage && pressed ? styles.listItemPressed : null]}
            >
              <View style={styles.variantIconWrap}>
                <Ionicons color={theme.colors.info} name={resolveServiceIcon(child.image_icon)} size={22} />
              </View>
              <View style={styles.variantTextWrap}>
                <View style={styles.variantTitleRow}>
                  <Text style={styles.variantName}>{child.name}</Text>
                  <Text style={styles.variantPrice}>{formatMoney(child.effective_price_amount)}</Text>
                </View>
                <Text style={styles.variantMeta}>{buildVariantMeta(child)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </AppPanel>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.screenContent}>
        <ServiceModuleHeader onBack={() => navigation.goBack()} title={title} />
        <AppPanel style={styles.blockedPanel}>
          <Text style={styles.blockedTitle}>{title}</Text>
          <Text style={styles.blockedText}>Akun Anda tidak memiliki akses ke modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <Animated.View style={[styles.headerShell, { transform: [{ translateY: headerTranslateY }] }]}>
        <Animated.View style={[styles.headerMotionWrap, { transform: [{ scaleX: headerScaleX }, { scaleY: headerScaleY }] }]}>
          <ServiceModuleHeader
            onBack={() => navigation.goBack()}
            rightSlot={
              canManage ? (
                <Pressable onPress={() => navigation.navigate("ProcessTagManager")} style={({ pressed }) => [styles.headerActionButton, pressed ? styles.headerActionButtonPressed : null]}>
                  <Ionicons color={theme.colors.textSecondary} name="pricetags-outline" size={17} />
                </Pressable>
              ) : undefined
            }
            title={title}
          />
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        <AppPanel style={styles.toolbarPanel}>
          <Text style={styles.toolbarOutlet}>{outletLabel}</Text>

          <View style={styles.toolbarMetaRow}>
            <StatusPill label={`${visibleGroups.length} group`} tone="neutral" />
            <StatusPill label={`${totalVariants} varian`} tone="neutral" />
            <StatusPill label={serviceType === "package" ? "Mode paket" : "Mode reguler"} tone={serviceType === "package" ? "success" : "info"} />
          </View>

          <View style={styles.toolbarSearchWrap}>
            <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
            <TextInput
              onChangeText={setSearchInput}
              placeholder="Cari group atau varian layanan..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.toolbarSearchInput}
              value={searchInput}
            />
            <Pressable onPress={() => setSearchVisible((value) => !value)} style={({ pressed }) => [styles.headerActionButton, pressed ? styles.headerActionButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name={searchVisible ? "close-outline" : "options-outline"} size={17} />
            </Pressable>
          </View>

          {searchVisible ? <Text style={styles.toolbarHint}>Pencarian akan mencocokkan nama group dan nama varian secara langsung.</Text> : null}
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
          <AppPanel style={styles.groupCard}>
            <Text style={styles.emptyVariant}>Memuat data layanan...</Text>
          </AppPanel>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={visibleGroups}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <AppPanel style={styles.groupCard}>
                <Text style={styles.emptyVariant}>Tidak ada data layanan.</Text>
              </AppPanel>
            }
            onRefresh={() => void loadGroups(true)}
            refreshing={refreshing}
            renderItem={({ item }) => renderGroupItem(item)}
            scrollEnabled={false}
          />
        )}

      </Animated.ScrollView>
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
                style={({ pressed }) => [styles.fabMenuItem, pressed ? styles.fabMenuItemPressed : null]}
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
                style={({ pressed }) => [styles.fabMenuItem, pressed ? styles.fabMenuItemPressed : null]}
              >
                <Ionicons color={theme.colors.primaryContrast} name="albums-outline" size={18} />
                <Text style={styles.fabMenuText}>Tambah Group</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable onPress={() => setFabOpen((value) => !value)} style={({ pressed }) => [styles.fabButton, pressed ? styles.fabButtonPressed : null]}>
            <Ionicons color={theme.colors.primaryContrast} name={fabOpen ? "close" : "add"} size={30} />
          </Pressable>
        </>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  const headerTopPadding = isCompactLandscape ? theme.spacing.xs : theme.spacing.sm;
  const headerReservedHeight = headerTopPadding + theme.spacing.sm + 72;

  return StyleSheet.create({
    screenContent: {
      flex: 1,
      paddingTop: 0,
    },
    headerShell: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3,
      backgroundColor: "transparent",
      paddingTop: headerTopPadding,
      paddingBottom: theme.spacing.xs,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
    },
    headerMotionWrap: {
      transformOrigin: "center top",
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: headerReservedHeight,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingBottom: 120,
      gap: theme.spacing.sm,
    },
    toolbarPanel: {
      gap: theme.spacing.sm,
    },
    toolbarOutlet: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 18,
    },
    toolbarMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    toolbarSearchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingLeft: 14,
      paddingRight: 6,
      minHeight: 48,
    },
    toolbarSearchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingVertical: 0,
    },
    toolbarHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    headerActionButton: {
      width: 32,
      height: 32,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerActionButtonPressed: {
      opacity: 0.82,
    },
    heroShell: {
      position: "relative",
      overflow: "hidden",
      borderRadius: isTablet ? 30 : 26,
      borderWidth: 1,
      borderColor: "rgba(120, 212, 236, 0.34)",
      backgroundColor: "#0d66bf",
      minHeight: isTablet ? 250 : 244,
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0d66bf",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -30,
      bottom: 0,
      width: "68%",
      backgroundColor: "#19b6dc",
      opacity: 0.62,
    },
    heroGlowLarge: {
      position: "absolute",
      top: -96,
      right: -86,
      width: 248,
      height: 248,
      borderRadius: 140,
      borderWidth: 36,
      borderColor: "rgba(255,255,255,0.1)",
    },
    heroGlowSmall: {
      position: "absolute",
      left: -72,
      bottom: -124,
      width: 208,
      height: 208,
      borderRadius: 120,
      backgroundColor: "rgba(255,255,255,0.1)",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroCenterWrap: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    heroActionWrap: {
      width: 40,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    heroSpacer: {
      width: 40,
      height: 40,
    },
    heroTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 28 : 23,
      lineHeight: isTablet ? 34 : 28,
      textAlign: "center",
    },
    heroOutlet: {
      color: "rgba(233,247,255,0.94)",
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textAlign: "center",
    },
    heroMetaRow: {
      marginTop: 6,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: theme.spacing.xs,
    },
    searchWrap: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)",
      borderRadius: theme.radii.lg,
      backgroundColor: "rgba(255,255,255,0.12)",
      minHeight: 50,
      paddingLeft: 14,
      paddingRight: 8,
    },
    searchInput: {
      flex: 1,
      color: "#ffffff",
      fontFamily: theme.fonts.medium,
      fontSize: 13.5,
      paddingVertical: 12,
    },
    searchTuner: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    searchHint: {
      color: "rgba(228,243,255,0.8)",
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    listContent: {
      gap: theme.spacing.sm,
    },
    groupCard: {
      gap: theme.spacing.sm,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    groupHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    groupHeaderPressable: {
      borderRadius: theme.radii.lg,
      marginHorizontal: -4,
      marginTop: -4,
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 6,
    },
    groupHeaderLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    groupIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    groupHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    groupHeaderRight: {
      alignItems: "flex-end",
      gap: 8,
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
      fontSize: 12.5,
      lineHeight: 18,
    },
    listItemPressed: {
      opacity: 0.84,
    },
    variantList: {
      gap: 10,
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
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    variantIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    variantTextWrap: {
      flex: 1,
      gap: 2,
    },
    variantTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    variantName: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 15.5,
      lineHeight: 20,
    },
    variantPrice: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      lineHeight: 20,
    },
    variantMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
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
    blockedPanel: {
      gap: theme.spacing.xs,
    },
    blockedTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 24,
      lineHeight: 30,
      textAlign: "center",
    },
    blockedText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
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
    fabButtonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.99 }],
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
    fabMenuItemPressed: {
      opacity: 0.86,
    },
    fabMenuText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
  });
}
