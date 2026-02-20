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
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthNavigator } from "./src/navigation/AuthNavigator";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { useAppTheme } from "./src/theme/useAppTheme";

function RootRouter() {
  const { booting, session } = useSession();
  const theme = useAppTheme();

  if (booting) {
    return (
      <SafeAreaView style={[styles.loadingSafeArea, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryStrong} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold }]}>
            Menyiapkan sesi aplikasi...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return session ? <AppNavigator /> : <AuthNavigator />;
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
          {fontsLoaded ? (
            <RootRouter />
          ) : (
            <SafeAreaView style={[styles.loadingSafeArea, { backgroundColor: theme.colors.background }]}>
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primaryStrong} />
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Menyiapkan tampilan aplikasi...</Text>
              </View>
            </SafeAreaView>
          )}
          <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    backgroundColor: "#f4f7f8",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
});
