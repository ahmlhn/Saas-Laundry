import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
}

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const theme = useAppTheme();

  const toneMap: Record<StatusTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceSoft, fg: theme.colors.textSecondary },
    info: { bg: theme.colors.primarySoft, fg: theme.colors.info },
    success: { bg: theme.mode === "dark" ? "#153b2a" : "#e9f8ef", fg: theme.colors.success },
    warning: { bg: theme.mode === "dark" ? "#412e14" : "#fff4de", fg: theme.colors.warning },
    danger: { bg: theme.mode === "dark" ? "#472130" : "#ffe8ed", fg: theme.colors.danger },
  };

  const selected = toneMap[tone];

  return (
    <View style={[styles.pill, { backgroundColor: selected.bg, borderRadius: theme.radii.pill }]}>
      <Text style={[styles.label, { color: selected.fg, fontFamily: theme.fonts.semibold }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
