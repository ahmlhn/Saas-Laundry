import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

export function OutletSelectScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { session, selectedOutlet, selectOutlet, logout } = useSession();

  if (!session) {
    return null;
  }

  const outlets = session.allowed_outlets;
  const rolesLabel = session.roles.join(", ");
  const quotaLabel =
    session.quota.orders_remaining === null
      ? "Tanpa batas order"
      : `${session.quota.orders_remaining} sisa dari ${session.quota.orders_limit ?? "-"}`;

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} scroll>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Pilih Outlet Aktif</Text>
        <Text style={styles.subtitle}>Outlet aktif akan jadi konteks order harian dan status layanan di aplikasi mobile.</Text>
      </View>

      <AppPanel style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Text style={styles.profileName}>{session.user.name}</Text>
          <StatusPill label={`${outlets.length} outlet`} tone="info" />
        </View>
        <Text style={styles.profileMeta}>Role: {rolesLabel || "-"}</Text>
        <Text style={styles.profileMeta}>Kuota bulan ini: {quotaLabel}</Text>
      </AppPanel>

      {outlets.length === 0 ? (
        <AppPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada outlet</Text>
          <Text style={styles.emptyText}>Akun ini belum punya akses outlet. Hubungi owner/admin untuk assign outlet.</Text>
        </AppPanel>
      ) : (
        <View style={styles.outletList}>
          {outlets.map((outlet) => {
            const active = selectedOutlet?.id === outlet.id;
            return (
              <Pressable
                key={outlet.id}
                onPress={() => {
                  selectOutlet(outlet);
                }}
                style={({ pressed }) => [styles.outletCard, active ? styles.outletCardActive : null, pressed ? styles.outletCardPressed : null]}
              >
                <View style={styles.outletTitleRow}>
                  <Text style={styles.outletTitle}>
                    {outlet.code} - {outlet.name}
                  </Text>
                  <StatusPill label={active ? "Aktif" : "Pilih"} tone={active ? "success" : "neutral"} />
                </View>
                <Text style={styles.outletMeta}>Timezone: {outlet.timezone}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <AppButton onPress={() => void logout()} title="Logout" variant="secondary" />
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    headerBlock: {
      gap: theme.spacing.xs,
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
      lineHeight: 20,
    },
    profileCard: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
    },
    profileTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    profileName: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
    },
    profileMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    outletList: {
      gap: theme.spacing.sm,
    },
    outletCard: {
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.xs,
    },
    outletCardActive: {
      borderColor: theme.colors.primaryStrong,
      backgroundColor: theme.colors.primarySoft,
    },
    outletCardPressed: {
      opacity: 0.88,
    },
    outletTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    outletTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 20,
    },
    outletMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    emptyCard: {
      borderColor: theme.mode === "dark" ? "#5c3444" : "#f5b8c6",
      backgroundColor: theme.mode === "dark" ? "#3a2430" : "#fff3f5",
      gap: theme.spacing.xs,
    },
    emptyTitle: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
