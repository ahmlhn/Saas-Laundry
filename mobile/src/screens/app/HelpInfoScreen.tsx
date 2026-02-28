import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
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
  { key: "latest", title: "Terbaru di Laundry Poin", description: "Lihat fitur baru dan catatan rilis terbaru.", link: "https://saas.daratlaut.com/changelog" },
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

function resolveHelpIcon(key: string): keyof typeof Ionicons.glyphMap {
  if (key === "reset" || key === "clear-cache") {
    return "refresh-outline";
  }

  if (key === "check-update" || key === "latest") {
    return "sparkles-outline";
  }

  if (key === "trial") {
    return "pricetag-outline";
  }

  if (key === "training" || key === "video") {
    return "play-circle-outline";
  }

  if (key === "faq") {
    return "help-buoy-outline";
  }

  if (key === "support" || key === "contact") {
    return "chatbubble-ellipses-outline";
  }

  if (key === "privacy" || key === "tos") {
    return "shield-checkmark-outline";
  }

  return "information-circle-outline";
}

export function HelpInfoScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
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
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="help-circle-outline" size={15} />
            <Text style={styles.heroBadgeText}>Bantuan</Text>
          </View>
          <View style={styles.heroSpacer} />
        </View>
        <Text style={styles.title}>Bantuan & Informasi</Text>
        <Text style={styles.subtitle}>Semua pusat bantuan operasional tenant tersedia dari menu ini.</Text>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Bantuan</Text>
          <Ionicons color={theme.colors.info} name="construct-outline" size={16} />
        </View>
        <View style={styles.listWrap}>
          {HELP_ITEMS.map((item) => (
            <Pressable key={item.key} onPress={() => void handlePress(item)} style={({ pressed }) => [styles.itemRow, pressed ? styles.itemRowPressed : null]}>
              <View style={styles.iconChip}>
                <Ionicons color={theme.colors.info} name={resolveHelpIcon(item.key)} size={15} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            </Pressable>
          ))}
        </View>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Informasi</Text>
          <Ionicons color={theme.colors.info} name="newspaper-outline" size={16} />
        </View>
        <View style={styles.listWrap}>
          {INFO_ITEMS.map((item) => (
            <Pressable key={item.key} onPress={() => void handlePress(item)} style={({ pressed }) => [styles.itemRow, pressed ? styles.itemRowPressed : null]}>
              <View style={styles.iconChip}>
                <Ionicons color={theme.colors.info} name={resolveHelpIcon(item.key)} size={15} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            </Pressable>
          ))}
        </View>
      </AppPanel>

      {actionMessage ? (
        <View style={styles.infoWrap}>
          <Ionicons color={theme.colors.info} name="information-circle-outline" size={16} />
          <Text style={styles.infoText}>{actionMessage}</Text>
        </View>
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
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.92)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    heroSpacer: {
      width: 36,
      height: 36,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    listWrap: {
      gap: 4,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      borderRadius: theme.radii.sm,
      paddingVertical: 11,
      paddingHorizontal: 2,
    },
    itemRowPressed: {
      opacity: 0.8,
    },
    iconChip: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    itemTextWrap: {
      flex: 1,
      gap: 1,
    },
    itemTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 14.5 : 14,
    },
    itemDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    infoWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#2b4b66" : "#c4def8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#162f46" : "#eff6ff",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    infoText: {
      flex: 1,
      color: theme.colors.info,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
