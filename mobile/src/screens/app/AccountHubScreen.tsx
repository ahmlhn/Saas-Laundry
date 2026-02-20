import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

interface AccountMenuItem {
  title: string;
  subtitle: string;
  badge?: "Hot" | "Soon";
  locked?: boolean;
}

const ACCOUNT_MENU_ITEMS: AccountMenuItem[] = [
  { title: "Pelanggan Saya", subtitle: "Daftar pelanggan yang terdaftar di outlet" },
  { title: "Kelola Outlet", subtitle: "Edit outlet, jam operasional, tarif ongkir" },
  { title: "Kelola Layanan/Produk", subtitle: "Edit layanan, paket, dan promo" },
  { title: "Kelola Pegawai", subtitle: "Atur akses, presensi, gaji, komisi" },
  { title: "Kelola Keuangan", subtitle: "Cashbox, pendapatan, pengeluaran, koreksi" },
  { title: "Pembatalan Transaksi", subtitle: "Pembatalan transaksi reguler dan topup paket" },
  { title: "Kirim WA", subtitle: "Sebarkan pesan dan notifikasi pelanggan", badge: "Hot", locked: true },
  { title: "Profil Pemilik", subtitle: "Profil, biometrik, bank, preferensi" },
  { title: "Go Online", subtitle: "Fasilitas pelanggan untuk order online", badge: "Hot", locked: true },
  { title: "Riwayat Pembelian Saya", subtitle: "Lihat riwayat pembelian layanan" },
  { title: "Bantuan & Informasi", subtitle: "Kontak, FAQ, syarat, kebijakan" },
];

export function AccountHubScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "AccountHub">>();
  const { session, selectedOutlet, selectOutlet, logout } = useSession();

  if (!session) {
    return null;
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

      <AppPanel style={styles.menuPanel}>
        {ACCOUNT_MENU_ITEMS.map((item) => (
          <Pressable
            disabled={item.title !== "Pelanggan Saya"}
            key={item.title}
            onPress={() => {
              if (item.title === "Pelanggan Saya") {
                navigation.navigate("Customers");
              }
            }}
            style={styles.menuItem}
          >
            <View style={styles.menuTextWrap}>
              <View style={styles.menuTitleRow}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                {item.badge ? <StatusPill label={item.badge} tone={item.badge === "Hot" ? "danger" : "warning"} /> : null}
                {item.locked ? <StatusPill label="Lock" tone="neutral" /> : null}
              </View>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        ))}
      </AppPanel>

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
    menuArrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 22,
      marginRight: 2,
    },
    actionStack: {
      gap: theme.spacing.xs,
    },
  });
}
