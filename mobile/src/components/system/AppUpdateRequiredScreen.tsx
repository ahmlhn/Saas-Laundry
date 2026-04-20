import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { AppPanel } from "../ui/AppPanel";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppUpdateRequiredScreenProps {
  currentVersion: string;
  currentBuild: number | null;
  latestVersion: string;
  latestBuild: number;
  minimumSupportedVersion: string | null;
  releaseNote?: string | null;
  onOpenUpdate: () => void;
}

export function AppUpdateRequiredScreen({
  currentVersion,
  currentBuild,
  latestVersion,
  latestBuild,
  minimumSupportedVersion,
  releaseNote,
  onOpenUpdate,
}: AppUpdateRequiredScreenProps) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape), [theme, isTablet, isLandscape]);
  const currentLabel = currentBuild ? `v${currentVersion} (build ${currentBuild})` : `v${currentVersion}`;
  const latestLabel = `v${latestVersion} (build ${latestBuild})`;

  return (
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
      <View style={styles.shell}>
        <AppPanel style={styles.card}>
          <View style={styles.kickerRow}>
            <View style={styles.kickerBadge}>
              <Ionicons color={theme.colors.warning} name="shield-half-outline" size={15} />
              <Text style={styles.kickerText}>Update Wajib</Text>
            </View>
          </View>

          <View style={styles.heroIcon}>
            <Ionicons color={theme.colors.warning} name="cloud-download-outline" size={34} />
          </View>

          <Text style={styles.title}>Versi aplikasi Anda sudah tidak didukung</Text>
          <Text style={styles.subtitle}>
            Untuk melanjutkan memakai aplikasi, unduh versi terbaru dari server resmi lalu instal APK Android yang baru.
          </Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Versi Saat Ini</Text>
              <Text style={styles.metaValue}>{currentLabel}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Versi Terbaru</Text>
              <Text style={styles.metaValue}>{latestLabel}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Minimal Didukung</Text>
              <Text style={styles.metaValue}>{minimumSupportedVersion ? `v${minimumSupportedVersion}` : latestLabel}</Text>
            </View>
          </View>

          {releaseNote ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteLabel}>Catatan Rilis</Text>
              <Text style={styles.noteText}>{releaseNote}</Text>
            </View>
          ) : null}

          <AppButton
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="download-outline" size={18} />}
            onPress={onOpenUpdate}
            title="Buka Halaman Update"
          />
        </AppPanel>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isLandscape: boolean) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.mode === "dark" ? "#081421" : "#edf6ff",
    },
    shell: {
      flex: 1,
      paddingHorizontal: isTablet ? theme.spacing.xxl : theme.spacing.lg,
      paddingVertical: isLandscape ? theme.spacing.lg : theme.spacing.xl,
      justifyContent: "center",
      backgroundColor: theme.mode === "dark" ? "#081421" : "#edf6ff",
    },
    card: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 720,
      gap: theme.spacing.md,
      backgroundColor: theme.mode === "dark" ? "#102338" : "#ffffff",
      borderColor: theme.colors.borderStrong,
    },
    kickerRow: {
      flexDirection: "row",
      justifyContent: "flex-start",
    },
    kickerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#4b4c30" : "#f2d891",
      backgroundColor: theme.mode === "dark" ? "rgba(241,173,58,0.12)" : "#fff8e4",
    },
    kickerText: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.bold,
      fontSize: 11.5,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    heroIcon: {
      width: isTablet ? 76 : 68,
      height: isTablet ? 76 : 68,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#4b4c30" : "#f2d891",
      backgroundColor: theme.mode === "dark" ? "rgba(241,173,58,0.12)" : "#fff8e4",
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 29 : 24,
      lineHeight: isTablet ? 36 : 31,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 20,
    },
    metaGrid: {
      flexDirection: isTablet ? "row" : "column",
      gap: theme.spacing.sm,
    },
    metaCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.mode === "dark" ? "#132d46" : "#f7fbff",
      gap: 4,
    },
    metaLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.25,
    },
    metaValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 18 : 16,
    },
    noteCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.mode === "dark" ? "#0d2a43" : "#f8fbff",
      gap: 6,
    },
    noteLabel: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.25,
    },
    noteText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 19,
    },
  });
}
