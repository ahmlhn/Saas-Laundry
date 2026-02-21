import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { clearQueryCache } from "../../lib/queryCache";
import type { AccountStackParamList } from "../../navigation/types";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "HelpInfo">;

interface HelpItem {
  key: string;
  title: string;
  description: string;
  link?: string;
}

const HELP_ITEMS: HelpItem[] = [
  { key: "reset", title: "Reset Data", description: "Reset cache sinkronisasi lokal perangkat." },
  { key: "clear-cache", title: "Hapus Cache", description: "Bersihkan data cache untuk muat ulang API." },
  { key: "check-update", title: "Cek Update", description: "Periksa versi app terbaru untuk tenant kamu.", link: "https://saas.daratlaut.com/mobile/latest" },
  { key: "latest", title: "Terbaru di Cuci Laundry", description: "Lihat fitur baru dan catatan rilis terbaru.", link: "https://saas.daratlaut.com/changelog" },
  { key: "trial", title: "Perpanjang Masa Trial", description: "Hubungi tim sales untuk perpanjangan trial.", link: "https://saas.daratlaut.com/pricing" },
];

const INFO_ITEMS: HelpItem[] = [
  { key: "training", title: "Training Aplikasi", description: "Materi onboarding pemilik, kasir, dan operator.", link: "https://saas.daratlaut.com/docs/training" },
  { key: "faq", title: "Sering Ditanyakan", description: "Kumpulan jawaban masalah operasional umum.", link: "https://saas.daratlaut.com/docs/faq" },
  { key: "video", title: "Video Tutorial", description: "Panduan video ringkas penggunaan aplikasi.", link: "https://saas.daratlaut.com/docs/tutorial-video" },
  { key: "support", title: "Pusat Bantuan", description: "Buka tiket bantuan saat ada kendala operasional.", link: "https://saas.daratlaut.com/support" },
  { key: "privacy", title: "Kebijakan Privasi", description: "Ketentuan pengelolaan data pengguna dan tenant.", link: "https://saas.daratlaut.com/privacy" },
  { key: "tos", title: "Syarat dan Ketentuan", description: "Aturan penggunaan layanan SaaS Laundry.", link: "https://saas.daratlaut.com/terms" },
  { key: "contact", title: "Hubungi Kami", description: "Kontak tim support dan customer success.", link: "mailto:support@daratlaut.com" },
  { key: "about", title: "Tentang Aplikasi", description: "Informasi versi, build, dan lisensi aplikasi." },
];

export function HelpInfoScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function openLink(item: HelpItem): Promise<void> {
    if (!item.link) {
      setActionMessage(`${item.title}: detail info akan tampil di versi berikutnya.`);
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(item.link);
      if (!canOpen) {
        setActionMessage(`Tidak bisa membuka ${item.title} dari perangkat ini.`);
        return;
      }

      await Linking.openURL(item.link);
      setActionMessage(`${item.title} dibuka di browser/aplikasi terkait.`);
    } catch {
      setActionMessage(`Gagal membuka ${item.title}.`);
    }
  }

  async function handlePress(item: HelpItem): Promise<void> {
    if (item.key === "reset" || item.key === "clear-cache") {
      clearQueryCache();
      setActionMessage("Cache lokal berhasil dibersihkan. Silakan refresh data pada halaman operasional.");
      return;
    }

    await openLink(item);
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Bantuan & Informasi</Text>
        <Text style={styles.subtitle}>Semua pusat bantuan operasional tenant tersedia dari menu ini.</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Bantuan</Text>
        <View style={styles.listWrap}>
          {HELP_ITEMS.map((item) => (
            <Pressable key={item.key} onPress={() => void handlePress(item)} style={styles.itemRow}>
              <View style={styles.iconChip}>
                <Text style={styles.iconText}>i</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Informasi</Text>
        <View style={styles.listWrap}>
          {INFO_ITEMS.map((item) => (
            <Pressable key={item.key} onPress={() => void handlePress(item)} style={styles.itemRow}>
              <View style={styles.iconChip}>
                <Text style={styles.iconText}>i</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </AppPanel>

      {actionMessage ? (
        <View style={styles.infoWrap}>
          <StatusPill label="Info" tone="info" />
          <Text style={styles.infoText}>{actionMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    header: {
      gap: 2,
    },
    backButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 2,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
      fontSize: 12,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.xs,
    },
    sectionTitle: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
    },
    listWrap: {
      gap: 2,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 10,
    },
    iconChip: {
      width: 28,
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    itemTextWrap: {
      flex: 1,
      gap: 1,
    },
    itemTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    itemDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    infoWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#2b4b66" : "#c4def8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#162f46" : "#eff6ff",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    infoText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
