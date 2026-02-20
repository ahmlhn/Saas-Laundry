import type { DimensionValue } from "react-native";
import { StyleSheet, View } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface AppSkeletonBlockProps {
  height?: number;
  width?: DimensionValue;
  radius?: number;
}

export function AppSkeletonBlock({ height = 14, width = "100%", radius }: AppSkeletonBlockProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.block,
        {
          height,
          width,
          borderRadius: radius ?? theme.radii.sm,
          backgroundColor: theme.mode === "dark" ? "#20384f" : "#dfeef9",
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: "hidden",
  },
});
