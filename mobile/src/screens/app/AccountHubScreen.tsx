import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  canManageFinance,
  canManagePrinterNote,
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
  badge?: "Hot" | "Soon";
  route?: keyof AccountStackParamList;
  allowedRoles?: UserRole[];
  locked?: boolean;
}

export function AccountHubScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const waAllowed = canOpenWaModule(roles);
  const waPlanAllowed = isWaPlanEligible(planKey);

  const rawMenuItems: AccountMenuItem[] = [
    { title: "Pelanggan Saya", subtitle: "Daftar pelanggan yang terdaftar di outlet", route: "Customers", allowedRoles: ["owner", "admin", "cashier"] },
    { title: "Kelola Outlet", subtitle: "Daftar outlet, outlet aktif, dan status arsip", route: "Outlets", allowedRoles: ["owner", "admin"] },
    { title: "Zona Antar", subtitle: "Atur radius, biaya, dan ETA antar per outlet", route: "ShippingZones", allowedRoles: ["owner", "admin"] },
    { title: "Kelola Layanan/Produk", subtitle: "Lihat layanan, harga dasar, dan arsip", route: "Services", allowedRoles: ["owner", "admin"] },
    { title: "Kelola Pegawai", subtitle: "Daftar akun tim, role, dan status arsip", route: "Staff", allowedRoles: ["owner", "admin"] },
    {
      title: "Kelola Keuangan",
      subtitle: "Cashbox, pendapatan, pengeluaran, koreksi",
      route: "FinanceTools",
      allowedRoles: ["owner", "admin"],
      locked: !canManageFinance(roles),
    },
    {
      title: "Printer & Nota",
      subtitle: "Profil nota, nomor nota, tampilan struk",
      route: "PrinterNote",
      allowedRoles: ["owner", "admin", "cashier"],
      locked: !canManagePrinterNote(roles),
    },
    {
      title: "Kirim WA",
      subtitle: waPlanAllowed ? "Sebarkan pesan dan notifikasi pelanggan" : "Butuh plan Premium/Pro untuk fitur WhatsApp.",
      badge: "Hot",
      route: waPlanAllowed ? "WhatsAppTools" : undefined,
      allowedRoles: ["owner", "admin"],
      locked: !waPlanAllowed || !waAllowed,
    },
    { title: "Profil Pemilik", subtitle: "Profil, bank, preferensi akun", allowedRoles: ["owner", "admin"] },
    { title: "Go Online", subtitle: "Fasilitas pelanggan untuk order online", badge: "Hot", allowedRoles: ["owner", "admin"], locked: true },
    { title: "Riwayat Pembelian Saya", subtitle: "Lihat riwayat pembelian layanan", allowedRoles: ["owner", "admin", "cashier", "worker", "courier"] },
    { title: "Bantuan & Informasi", subtitle: "Kontak, FAQ, syarat, kebijakan", route: "HelpInfo", allowedRoles: ["owner", "admin", "cashier", "worker", "courier"] },
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
      <View style={styles.header}>
        <Text style={styles.title}>Akun & Pengaturan</Text>
        <Text style={styles.subtitle}>{selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "-"}</Text>
      </View>

      <AppPanel style={styles.profilePanel}>
        <View style={styles.profileTop}>
          <View style={styles.profileIdentity}>
            <Text style={styles.profileName}>{session.user.name}</Text>
            <Text style={styles.profileEmail}>{session.user.email}</Text>
          </View>
          <StatusPill label={(session.plan.key ?? "free").toUpperCase()} tone="info" />
        </View>
        <Text style={styles.profileMeta}>Role: {(session.roles ?? []).join(", ") || "-"}</Text>
        <Text style={styles.profileMeta}>
          Kuota:{" "}
          {session.quota.orders_remaining === null
            ? "tanpa batas"
            : `${session.quota.orders_remaining} sisa dari ${session.quota.orders_limit ?? "-"}`}
        </Text>
      </AppPanel>

      <AppPanel style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Keamanan Login</Text>
        {biometricAvailable ? (
          <>
            <Text style={styles.settingsHint}>Aktifkan autentikasi {biometricLabel} saat membuka ulang aplikasi.</Text>
            <AppButton
              disabled={biometricSaving}
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
        {menuItems.map((item) => {
          const disabled = !item.route || item.locked;

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
              style={({ pressed }) => [styles.menuItem, disabled ? styles.menuItemDisabled : null, !disabled && pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuTextWrap}>
                <View style={styles.menuTitleRow}>
                  <Text style={[styles.menuTitle, disabled ? styles.menuTextDisabled : null]}>{item.title}</Text>
                  {item.badge ? <StatusPill label={item.badge} tone={item.badge === "Hot" ? "danger" : "warning"} /> : null}
                  {item.locked ? <StatusPill label="Lock" tone="neutral" /> : null}
                </View>
                <Text style={[styles.menuSubtitle, disabled ? styles.menuTextDisabled : null]}>{item.subtitle}</Text>
              </View>
              <Text style={[styles.menuArrow, disabled ? styles.menuTextDisabled : null]}>›</Text>
            </Pressable>
          );
        })}
      </AppPanel>

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

      <View style={styles.actionStack}>
        <AppButton
          onPress={() => {
            selectOutlet(null);
          }}
          title="Ganti Outlet Aktif"
          variant="secondary"
        />
        <AppButton onPress={() => void logout()} title="Logout" variant="ghost" />
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    header: {
      gap: 2,
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
      fontSize: 13,
    },
    profilePanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    profileTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    profileIdentity: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
    },
    profileEmail: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    profileMeta: {
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
    settingsTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
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
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: 2,
      paddingVertical: 11,
      gap: theme.spacing.sm,
    },
    menuItemDisabled: {
      opacity: 0.6,
    },
    menuItemPressed: {
      opacity: 0.84,
    },
    menuTextWrap: {
      flex: 1,
      gap: 3,
    },
    menuTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      flexWrap: "wrap",
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
    menuArrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 22,
      marginRight: 2,
    },
    actionStack: {
      gap: theme.spacing.xs,
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
