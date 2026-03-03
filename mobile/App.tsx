import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Linking, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { APP_VERSION } from "./src/config/appVersion";
import { AppLaunchLoader } from "./src/components/system/AppLaunchLoader";
import { AppUpdateRequiredScreen } from "./src/components/system/AppUpdateRequiredScreen";
import { checkAndroidAppUpdate, resolveAndroidUpdateUrl } from "./src/features/appUpdate/updateChecker";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthNavigator } from "./src/navigation/AuthNavigator";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { useAppTheme } from "./src/theme/useAppTheme";

interface ForcedUpdateState {
  currentVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string | null;
  releaseNote: string | null;
  updateUrl: string;
}

function RootRouter({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { booting, session } = useSession();
  const startupReady = fontsLoaded && !booting;
  const [showLoader, setShowLoader] = useState(true);
  const [forcedUpdate, setForcedUpdate] = useState<ForcedUpdateState | null>(null);
  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(10)).current;
  const updatePromptShownRef = useRef(false);

  useEffect(() => {
    if (!startupReady) {
      setShowLoader(true);
      loaderOpacity.setValue(1);
      contentOpacity.setValue(0);
      contentTranslateY.setValue(10);
      return;
    }

    const transition = Animated.parallel([
      Animated.timing(loaderOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    transition.start(({ finished }) => {
      if (finished) {
        setShowLoader(false);
      }
    });

    return () => {
      transition.stop();
    };
  }, [startupReady, contentOpacity, contentTranslateY, loaderOpacity]);

  useEffect(() => {
    if (Platform.OS !== "android" || !startupReady || showLoader || updatePromptShownRef.current) {
      return;
    }

    updatePromptShownRef.current = true;
    let cancelled = false;

    const timer = setTimeout(() => {
      void checkAndroidAppUpdate()
        .then((result) => {
          if (cancelled || result.status === "current") {
            return;
          }

          const primaryUrl = resolveAndroidUpdateUrl(result.release);
          if (!primaryUrl) {
            return;
          }

          if (result.status === "required") {
            setForcedUpdate({
              currentVersion: result.currentVersion,
              latestVersion: result.latestVersion,
              minimumSupportedVersion: result.minimumSupportedVersion,
              releaseNote: result.release.notes[0] ?? null,
              updateUrl: primaryUrl,
            });
            return;
          }

          const releaseNote = result.release.notes[0] ?? null;
          const title = "Update tersedia";
          const message = `Versi ${result.latestVersion} tersedia untuk diunduh.${releaseNote ? `\n\nCatatan: ${releaseNote}` : ""}`;

          Alert.alert(title, message, [
            { text: "Nanti", style: "cancel" },
            {
              text: result.release.download_url ? "Unduh APK" : "Buka Halaman",
              onPress: () => {
                void Linking.openURL(primaryUrl).catch(() => undefined);
              },
            },
          ]);
        })
        .catch(() => undefined);
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showLoader, startupReady]);

  const loadingMessage = fontsLoaded ? "Menyiapkan sesi aplikasi..." : "";

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.contentLayer,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        {startupReady
          ? forcedUpdate
            ? (
                <AppUpdateRequiredScreen
                  currentVersion={forcedUpdate.currentVersion}
                  latestVersion={forcedUpdate.latestVersion}
                  minimumSupportedVersion={forcedUpdate.minimumSupportedVersion}
                  onOpenUpdate={() => {
                    void Linking.openURL(forcedUpdate.updateUrl).catch(() => undefined);
                  }}
                  releaseNote={forcedUpdate.releaseNote}
                />
              )
            : session
              ? <AppNavigator />
              : <AuthNavigator />
          : null}
      </Animated.View>

      {showLoader ? (
        <Animated.View style={[styles.loaderLayer, { opacity: loaderOpacity }]}>
          <AppLaunchLoader message={loadingMessage} version={APP_VERSION} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function App() {
  const theme = useAppTheme();
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer>
          <RootRouter fontsLoaded={fontsLoaded} />
          <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentLayer: {
    flex: 1,
  },
  loaderLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
