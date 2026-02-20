import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

export function QuickActionScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { selectedOutlet } = useSession();

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Action</Text>
        <Text style={styles.subtitle}>{selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih"}</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Aksi Cepat Operasional</Text>
        <View style={styles.actionList}>
          <AppButton disabled onPress={() => undefined} title="Buat Order Baru (Soon)" />
          <AppButton disabled onPress={() => undefined} title="Tambah Pelanggan (Soon)" variant="secondary" />
          <AppButton disabled onPress={() => undefined} title="Scan Nota / Barcode (Soon)" variant="secondary" />
        </View>
        <Text style={styles.infoText}>Fase 1 fokus pada struktur tab dan alur order. Aksi transaksi penuh lanjut di fase berikutnya.</Text>
      </AppPanel>
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
      gap: 3,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 28,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    actionList: {
      gap: theme.spacing.xs,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
