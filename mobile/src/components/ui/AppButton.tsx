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
          backgroundColor: theme.colors.surfaceSoft,
          borderColor: theme.colors.borderStrong,
        },
        text: {
          color: theme.colors.textSecondary,
        },
      };
    }

    if (variant === "ghost") {
      return {
        container: {
          backgroundColor: "transparent",
          borderColor: theme.colors.borderStrong,
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
          opacity: isInactive ? 0.58 : pressed ? 0.88 : 1,
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
    minHeight: 46,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  leftElement: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
