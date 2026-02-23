import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
  icon: keyof typeof Ionicons.glyphMap;
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
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Semua outlet";

  const serviceItems: MenuItem[] = [
    {
      id: "regular",
      label: "Layanan Reguler",
      icon: "shirt-outline",
      onPress: () =>
        navigation.navigate("ServiceTypeList", {
          serviceType: "regular",
          title: "Layanan Reguler",
        }),
    },
    {
      id: "package",
      label: "Layanan Paket",
      icon: "layers-outline",
      onPress: () =>
        navigation.navigate("ServiceTypeList", {
          serviceType: "package",
          title: "Layanan Paket",
        }),
    },
    {
      id: "parfum",
      label: "Parfum dan Item",
      icon: "flask-outline",
      onPress: () => navigation.navigate("ParfumItem"),
    },
    {
      id: "promo",
      label: "Promo",
      icon: "pricetags-outline",
      onPress: () => navigation.navigate("Promo"),
    },
    {
      id: "copy",
      label: "Salin Layanan",
      icon: "copy-outline",
      locked: true,
      onPress: () => undefined,
    },
  ];

  const inventoryItems: MenuItem[] = [
    {
      id: "category",
      label: "Kategori & Satuan",
      icon: "apps-outline",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Kategori & Satuan",
          description: "Struktur kategori produk dan satuan stok akan hadir di rilis berikutnya.",
        }),
    },
    {
      id: "product",
      label: "Daftar Produk",
      icon: "clipboard-outline",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Daftar Produk",
          description: "Master data produk bahan baku sedang disiapkan.",
        }),
    },
    {
      id: "purchase",
      label: "Pembelian Produk",
      icon: "cart-outline",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Pembelian Produk",
          description: "Fitur pembelian produk akan tersedia setelah modul inventory inti siap.",
        }),
    },
    {
      id: "stock",
      label: "Stok Opname",
      icon: "cube-outline",
      onPress: () =>
        navigation.navigate("FeaturePlaceholder", {
          title: "Stok Opname",
          description: "Fitur stok opname akan tersedia di fase berikutnya.",
        }),
    },
  ];

  function renderMenuGroup(title: string, items: MenuItem[]) {
    return (
      <AppPanel style={styles.groupPanel}>
        <Text style={styles.groupTitle}>{title}</Text>
        <View style={styles.itemList}>
          {items.map((item) => {
            const disabled = item.locked || (!canManage && title === "Layanan" && item.id === "copy");
            const iconColor = disabled ? theme.colors.textMuted : theme.colors.info;

            return (
              <Pressable
                disabled={disabled}
                key={item.id}
                onPress={item.onPress}
                style={({ pressed }) => [styles.menuItem, disabled ? styles.menuItemDisabled : null, !disabled && pressed ? styles.menuItemPressed : null]}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons color={iconColor} name={item.icon} size={24} />
                  <Text style={[styles.menuLabel, disabled ? styles.menuLabelDisabled : null]}>{item.label}</Text>
                </View>
                {item.locked ? (
                  <View style={styles.lockWrap}>
                    <Ionicons color={theme.colors.danger} name="lock-closed" size={14} />
                  </View>
                ) : (
                  <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
                )}
              </Pressable>
            );
          })}
        </View>
      </AppPanel>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.headerPanel}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <Text style={styles.headerTitle}>Kelola Layanan/Produk</Text>
            <View style={styles.headerSpacer} />
          </View>
          <Text style={styles.outletText}>{outletLabel}</Text>
          <Text style={styles.blockedText}>Akun Anda tidak memiliki akses ke menu ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.headerPanel}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Kelola Layanan/Produk</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.outletText}>{outletLabel}</Text>
        <Text style={styles.headerSub}>Pilih modul untuk mengelola layanan dan promo.</Text>
      </AppPanel>

      {renderMenuGroup("Layanan", serviceItems)}
      {renderMenuGroup("Produk & Bahan Baku", inventoryItems)}
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
      gap: theme.spacing.sm,
    },
    headerPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f7f9fb",
      borderColor: theme.colors.borderStrong,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    backButton: {
      width: 34,
      height: 34,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    backButtonPressed: {
      opacity: 0.82,
    },
    headerSpacer: {
      width: 34,
      height: 34,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 24 : 22,
      lineHeight: isTablet ? 30 : 27,
    },
    outletText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      textAlign: "center",
    },
    headerSub: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
    },
    blockedText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
    },
    groupPanel: {
      gap: theme.spacing.xs,
      paddingVertical: 14,
    },
    groupTitle: {
      color: theme.mode === "dark" ? "#f5c067" : "#de8f14",
      fontFamily: theme.fonts.bold,
      fontSize: 16,
      lineHeight: 22,
      paddingHorizontal: 2,
    },
    itemList: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 4,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 54,
      paddingHorizontal: 2,
      borderRadius: theme.radii.md,
      gap: theme.spacing.sm,
    },
    menuItemPressed: {
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(42,124,226,0.06)",
    },
    menuItemDisabled: {
      opacity: 0.68,
    },
    menuItemLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    menuLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 22 : 17,
      lineHeight: isTablet ? 30 : 24,
    },
    menuLabelDisabled: {
      color: theme.colors.textMuted,
    },
    lockWrap: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
