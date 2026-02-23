import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppLaunchLoaderProps {
  message?: string;
  version?: string;
}

export function AppLaunchLoader({ message, version }: AppLaunchLoaderProps) {
  const theme = useAppTheme();
  const spinProgress = useRef(new Animated.Value(0)).current;
  const pulseProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spinProgress, {
        toValue: 1,
        duration: 1900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseLoop = Animated.loop(
      Animated.timing(pulseProgress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );

    spinLoop.start();
    pulseLoop.start();

    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [pulseProgress, spinProgress]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const ringAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: spinProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "360deg"],
          }),
        },
      ],
      opacity: pulseProgress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.4, 0.9, 0.4],
      }),
    }),
    [pulseProgress, spinProgress]
  );

  const badgeAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pulseProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1, 1.04, 1],
          }),
        },
      ],
    }),
    [pulseProgress]
  );

  const dotAnimatedStyles = useMemo(
    () =>
      [
        [1, 0.3, 0.3, 1],
        [0.3, 1, 0.3, 0.3],
        [0.3, 0.3, 1, 0.3],
      ].map((opacityKeyframes) => ({
        opacity: pulseProgress.interpolate({
          inputRange: [0, 0.34, 0.67, 1],
          outputRange: opacityKeyframes,
        }),
        transform: [
          {
            scale: pulseProgress.interpolate({
              inputRange: [0, 0.34, 0.67, 1],
              outputRange: opacityKeyframes.map((value) => (value >= 1 ? 1.1 : 0.82)),
            }),
          },
        ],
      })),
    [pulseProgress]
  );

  const hasMessage = typeof message === "string" && message.trim().length > 0;
  const versionLabel = typeof version === "string" && version.trim().length > 0 ? `Versi ${version.trim()}` : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backdropLayer}>
        <View style={styles.backdropBlobTop} />
        <View style={styles.backdropBlobBottom} />
      </View>

      <View style={styles.centerWrap}>
        <View style={styles.loaderCard}>
          <Animated.View pointerEvents="none" style={[styles.spinRing, ringAnimatedStyle]} />
          <Animated.View style={[styles.badge, badgeAnimatedStyle]}>
            <View style={styles.badgeWave} />
            <Text style={styles.badgeText}>CL</Text>
          </Animated.View>

          <Text style={styles.brandTitle}>Cuci Laundry</Text>
          <Text style={styles.brandSubtitle}>OPERASIONAL MOBILE</Text>
          {hasMessage ? <Text style={styles.messageText}>{message}</Text> : null}

          <View style={styles.dotRow}>
            {dotAnimatedStyles.map((dotStyle, index) => (
              <Animated.View key={`launch-dot-${index}`} style={[styles.dot, dotStyle]} />
            ))}
          </View>
        </View>
      </View>

      {versionLabel ? (
        <View pointerEvents="none" style={styles.versionFooter}>
          <Text style={styles.versionText}>{versionLabel}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backdropLayer: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
    },
    backdropBlobTop: {
      position: "absolute",
      top: -170,
      right: -110,
      width: 340,
      height: 340,
      borderRadius: 200,
      backgroundColor: theme.mode === "dark" ? "rgba(38, 115, 163, 0.3)" : "rgba(52, 173, 234, 0.25)",
    },
    backdropBlobBottom: {
      position: "absolute",
      bottom: -120,
      left: -90,
      width: 300,
      height: 300,
      borderRadius: 180,
      backgroundColor: theme.mode === "dark" ? "rgba(31, 176, 194, 0.2)" : "rgba(89, 224, 230, 0.24)",
    },
    centerWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    loaderCard: {
      width: "100%",
      maxWidth: 340,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? "rgba(14, 38, 56, 0.92)" : "rgba(255,255,255,0.93)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 22,
      paddingVertical: 28,
      shadowColor: theme.mode === "dark" ? "#000000" : "#125c96",
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
      overflow: "hidden",
    },
    spinRing: {
      position: "absolute",
      top: 20,
      width: 108,
      height: 108,
      borderRadius: 54,
      borderWidth: 2.5,
      borderColor: "rgba(70, 196, 224, 0.28)",
      borderTopColor: "rgba(34, 164, 218, 0.85)",
    },
    badge: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 2,
      borderColor: theme.mode === "dark" ? "rgba(235, 244, 252, 0.72)" : "rgba(255,255,255,0.94)",
      backgroundColor: "#2f84db",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
      overflow: "hidden",
    },
    badgeWave: {
      position: "absolute",
      bottom: -15,
      width: 72,
      height: 28,
      borderRadius: 16,
      backgroundColor: "#ffd467",
      opacity: 0.95,
    },
    badgeText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: 0.4,
    },
    brandTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: 0.2,
      textAlign: "center",
    },
    brandSubtitle: {
      marginTop: 2,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      letterSpacing: 1.4,
      textAlign: "center",
    },
    messageText: {
      marginTop: 14,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    dotRow: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    versionText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      letterSpacing: 0.3,
    },
    versionFooter: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.mode === "dark" ? "#54d1f1" : "#1ca9db",
    },
  });
}
