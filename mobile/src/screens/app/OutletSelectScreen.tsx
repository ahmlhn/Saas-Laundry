import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
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
  const entranceProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: 540,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);

  const heroAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress,
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-16, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const bodyAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [0, 0.36, 1],
      }),
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [22, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  if (!session) {
    return null;
  }

  const outlets = session.allowed_outlets;
  const rolesLabel = session.roles.length > 0 ? session.roles.join(", ") : "-";
  const quotaLimit = session.quota.orders_limit ?? 0;
  const hasQuotaLimit = quotaLimit > 0;
  const quotaProgress = hasQuotaLimit ? Math.min(session.quota.orders_used / quotaLimit, 1) : 0;
  const quotaLabel = hasQuotaLimit
    ? `${session.quota.orders_used}/${session.quota.orders_limit} order bulan ini`
    : "Tanpa batas order bulan ini";
  const planLabel = session.plan.key?.trim() ? session.plan.key.toUpperCase() : "FREE";

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} scroll>
      <Animated.View style={[styles.heroShell, heroAnimatedStyle]}>
        <View style={styles.heroBase} />
        <View style={styles.heroLayer} />
        <View style={styles.heroRing} />
        <View style={styles.heroWaveMain} />
        <View style={styles.heroWaveAccent} />

        <View style={styles.heroContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>CL</Text>
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brandTitle}>Cuci Laundry</Text>
              <Text style={styles.brandSubTitle}>Pilih outlet aktif</Text>
            </View>
          </View>
          <Text style={styles.heroText}>
            Outlet aktif menentukan konteks transaksi, status layanan, dan quick action selama sesi berjalan.
          </Text>
          <View style={styles.heroMetaRow}>
            <StatusPill label={`Plan ${planLabel}`} tone="info" />
            <StatusPill label={`${outlets.length} outlet`} tone="success" />
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.profileWrap, bodyAnimatedStyle]}>
        <AppPanel style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileIdentity}>
              <Text style={styles.profileName}>{session.user.name}</Text>
              <Text style={styles.profileRole}>Role: {rolesLabel}</Text>
            </View>
            <StatusPill label={session.quota.can_create_order ? "Order aktif" : "Order dibatasi"} tone={session.quota.can_create_order ? "success" : "warning"} />
          </View>
          <Text style={styles.quotaLabel}>{quotaLabel}</Text>
          {hasQuotaLimit ? (
            <View style={styles.quotaBarTrack}>
              <View
                style={[
                  styles.quotaBarFill,
                  {
                    width: `${Math.max(quotaProgress * 100, 5)}%`,
                    backgroundColor: quotaProgress >= 0.9 ? theme.colors.warning : theme.colors.primaryStrong,
                  },
                ]}
              />
            </View>
          ) : null}
        </AppPanel>
      </Animated.View>

      <Animated.View style={[styles.listWrap, bodyAnimatedStyle]}>
        {outlets.length === 0 ? (
          <AppPanel style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Belum ada outlet aktif untuk akun ini.</Text>
            <Text style={styles.emptyText}>Hubungi owner/admin tenant untuk assign outlet, lalu login ulang.</Text>
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
                  style={({ pressed }) => [
                    styles.outletCard,
                    active ? styles.outletCardActive : null,
                    pressed ? styles.outletCardPressed : null,
                  ]}
                >
                  <View style={[styles.outletAccent, active ? styles.outletAccentActive : null]} />
                  <View style={styles.outletTopRow}>
                    <Text style={styles.outletTitle}>
                      {outlet.code} - {outlet.name}
                    </Text>
                    <StatusPill label={active ? "Aktif" : "Pilih"} tone={active ? "success" : "neutral"} />
                  </View>
                  <Text style={styles.outletMeta}>Timezone: {outlet.timezone}</Text>
                  <Text style={styles.outletHint}>{active ? "Outlet ini sedang digunakan untuk seluruh transaksi Anda." : "Tap untuk memilih outlet ini sebagai konteks kerja."}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Animated.View>

      <Animated.View style={bodyAnimatedStyle}>
        <AppButton onPress={() => void logout()} title="Logout Akun" variant="secondary" />
      </Animated.View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    heroShell: {
      position: "relative",
      height: 238,
      borderRadius: 30,
      overflow: "hidden",
    },
    heroBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1f86e4",
    },
    heroLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "70%",
      backgroundColor: "#0a66c8",
      opacity: 0.56,
    },
    heroRing: {
      position: "absolute",
      top: -84,
      right: -70,
      width: 228,
      height: 228,
      borderRadius: 114,
      borderWidth: 36,
      borderColor: "rgba(255,255,255,0.1)",
    },
    heroWaveMain: {
      position: "absolute",
      left: -64,
      right: -40,
      bottom: -125,
      height: 205,
      borderRadius: 160,
      backgroundColor: "#ffffff",
    },
    heroWaveAccent: {
      position: "absolute",
      right: -44,
      bottom: -78,
      width: 172,
      height: 96,
      borderRadius: 70,
      backgroundColor: "rgba(62, 222, 236, 0.58)",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    brandBadge: {
      width: 50,
      height: 50,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.95)",
      backgroundColor: "rgba(10, 81, 166, 0.43)",
      alignItems: "center",
      justifyContent: "center",
    },
    brandBadgeText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 18,
      letterSpacing: 0.6,
    },
    brandTextWrap: {
      gap: 1,
    },
    brandTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 31,
    },
    brandSubTitle: {
      color: "rgba(255,255,255,0.86)",
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    heroText: {
      color: "rgba(255,255,255,0.9)",
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 326,
    },
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    profileWrap: {
      marginTop: -50,
      paddingHorizontal: 2,
    },
    profileCard: {
      borderRadius: 24,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      gap: theme.spacing.xs,
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.2,
      shadowRadius: 15,
      elevation: 7,
    },
    profileHeader: {
      flexDirection: "row",
      alignItems: "center",
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
      fontSize: 18,
      lineHeight: 22,
    },
    profileRole: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
      textTransform: "capitalize",
    },
    quotaLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    quotaBarTrack: {
      height: 8,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundStrong,
      overflow: "hidden",
    },
    quotaBarFill: {
      height: "100%",
      borderRadius: theme.radii.pill,
    },
    listWrap: {
      gap: theme.spacing.sm,
    },
    outletList: {
      gap: theme.spacing.sm,
    },
    outletCard: {
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      gap: 6,
      overflow: "hidden",
      position: "relative",
    },
    outletCardActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    outletCardPressed: {
      opacity: 0.88,
    },
    outletAccent: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: theme.colors.borderStrong,
    },
    outletAccentActive: {
      backgroundColor: theme.colors.info,
    },
    outletTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingLeft: 3,
    },
    outletTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 20,
    },
    outletMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      paddingLeft: 3,
    },
    outletHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
      paddingLeft: 3,
    },
    emptyCard: {
      borderColor: theme.mode === "dark" ? "#5c3444" : "#f5b8c6",
      backgroundColor: theme.mode === "dark" ? "#3a2430" : "#fff3f5",
      gap: theme.spacing.xs,
      borderRadius: theme.radii.lg,
    },
    emptyTitle: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 21,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
