import { useContext, type ReactNode, type RefObject } from "react";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import type { ScrollViewProps, StyleProp, ViewStyle } from "react-native";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppScreenProps {
  children: ReactNode;
  overlay?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: ScrollViewProps["refreshControl"];
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  scrollRef?: RefObject<ScrollView | null>;
  onScroll?: ScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
  showBackdrop?: boolean;
  stickyHeaderIndices?: number[];
  safeAreaEdges?: Edge[];
}

export function AppScreen({
  children,
  overlay,
  scroll = false,
  style,
  backgroundColor,
  contentContainerStyle,
  refreshControl,
  keyboardShouldPersistTaps = "handled",
  scrollRef,
  onScroll,
  scrollEventThrottle = 16,
  showBackdrop = true,
  stickyHeaderIndices,
  safeAreaEdges,
}: AppScreenProps) {
  const theme = useAppTheme();
  const bottomTabBarHeight = useContext(BottomTabBarHeightContext);
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const maxContentWidth = isTablet ? (isLandscape ? 1100 : 840) : isLandscape ? 760 : 540;
  const resolvedSafeAreaEdges = safeAreaEdges ?? (bottomTabBarHeight === undefined ? ["top", "right", "bottom", "left"] : ["top", "right", "left"]);
  const resolvedBackgroundColor = backgroundColor ?? theme.colors.background;

  return (
    <SafeAreaView edges={resolvedSafeAreaEdges} style={[styles.safeArea, { backgroundColor: resolvedBackgroundColor }]}>
      {showBackdrop ? (
        <View style={styles.backdropLayer} pointerEvents="none">
          <View
            style={[
              styles.blobLarge,
              isLandscape ? styles.blobLargeLandscape : null,
              {
                backgroundColor: theme.colors.primarySoft,
                opacity: isLandscape ? 0.5 : 0.62,
              },
            ]}
          />
          <View
            style={[
              styles.blobSmall,
              isLandscape ? styles.blobSmallLandscape : null,
              {
                backgroundColor: theme.colors.backgroundStrong,
                opacity: isLandscape ? 0.34 : 0.45,
              },
            ]}
          />
        </View>
      ) : null}

      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { maxWidth: maxContentWidth }, contentContainerStyle]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          onScroll={onScroll}
          refreshControl={refreshControl}
          ref={scrollRef}
          scrollEventThrottle={scrollEventThrottle}
          stickyHeaderIndices={stickyHeaderIndices}
          style={[styles.flex, styles.contentLayer, style]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.flex,
            styles.fixedContent,
            styles.contentLayer,
            { maxWidth: maxContentWidth },
            style,
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}
      {overlay}
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
  scrollContent: {
    width: "100%",
    alignSelf: "center",
    flexGrow: 1,
  },
  fixedContent: {
    width: "100%",
    alignSelf: "center",
  },
  contentLayer: {
    position: "relative",
    zIndex: 1,
    elevation: 1,
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
  },
  blobLargeLandscape: {
    top: -160,
    right: -120,
    width: 360,
    height: 360,
  },
  blobSmall: {
    position: "absolute",
    top: 120,
    left: -95,
    width: 210,
    height: 210,
    borderRadius: 120,
  },
  blobSmallLandscape: {
    top: 88,
    left: -130,
    width: 260,
    height: 260,
    borderRadius: 140,
  },
});
