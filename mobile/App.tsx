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
import { Animated, Easing, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppLaunchLoader } from "./src/components/system/AppLaunchLoader";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthNavigator } from "./src/navigation/AuthNavigator";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { useAppTheme } from "./src/theme/useAppTheme";

const APP_VERSION: string = (require("./app.json")?.expo?.version as string | undefined) ?? "1.0.0";

function RootRouter({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { booting, session } = useSession();
  const startupReady = fontsLoaded && !booting;
  const [showLoader, setShowLoader] = useState(true);
  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(10)).current;

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
        {startupReady ? (session ? <AppNavigator /> : <AuthNavigator />) : null}
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
