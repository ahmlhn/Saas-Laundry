import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { navigateFromNotificationAction } from "../../features/notifications/notificationNavigation";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../features/notifications/notificationApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { AppNotificationItem } from "../../types/notification";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "Notifications">;

function formatNotificationTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityTone(priority: string): "info" | "warning" | "danger" {
  if (priority === "high") {
    return "warning";
  }

  if (priority === "urgent") {
    return "danger";
  }

  return "info";
}

function resolvePriorityColors(theme: AppTheme, priority: string): { badgeBg: string; badgeFg: string; dot: string } {
  const tone = priorityTone(priority);

  if (tone === "warning") {
    return {
      badgeBg: theme.mode === "dark" ? "#4a3718" : "#fff4de",
      badgeFg: theme.colors.warning,
      dot: theme.colors.warning,
    };
  }

  if (tone === "danger") {
    return {
      badgeBg: theme.mode === "dark" ? "#4a2432" : "#ffe8ed",
      badgeFg: theme.colors.danger,
      dot: theme.colors.danger,
    };
  }

  return {
    badgeBg: theme.mode === "dark" ? "#17374f" : "#eef8ff",
    badgeFg: theme.colors.info,
    dot: theme.colors.info,
  };
}

export function NotificationInboxScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const isCompactLandscape = width > height && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const [items, setItems] = useState<AppNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  const loadNotifications = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const payload = await listNotifications({
          limit: 50,
        });

        setItems(payload.data);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void loadNotifications(false);
    }, [loadNotifications])
  );

  const openNotification = useCallback(
    async (item: AppNotificationItem): Promise<void> => {
      const nextReadAt = new Date().toISOString();

      if (!item.read_at) {
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  read_at: nextReadAt,
                }
              : row
          )
        );

        try {
          await markNotificationRead(item.id);
        } catch {
          setItems((current) =>
            current.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    read_at: null,
                  }
                : row
            )
          );
        }
      }

      navigateFromNotificationAction(item.action);
    },
    []
  );

  const handleMarkAllRead = useCallback(async (): Promise<void> => {
    if (markingAll || unreadCount === 0) {
      return;
    }

    setMarkingAll(true);
    const nextReadAt = new Date().toISOString();
    const previous = items;
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? nextReadAt })));

    try {
      await markAllNotificationsRead();
    } catch (error) {
      setItems(previous);
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll, unreadCount]);

  return (
    <AppScreen style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}>
          <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Notifikasi</Text>
          <Text style={styles.subtitle}>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua notifikasi sudah terbaca"}</Text>
        </View>
        <Pressable disabled={markingAll || unreadCount === 0} onPress={() => void handleMarkAllRead()} style={({ pressed }) => [styles.headerAction, pressed ? styles.headerActionPressed : null, markingAll || unreadCount === 0 ? styles.headerActionDisabled : null]}>
          <Text style={styles.headerActionText}>{markingAll ? "..." : "Tandai semua"}</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.info} />
          <Text style={styles.loadingText}>Memuat notifikasi...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl onRefresh={() => void loadNotifications(true)} refreshing={refreshing} tintColor={theme.colors.info} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <AppPanel style={styles.emptyPanel}>
              <Ionicons color={theme.colors.textMuted} name="notifications-outline" size={30} />
              <Text style={styles.emptyTitle}>Belum ada notifikasi</Text>
              <Text style={styles.emptyText}>Notifikasi operasional dari server akan muncul di sini, termasuk pembayaran masuk, laundry siap, pengantaran, dan status langganan.</Text>
            </AppPanel>
          ) : (
            items.map((item) => {
              const colors = resolvePriorityColors(theme, item.priority);
              const unread = !item.read_at;

              return (
                <Pressable key={item.id} onPress={() => void openNotification(item)} style={({ pressed }) => [styles.card, unread ? styles.cardUnread : null, pressed ? styles.cardPressed : null]}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.priorityBadge, { backgroundColor: colors.badgeBg }]}>
                      <Text style={[styles.priorityBadgeText, { color: colors.badgeFg }]}>{item.priority === "high" ? "Prioritas" : "Info"}</Text>
                    </View>
                    <Text style={styles.timeText}>{formatNotificationTime(item.created_at)}</Text>
                  </View>

                  <View style={styles.cardBody}>
                    {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.dot }]} /> : <View style={styles.unreadDotSpacer} />}
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardText}>{item.body}</Text>
                      {item.outlet ? <Text style={styles.cardMeta}>{`${item.outlet.code} - ${item.outlet.name}`}</Text> : null}
                    </View>
                    {item.action ? <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    iconButtonPressed: {
      opacity: 0.76,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 24 : 21,
      lineHeight: isTablet ? 29 : 25,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    headerAction: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === "dark" ? theme.colors.surfaceSoft : "#eef8ff",
    },
    headerActionPressed: {
      opacity: 0.76,
    },
    headerActionDisabled: {
      opacity: 0.45,
    },
    headerActionText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#804056" : "#f0bec8",
      backgroundColor: theme.mode === "dark" ? "#452434" : "#fff3f6",
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    content: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    emptyPanel: {
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xl,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
      lineHeight: 22,
      textAlign: "center",
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
    },
    card: {
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.16 : 0.08,
      shadowRadius: theme.shadows.cardRadius,
      shadowOffset: { width: 0, height: 6 },
      elevation: theme.shadows.cardElevation,
    },
    cardUnread: {
      borderColor: theme.mode === "dark" ? theme.colors.borderStrong : "#cfe7da",
    },
    cardPressed: {
      opacity: 0.8,
    },
    cardTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    priorityBadge: {
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    priorityBadgeText: {
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      lineHeight: 14,
    },
    timeText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    cardBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      marginTop: 6,
    },
    unreadDotSpacer: {
      width: 9,
      height: 9,
      marginTop: 6,
    },
    cardCopy: {
      flex: 1,
      gap: 4,
    },
    cardTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 21,
    },
    cardText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 20,
    },
    cardMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
  });
}
