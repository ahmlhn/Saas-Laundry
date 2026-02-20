import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AppPanel({ children, style }: AppPanelProps) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const padding = isTablet ? 18 : 16;
  const borderRadius = isTablet ? theme.radii.xl : theme.radii.lg;
  const elevation = isLandscape ? theme.shadows.cardElevation + 1 : theme.shadows.cardElevation;

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius,
          padding,
          shadowColor: theme.shadows.color,
          shadowOpacity: theme.mode === "dark" ? theme.shadows.cardOpacity + 0.04 : theme.shadows.cardOpacity + 0.02,
          shadowRadius: theme.shadows.cardRadius + 1,
          elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    gap: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
