import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { hasAnyRole } from "../../lib/accessControl";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

interface MenuItem {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "info" | "warning" | "success" | "neutral";
  statusLabel?: string;
  locked?: boolean;
  onPress: () => void;
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
  const { session } = useSession();
  const scrollY = useRef(new Animated.Value(0)).current;
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
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
  const titleScale = scrollY.interpolate({
    inputRange: [0, 96],
    outputRange: [1, 0.96],
    extrapolate: "clamp",
  });

  const serviceItems: MenuItem[] = [
    {
      id: "regular",
      label: "Layanan Reguler",
      description: "Kelola group dan varian layanan harian seperti kiloan atau satuan.",
      icon: "shirt-outline",
      tone: "info",
      statusLabel: "Aktif",
      onPress: () =>
        navigation.navigate("ServiceTypeList", {
          serviceType: "regular",
          title: "Layanan Reguler",
        }),
    },
    {
      id: "package",
      label: "Layanan Paket",
      description: "Atur paket berkuota, masa berlaku, dan struktur harga paket laundry.",
      icon: "layers-outline",
      tone: "success",
      statusLabel: "Paket",
      onPress: () =>
        navigation.navigate("ServiceTypeList", {
          serviceType: "package",
          title: "Layanan Paket",
        }),
    },
    {
      id: "parfum",
      label: "Parfum dan Item",
      description: "Kelola parfum tambahan dan item satuan pendukung operasional.",
      icon: "flask-outline",
      tone: "warning",
      statusLabel: "Tambahan",
      onPress: () => navigation.navigate("ParfumItem"),
    },
    {
      id: "promo",
      label: "Promo",
      description: "Buat promo aktif untuk layanan, paket, atau skema diskon khusus.",
      icon: "pricetags-outline",
      tone: "neutral",
      statusLabel: "Promo",
      onPress: () => navigation.navigate("Promo"),
    },
    {
      id: "copy",
      label: "Salin Layanan",
      description: "Siapkan salin template layanan lintas outlet saat modul sinkron siap.",
      icon: "copy-outline",
      tone: "neutral",
      locked: true,
      statusLabel: "Segera",
      onPress: () => undefined,
    },
  ];

  const inventoryItems: MenuItem[] = [
    {
      id: "category",
      label: "Kategori & Satuan",
      description: "Susun kategori produk, bahan baku, dan satuan stok utama.",
      icon: "apps-outline",
      tone: "info",
      statusLabel: "Draft",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Kategori & Satuan",
          description: "Struktur kategori produk dan satuan stok akan hadir di rilis berikutnya.",
        }),
    },
    {
      id: "product",
      label: "Daftar Produk",
      description: "Master data bahan baku dan produk operasional laundry.",
      icon: "clipboard-outline",
      tone: "success",
      statusLabel: "Draft",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Daftar Produk",
          description: "Master data produk bahan baku sedang disiapkan.",
        }),
    },
    {
      id: "purchase",
      label: "Pembelian Produk",
      description: "Catat pembelian bahan baku dan update nilai stok masuk.",
      icon: "cart-outline",
      tone: "warning",
      statusLabel: "Segera",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Pembelian Produk",
          description: "Fitur pembelian produk akan tersedia setelah modul inventory inti siap.",
        }),
    },
    {
      id: "stock",
      label: "Stok Opname",
      description: "Cocokkan stok aktual dengan data sistem secara berkala.",
      icon: "cube-outline",
      tone: "neutral",
      statusLabel: "Segera",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Stok Opname",
          description: "Fitur stok opname akan tersedia di fase berikutnya.",
        }),
    },
  ];

  function toneColor(tone: MenuItem["tone"]): string {
    if (tone === "success") {
      return theme.colors.success;
    }
    if (tone === "warning") {
      return theme.colors.warning;
    }
    if (tone === "neutral") {
      return theme.colors.textSecondary;
    }

    return theme.colors.info;
  }

  function renderSection(title: string, eyebrow: string, items: MenuItem[]) {
    return (
      <AppPanel style={styles.sectionPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          <Text style={styles.sectionCount}>{items.length} modul</Text>
        </View>

        <View style={styles.cardGrid}>
          {items.map((item) => {
            const disabled = item.locked || (!canManage && title === "Layanan" && item.id === "copy");
            const accent = toneColor(item.tone);

            return (
              <Pressable
                disabled={disabled}
                key={item.id}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.moduleCard,
                  { borderColor: disabled ? theme.colors.border : `${accent}26` },
                  disabled ? styles.moduleCardDisabled : null,
                  pressed && !disabled ? styles.moduleCardPressed : null,
                ]}
              >
                <View style={[styles.moduleAccent, { backgroundColor: disabled ? theme.colors.border : accent }]} />

                <View style={styles.moduleCardTop}>
                  <View style={styles.moduleTopLeft}>
                    <View style={[styles.moduleIconWrap, { backgroundColor: `${accent}16`, borderColor: `${accent}40` }]}>
                      <Ionicons color={accent} name={item.icon} size={22} />
                    </View>
                    <View style={styles.moduleBody}>
                      <Text style={[styles.moduleTitle, disabled ? styles.moduleTitleDisabled : null]}>{item.label}</Text>
                      <Text style={[styles.moduleDescription, disabled ? styles.moduleDescriptionDisabled : null]}>{item.description}</Text>
                    </View>
                  </View>

                  <View style={styles.moduleTopMeta}>
                    {item.statusLabel ? (
                      <View style={[styles.moduleStatus, { backgroundColor: disabled ? theme.colors.surfaceSoft : `${accent}12`, borderColor: disabled ? theme.colors.border : `${accent}30` }]}>
                        <Text style={[styles.moduleStatusText, disabled ? styles.moduleStatusTextDisabled : { color: accent }]}>{item.statusLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {disabled ? (
                  <View style={styles.moduleFooter}>
                    <Text style={[styles.moduleFooterText, styles.moduleFooterTextDisabled]}>Belum tersedia untuk digunakan</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </AppPanel>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.screenContent}>
        <Animated.View style={[styles.headerShell, { transform: [{ translateY: headerTranslateY }] }]}>
          <Animated.View style={[styles.headerMotionWrap, { transform: [{ scaleX: headerScaleX }, { scaleY: headerScaleY }] }]}>
            <AppPanel style={styles.headerPanel}>
              <View pointerEvents="none" style={styles.headerDecorWrap}>
                <View style={styles.headerDecorLarge} />
                <View style={styles.headerDecorSmall} />
              </View>
              <View style={styles.headerContent}>
                <View style={styles.headerBar}>
                  <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}>
                    <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
                  </Pressable>
                  <Animated.Text style={[styles.headerTitle, { transform: [{ scale: titleScale }] }]}>Layanan & Produk</Animated.Text>
                  <View style={styles.headerSpacer} />
                </View>
              </View>
            </AppPanel>
          </Animated.View>
        </Animated.View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <Animated.View style={[styles.headerShell, { transform: [{ translateY: headerTranslateY }] }]}>
        <Animated.View style={[styles.headerMotionWrap, { transform: [{ scaleX: headerScaleX }, { scaleY: headerScaleY }] }]}>
          <AppPanel style={styles.headerPanel}>
            <View pointerEvents="none" style={styles.headerDecorWrap}>
              <View style={styles.headerDecorLarge} />
              <View style={styles.headerDecorSmall} />
            </View>
            <View style={styles.headerContent}>
              <View style={styles.headerBar}>
                <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}>
                  <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
                </Pressable>
                <Animated.Text style={[styles.headerTitle, { transform: [{ scale: titleScale }] }]}>Layanan & Produk</Animated.Text>
                <View style={styles.headerSpacer} />
              </View>
            </View>
          </AppPanel>
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        {renderSection("Layanan", "Operasional", serviceItems)}
        {renderSection("Produk & Bahan Baku", "Inventori", inventoryItems)}
      </Animated.ScrollView>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  const cardWidth = isTablet ? "48.8%" : "100%";
  const horizontalPadding = isTablet ? theme.spacing.xl : theme.spacing.lg;
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
      paddingHorizontal: horizontalPadding,
    },
    headerMotionWrap: {
      transformOrigin: "center top",
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: headerReservedHeight,
      paddingHorizontal: horizontalPadding,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    headerPanel: {
      gap: 0,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "#102a40" : "#ebf9ff",
      overflow: "hidden",
    },
    headerContent: {
      position: "relative",
      zIndex: 2,
    },
    headerDecorWrap: {
      ...StyleSheet.absoluteFillObject,
    },
    headerDecorLarge: {
      position: "absolute",
      top: -38,
      right: -12,
      width: 120,
      height: 120,
      borderRadius: 999,
      backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.14)" : "rgba(28,211,226,0.22)",
    },
    headerDecorSmall: {
      position: "absolute",
      bottom: -24,
      left: -16,
      width: 72,
      height: 72,
      borderRadius: 999,
      backgroundColor: theme.mode === "dark" ? "rgba(42,124,226,0.12)" : "rgba(42,124,226,0.14)",
    },
    headerBar: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingVertical: 0,
    },
    headerIconButton: {
      width: 32,
      height: 32,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(42,124,226,0.18)",
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.76)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconButtonPressed: {
      opacity: 0.82,
    },
    headerSpacer: {
      width: 32,
      height: 32,
    },
    headerTitle: {
      color: theme.mode === "dark" ? theme.colors.textPrimary : "#0a365a",
      flex: 1,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 18 : 16,
      lineHeight: isTablet ? 22 : 20,
      textAlign: "center",
    },
    sectionPanel: {
      gap: theme.spacing.sm,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionCopy: {
      flex: 1,
      gap: 2,
    },
    sectionEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 18,
      lineHeight: 24,
    },
    sectionCount: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      paddingTop: 3,
    },
    cardGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    moduleCard: {
      position: "relative",
      width: cardWidth,
      minHeight: 118,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
      paddingLeft: 16,
      paddingRight: 14,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 8,
      overflow: "hidden",
    },
    moduleCardDisabled: {
      opacity: 0.72,
    },
    moduleCardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.992 }],
    },
    moduleAccent: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    moduleCardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    moduleTopLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      minWidth: 0,
    },
    moduleIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 13,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceSoft,
    },
    moduleTopMeta: {
      alignItems: "flex-end",
      gap: 8,
    },
    moduleStatus: {
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    moduleStatusText: {
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      letterSpacing: 0.2,
    },
    moduleStatusTextDisabled: {
      color: theme.colors.textMuted,
    },
    moduleBody: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    moduleTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
      lineHeight: 21,
    },
    moduleTitleDisabled: {
      color: theme.colors.textSecondary,
    },
    moduleDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    moduleDescriptionDisabled: {
      color: theme.colors.textMuted,
    },
    moduleFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 6,
      marginLeft: 58,
    },
    moduleFooterText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    moduleFooterTextDisabled: {
      color: theme.colors.textMuted,
    },
  });
}
