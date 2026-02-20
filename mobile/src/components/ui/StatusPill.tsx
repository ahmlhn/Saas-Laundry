import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
}

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const theme = useAppTheme();

  const toneMap: Record<StatusTone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: theme.colors.surfaceSoft, fg: theme.colors.textSecondary, border: theme.colors.border },
    info: { bg: theme.colors.primarySoft, fg: theme.colors.info, border: theme.colors.ring },
    success: {
      bg: theme.mode === "dark" ? "#153b2a" : "#e9f8ef",
      fg: theme.colors.success,
      border: theme.mode === "dark" ? "#286246" : "#bfe7cf",
    },
    warning: {
      bg: theme.mode === "dark" ? "#412e14" : "#fff4de",
      fg: theme.colors.warning,
      border: theme.mode === "dark" ? "#7a5928" : "#f1d6a5",
    },
    danger: {
      bg: theme.mode === "dark" ? "#472130" : "#ffe8ed",
      fg: theme.colors.danger,
      border: theme.mode === "dark" ? "#7f3a53" : "#f3c1cd",
    },
  };

  const selected = toneMap[tone];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: selected.bg,
          borderColor: selected.border,
          borderRadius: theme.radii.pill,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected.fg, fontFamily: theme.fonts.semibold }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.25,
  },
});
