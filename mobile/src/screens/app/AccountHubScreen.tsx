import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  canManageFinance,
  canManagePrinterNote,
  canManageTenantProfile,
  canOpenWaModule,
  hasAnyRole,
  isWaPlanEligible,
  type UserRole,
} from "../../lib/accessControl";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

interface AccountMenuItem {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: "Hot" | "Soon";
  route?: Exclude<
    keyof AccountStackParamList,
    "CustomerForm" | "CustomerDetail" | "ServiceForm" | "ServiceTypeList" | "ServiceGroupForm" | "ServiceVariantForm" | "ParfumItemForm" | "PromoForm" | "FeaturePlaceholder"
  >;
  allowedRoles?: UserRole[];
  locked?: boolean;
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function AccountHubScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "AccountHub">>();
  const { session, selectedOutlet, selectOutlet, logout, biometricAvailable, biometricEnabled, biometricLabel, setBiometricEnabled } = useSession();
  const [biometricSaving, setBiometricSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!session) {
    return null;
  }

  const roles = session.roles ?? [];
  const planKey = session.plan.key ?? null;
  const tenantAllowed = canManageTenantProfile(roles);
  const waAllowed = canOpenWaModule(roles);
  const waPlanAllowed = isWaPlanEligible(planKey);
  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const roleLabel = roles.join(", ") || "-";
  const quotaLabel =
    session.quota.orders_remaining === null
      ? "tanpa batas"
      : `${session.quota.orders_remaining} sisa dari ${session.quota.orders_limit ?? "-"}`;

  const rawMenuItems: AccountMenuItem[] = [
    {
      title: "Pelanggan Saya",
      subtitle: "Daftar pelanggan yang terdaftar di outlet",
      icon: "people-outline",
      route: "Customers",
      allowedRoles: ["owner", "admin", "cashier"],
    },
    {
      title: "Kelola Outlet",
      subtitle: "Daftar outlet, outlet aktif, dan status arsip",
      icon: "business-outline",
      route: "Outlets",
      allowedRoles: ["owner", "admin"],
    },
    {
      title: "Kelola Tenant",
      subtitle: "Profil tenant, status, dan ringkasan data",
      icon: "layers-outline",
      route: "TenantManagement",
      allowedRoles: ["owner", "tenant_manager"],
      locked: !tenantAllowed,
    },
    {
      title: "Langganan Tenant",
      subtitle: "Plan aktif, invoice, dan perubahan paket",
      icon: "receipt-outline",
      route: "SubscriptionCenter",
      allowedRoles: ["owner"],
    },
    {
      title: "Zona Antar",
      subtitle: "Atur radius, biaya, dan ETA antar per outlet",
      icon: "navigate-outline",
      route: "ShippingZones",
      allowedRoles: ["owner", "admin"],
    },
    {
      title: "Kelola Layanan/Produk",
      subtitle: "Lihat layanan, harga dasar, dan arsip",
      icon: "cube-outline",
      route: "Services",
      allowedRoles: ["owner", "admin", "cashier"],
    },
    {
      title: "Kelola Pegawai",
      subtitle: "Daftar akun tim, role, dan status arsip",
      icon: "people-circle-outline",
      route: "Staff",
      allowedRoles: ["owner", "admin"],
    },
    {
      title: "Kelola Keuangan",
      subtitle: "Cashbox, pendapatan, pengeluaran, koreksi",
      icon: "wallet-outline",
      route: "FinanceTools",
      allowedRoles: ["owner", "admin"],
      locked: !canManageFinance(roles),
    },
    {
      title: "Printer & Nota",
      subtitle: "Profil nota, nomor nota, tampilan struk",
      icon: "print-outline",
      route: "PrinterNote",
      allowedRoles: ["owner", "admin", "cashier"],
      locked: !canManagePrinterNote(roles),
    },
    {
      title: "Kirim WA",
      subtitle: waPlanAllowed ? "Sebarkan pesan dan notifikasi pelanggan" : "Buka untuk cek status fitur dan kebutuhan plan WhatsApp.",
      icon: "logo-whatsapp",
      badge: "Hot",
      route: "WhatsAppTools",
      allowedRoles: ["owner", "admin"],
      locked: !waAllowed,
    },
    {
      title: "Profil Pemilik",
      subtitle: "Profil, bank, preferensi akun",
      icon: "person-outline",
      allowedRoles: ["owner", "admin"],
    },
    {
      title: "Go Online",
      subtitle: "Fasilitas pelanggan untuk order online",
      icon: "globe-outline",
      badge: "Hot",
      allowedRoles: ["owner", "admin"],
      locked: true,
    },
    {
      title: "Riwayat Pembelian Saya",
      subtitle: "Lihat riwayat pembelian layanan",
      icon: "time-outline",
      allowedRoles: ["owner", "admin", "cashier", "worker", "courier"],
    },
    {
      title: "Bantuan & Informasi",
      subtitle: "Kontak, FAQ, syarat, kebijakan",
      icon: "help-circle-outline",
      route: "HelpInfo",
      allowedRoles: ["owner", "admin", "cashier", "worker", "courier"],
    },
  ];

  const menuItems = rawMenuItems.filter((item) => !item.allowedRoles || hasAnyRole(roles, item.allowedRoles));

  async function handleToggleBiometric(): Promise<void> {
    if (!biometricAvailable || biometricSaving) {
      return;
    }

    setBiometricSaving(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      await setBiometricEnabled(!biometricEnabled);
      setActionMessage(
        biometricEnabled ? `Login ${biometricLabel} dinonaktifkan.` : `Login ${biometricLabel} berhasil diaktifkan untuk sesi berikutnya.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal memperbarui pengaturan biometrik.");
    } finally {
      setBiometricSaving(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.profilePanel}>
        <View style={styles.profileTop}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{userInitials(session.user.name)}</Text>
          </View>
          <View style={styles.profileIdentity}>
            <Text numberOfLines={1} style={styles.profileName}>
              {session.user.name}
            </Text>
            <Text numberOfLines={1} style={styles.profileEmail}>
              {session.user.email}
            </Text>
          </View>
          <StatusPill label={(session.plan.key ?? "free").toUpperCase()} tone="info" />
        </View>
        <View style={styles.profileMetaRow}>
          <Ionicons color={theme.colors.textMuted} name="storefront-outline" size={14} />
          <Text numberOfLines={1} style={styles.profileMeta}>
            {outletLabel}
          </Text>
        </View>
        <View style={styles.profileMetaRow}>
          <Ionicons color={theme.colors.textMuted} name="person-circle-outline" size={14} />
          <Text numberOfLines={1} style={styles.profileMeta}>
            Role: {roleLabel}
          </Text>
        </View>
        <View style={styles.profileMetaRow}>
          <Ionicons color={theme.colors.textMuted} name="speedometer-outline" size={14} />
          <Text numberOfLines={1} style={styles.profileMeta}>
            Kuota order: {quotaLabel}
          </Text>
        </View>
      </AppPanel>

      <AppPanel style={styles.settingsPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.settingsTitle}>Keamanan Login</Text>
          <Ionicons color={theme.colors.info} name="shield-checkmark-outline" size={17} />
        </View>
        {biometricAvailable ? (
          <>
            <Text style={styles.settingsHint}>Aktifkan autentikasi {biometricLabel} saat membuka ulang aplikasi.</Text>
            <AppButton
              disabled={biometricSaving}
              leftElement={<Ionicons color={biometricEnabled ? theme.colors.textPrimary : theme.colors.info} name="finger-print-outline" size={18} />}
              loading={biometricSaving}
              onPress={() => void handleToggleBiometric()}
              title={biometricEnabled ? `Nonaktifkan ${biometricLabel}` : `Aktifkan ${biometricLabel}`}
              variant={biometricEnabled ? "ghost" : "secondary"}
            />
          </>
        ) : (
          <Text style={styles.settingsHint}>Perangkat ini belum mendukung login biometrik.</Text>
        )}
      </AppPanel>

      <AppPanel style={styles.menuPanel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.settingsTitle}>Menu Akun</Text>
          <Text style={styles.menuCount}>{menuItems.length} item</Text>
        </View>
        {menuItems.map((item) => {
          const disabled = !item.route || item.locked;
          const iconColor = disabled ? theme.colors.textMuted : theme.colors.info;

          return (
            <Pressable
              disabled={disabled}
              key={item.title}
              onPress={() => {
                if (!item.route || disabled) {
                  return;
                }
                navigation.navigate(item.route);
              }}
              style={({ pressed }) => [
                styles.menuItem,
                disabled ? styles.menuItemDisabled : null,
                !disabled && pressed ? styles.menuItemPressed : null,
              ]}
            >
              <View style={[styles.menuIconWrap, disabled ? styles.menuIconWrapDisabled : null]}>
                <Ionicons color={iconColor} name={item.icon} size={17} />
              </View>
              <View style={styles.menuTextWrap}>
                <View style={styles.menuTitleRow}>
                  <Text style={[styles.menuTitle, disabled ? styles.menuTextDisabled : null]}>{item.title}</Text>
                  {item.badge ? <StatusPill label={item.badge} tone={item.badge === "Hot" ? "danger" : "warning"} /> : null}
                  {item.locked ? <StatusPill label="Lock" tone="neutral" /> : null}
                </View>
                <Text style={[styles.menuSubtitle, disabled ? styles.menuTextDisabled : null]}>{item.subtitle}</Text>
              </View>
              <Ionicons color={disabled ? theme.colors.textMuted : theme.colors.textSecondary} name="chevron-forward" size={17} />
            </Pressable>
          );
        })}
      </AppPanel>

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

      <View style={[styles.actionStack, isTablet || isCompactLandscape ? styles.actionStackWide : null]}>
        <View style={styles.actionButtonWrap}>
          <AppButton
            leftElement={<Ionicons color={theme.colors.info} name="swap-horizontal-outline" size={18} />}
            onPress={() => {
              selectOutlet(null);
            }}
            title="Ganti Outlet Aktif"
            variant="secondary"
          />
        </View>
        <View style={styles.actionButtonWrap}>
          <AppButton
            leftElement={<Ionicons color={theme.colors.textPrimary} name="log-out-outline" size={18} />}
            onPress={() => void logout()}
            title="Logout"
            variant="ghost"
          />
        </View>
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
    },
    profilePanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    profileTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    avatarWrap: {
      width: isTablet ? 52 : 48,
      height: isTablet ? 52 : 48,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "#1a4466" : "#d5efff",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 18 : 16,
    },
    profileIdentity: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 18 : 16,
    },
    profileEmail: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    profileMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    profileMeta: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    settingsPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    settingsTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    settingsHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    menuPanel: {
      gap: 0,
      paddingVertical: 4,
    },
    menuCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 11,
      gap: theme.spacing.sm,
    },
    menuItemDisabled: {
      opacity: 0.62,
    },
    menuItemPressed: {
      opacity: 0.84,
    },
    menuIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "#edf7ff",
      alignItems: "center",
      justifyContent: "center",
    },
    menuIconWrapDisabled: {
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.02)" : "#f6f9fc",
    },
    menuTextWrap: {
      flex: 1,
      gap: 3,
    },
    menuTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    menuTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    menuSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    menuTextDisabled: {
      color: theme.colors.textMuted,
    },
    actionStack: {
      gap: theme.spacing.xs,
    },
    actionStackWide: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionButtonWrap: {
      flex: 1,
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
