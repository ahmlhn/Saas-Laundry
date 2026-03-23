import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnectivity } from "../../features/connectivity/ConnectivityContext";
import { useSync } from "../../features/sync/SyncContext";
import { useSession } from "../../state/SessionContext";
import { useAppTheme } from "../../theme/useAppTheme";

export function SyncStatusHud() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const connectivity = useConnectivity();
  const { isSyncing, unsyncedCount, rejectedCount } = useSync();

  if (!session) {
    return null;
  }

  let label = "Online";
  let backgroundColor = theme.mode === "dark" ? "#173f2d" : "#edf9f1";
  let borderColor = theme.mode === "dark" ? "#286246" : "#bfe7cf";
  let textColor = theme.colors.success;

  if (rejectedCount > 0) {
    label = `Sync gagal ${rejectedCount}`;
    backgroundColor = theme.mode === "dark" ? "#482633" : "#fff1f4";
    borderColor = theme.mode === "dark" ? "#6c3242" : "#f0bbc5";
    textColor = theme.colors.danger;
  } else if (connectivity.isOffline) {
    label = unsyncedCount > 0 ? `Offline • ${unsyncedCount} belum sinkron` : "Offline";
    backgroundColor = theme.mode === "dark" ? "#412e14" : "#fff4de";
    borderColor = theme.mode === "dark" ? "#7a5928" : "#f1d6a5";
    textColor = theme.colors.warning;
  } else if (isSyncing) {
    label = "Sinkronisasi...";
    backgroundColor = theme.mode === "dark" ? "#133f5a" : "#d9f8ff";
    borderColor = theme.mode === "dark" ? "#2f506f" : "#82dffc";
    textColor = theme.colors.info;
  } else if (unsyncedCount > 0) {
    label = `Belum sinkron ${unsyncedCount}`;
    backgroundColor = theme.mode === "dark" ? "#412e14" : "#fff4de";
    borderColor = theme.mode === "dark" ? "#7a5928" : "#f1d6a5";
    textColor = theme.colors.warning;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12),
          right: 16,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      <Text style={[styles.label, { color: textColor, fontFamily: theme.fonts.semibold }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 50,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
