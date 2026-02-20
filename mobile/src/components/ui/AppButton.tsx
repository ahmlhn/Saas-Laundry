import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface AppButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  leftElement?: ReactNode;
}

export function AppButton({ title, onPress, disabled = false, loading = false, variant = "primary", leftElement }: AppButtonProps) {
  const theme = useAppTheme();
  const isInactive = disabled || loading;

  function getVariantStyle() {
    if (variant === "secondary") {
      return {
        container: {
          backgroundColor: theme.mode === "dark" ? "#1a354f" : "#eef8ff",
          borderColor: theme.colors.borderStrong,
        },
        text: {
          color: theme.colors.info,
        },
      };
    }

    if (variant === "ghost") {
      return {
        container: {
          backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.78)",
          borderColor: theme.colors.border,
        },
        text: {
          color: theme.colors.textPrimary,
        },
      };
    }

    return {
      container: {
        backgroundColor: theme.colors.primaryStrong,
        borderColor: theme.colors.primaryStrong,
        shadowColor: theme.colors.primaryStrong,
        shadowOpacity: theme.mode === "dark" ? 0.34 : 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
      text: {
        color: theme.colors.primaryContrast,
      },
    };
  }

  const variantStyle = getVariantStyle();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: theme.radii.md,
          opacity: isInactive ? 0.56 : pressed ? 0.94 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        variantStyle.container,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? theme.colors.primaryContrast : theme.colors.textSecondary} size="small" /> : null}
      {leftElement ? <View style={styles.leftElement}>{leftElement}</View> : null}
      <Text style={[styles.title, { fontFamily: theme.fonts.bold }, variantStyle.text]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 15,
  },
  leftElement: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13.5,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
