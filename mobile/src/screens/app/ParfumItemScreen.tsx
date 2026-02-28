import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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

type TabType = "perfume" | "item";

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(Math.max(value, 0))}`;
}

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
  const scrollY = useRef(new Animated.Value(0)).current;

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  const [activeTab, setActiveTab] = useState<TabType>("perfume");
  const [items, setItems] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
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

  const visibleItems = useMemo(() => {
    const keyword = searchInput.trim().toLowerCase();
    if (!keyword) {
      return items;
    }

    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [items, searchInput]);

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.screenContent}>
        <ServiceModuleHeader onBack={() => navigation.goBack()} title="Parfum & Item" />
        <AppPanel style={styles.blockedPanel}>
          <Text style={styles.blockedTitle}>Parfum & Item</Text>
          <Text style={styles.blockedText}>Akun Anda tidak memiliki akses ke modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <Animated.View style={[styles.headerShell, { transform: [{ translateY: headerTranslateY }] }]}>
        <Animated.View style={[styles.headerMotionWrap, { transform: [{ scaleX: headerScaleX }, { scaleY: headerScaleY }] }]}>
          <ServiceModuleHeader onBack={() => navigation.goBack()} title="Parfum & Item" />
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
                  <Ionicons color={selected ? theme.colors.info : theme.colors.textSecondary} name={tab === "perfume" ? "flask-outline" : "shirt-outline"} size={16} />
                  <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>{tab === "perfume" ? "Parfum" : "Item"}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.toolbarMetaRow}>
            <StatusPill label={`${visibleItems.length} tampil`} tone="neutral" />
            <StatusPill label={activeTab === "perfume" ? "Tambahan aroma" : "Produk satuan"} tone={activeTab === "perfume" ? "info" : "warning"} />
          </View>

          <View style={styles.toolbarSearchWrap}>
            <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
            <TextInput
              onChangeText={setSearchInput}
              placeholder={activeTab === "perfume" ? "Cari nama parfum..." : "Cari nama item..."}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.toolbarSearchInput}
              value={searchInput}
            />
          </View>
        </AppPanel>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleItems}
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
            <Pressable
              disabled={!canManage}
              onPress={() =>
                navigation.navigate("ParfumItemForm", {
                  mode: "edit",
                  serviceType: activeTab,
                  item,
                })
              }
              style={({ pressed }) => [styles.listItem, canManage && pressed ? styles.listItemPressed : null]}
            >
              <View style={styles.listItemIconWrap}>
                <Ionicons color={activeTab === "perfume" ? theme.colors.info : theme.colors.warning} name={activeTab === "perfume" ? "flask-outline" : "shirt-outline"} size={20} />
              </View>

              <View style={styles.listItemCopy}>
                <View style={styles.listItemTitleRow}>
                  <Text style={styles.listItemTitle}>{item.name}</Text>
                  <Text style={styles.listItemPrice}>{formatMoney(item.base_price_amount)}</Text>
                </View>
                <Text style={styles.listItemMeta}>
                  {formatServiceDuration(item.duration_days, item.duration_hours)} • {(item.display_unit ?? "pcs").toUpperCase()}
                </Text>
              </View>

            </Pressable>
          )}
          scrollEnabled={false}
        />
      </Animated.ScrollView>

      {canManage ? (
        <Pressable
          onPress={() =>
            navigation.navigate("ParfumItemForm", {
              mode: "create",
              serviceType: activeTab,
            })
          }
          style={({ pressed }) => [styles.fabButton, pressed ? styles.fabButtonPressed : null]}
        >
          <Ionicons color={theme.colors.primaryContrast} name="add" size={30} />
        </Pressable>
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
      paddingHorizontal: 14,
      minHeight: 48,
    },
    toolbarSearchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingVertical: 0,
    },
    heroShell: {
      position: "relative",
      overflow: "hidden",
      borderRadius: isTablet ? 30 : 26,
      borderWidth: 1,
      borderColor: "rgba(120, 212, 236, 0.34)",
      backgroundColor: "#0d66bf",
      minHeight: isTablet ? 258 : 248,
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0d66bf",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -36,
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
    tabRow: {
      marginTop: 6,
      flexDirection: "row",
      gap: 8,
    },
    tabItem: {
      flex: 1,
      minHeight: 46,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
      borderRadius: theme.radii.pill,
      backgroundColor: "rgba(255,255,255,0.12)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    tabItemActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.surface,
    },
    tabText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    tabTextActive: {
      color: theme.colors.info,
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
      paddingRight: 12,
    },
    searchInput: {
      flex: 1,
      color: "#ffffff",
      fontFamily: theme.fonts.medium,
      fontSize: 13.5,
      paddingVertical: 12,
    },
    listContent: {
      gap: theme.spacing.sm,
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
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    listItemPressed: {
      opacity: 0.84,
    },
    listItemIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    listItemCopy: {
      flex: 1,
      gap: 2,
    },
    listItemTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    listItemTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 16,
      lineHeight: 21,
    },
    listItemPrice: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 13.5,
    },
    listItemMeta: {
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
  });
}
