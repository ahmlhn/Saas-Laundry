import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AppPanel({ children, style }: AppPanelProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          shadowColor: theme.shadows.color,
          shadowOpacity: theme.shadows.cardOpacity,
          shadowRadius: theme.shadows.cardRadius,
          elevation: theme.shadows.cardElevation,
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
    padding: 16,
    gap: 10,
    shadowOffset: { width: 0, height: 5 },
  },
});
