import type { ReactNode, RefObject } from "react";
import type { ScrollViewProps, StyleProp, ViewStyle } from "react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  scrollRef?: RefObject<ScrollView | null>;
}

export function AppScreen({
  children,
  scroll = false,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = "handled",
  scrollRef,
}: AppScreenProps) {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.backdropLayer} pointerEvents="none">
        <View style={[styles.blobLarge, { backgroundColor: theme.colors.primarySoft }]} />
        <View style={[styles.blobSmall, { backgroundColor: theme.colors.backgroundStrong }]} />
      </View>

      {scroll ? (
        <ScrollView
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          ref={scrollRef}
          style={[styles.flex, style]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, style, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  blobLarge: {
    position: "absolute",
    top: -130,
    right: -80,
    width: 290,
    height: 290,
    borderRadius: 170,
    opacity: 0.65,
  },
  blobSmall: {
    position: "absolute",
    top: 120,
    left: -95,
    width: 210,
    height: 210,
    borderRadius: 120,
    opacity: 0.45,
  },
});
