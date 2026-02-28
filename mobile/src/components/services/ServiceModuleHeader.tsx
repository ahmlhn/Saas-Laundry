import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppPanel } from "../ui/AppPanel";
import { useAppTheme } from "../../theme/useAppTheme";

interface ServiceModuleHeaderProps {
  title: string;
  onBack: () => void;
  rightSlot?: ReactNode;
  children?: ReactNode;
}

export function ServiceModuleHeader({ title, onBack, rightSlot, children }: ServiceModuleHeaderProps) {
  const theme = useAppTheme();

  return (
    <AppPanel style={[styles.panel, { backgroundColor: theme.mode === "dark" ? "#102a40" : "#ebf9ff", borderColor: theme.colors.borderStrong }]}>
      <View pointerEvents="none" style={styles.decorWrap}>
        <View style={[styles.decorLarge, { backgroundColor: theme.mode === "dark" ? "rgba(28,211,226,0.14)" : "rgba(28,211,226,0.22)" }]} />
        <View style={[styles.decorSmall, { backgroundColor: theme.mode === "dark" ? "rgba(42,124,226,0.12)" : "rgba(42,124,226,0.14)" }]} />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.iconButton,
              {
                borderColor: theme.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(42,124,226,0.18)",
                backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.76)",
              },
              pressed ? styles.iconButtonPressed : null,
            ]}
          >
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>

          <Text numberOfLines={1} style={[styles.title, { color: theme.mode === "dark" ? theme.colors.textPrimary : "#0a365a", fontFamily: theme.fonts.bold }]}>
            {title}
          </Text>

          <View style={styles.sideSlot}>{rightSlot ?? <View style={styles.spacer} />}</View>
        </View>

        {children ? <View style={styles.body}>{children}</View> : null}
      </View>
    </AppPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 0,
    overflow: "hidden",
  },
  decorWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  decorLarge: {
    position: "absolute",
    top: -38,
    right: -12,
    width: 120,
    height: 120,
    borderRadius: 999,
  },
  decorSmall: {
    position: "absolute",
    bottom: -24,
    left: -16,
    width: 72,
    height: 72,
    borderRadius: 999,
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
  topRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.82,
  },
  title: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  sideSlot: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  spacer: {
    width: 32,
    height: 32,
  },
  body: {
    marginTop: 10,
    gap: 10,
  },
});
