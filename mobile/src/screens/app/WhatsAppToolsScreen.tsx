import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { listWaMessages, listWaProviders } from "../../features/wa/waApi";
import { canOpenWaModule, isWaPlanEligible } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { WaMessageSummary, WaProvider } from "../../types/wa";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "WhatsAppTools">;

export function WhatsAppToolsScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<WaProvider[]>([]);
  const [messages, setMessages] = useState<WaMessageSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const roles = session?.roles ?? [];
  const planKey = session?.plan.key ?? null;
  const roleAllowed = canOpenWaModule(roles);
  const planAllowed = isWaPlanEligible(planKey);

  useEffect(() => {
    void loadData();
  }, [roleAllowed, planAllowed]);

  async function loadData(): Promise<void> {
    if (!roleAllowed || !planAllowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [providerData, messageData] = await Promise.all([listWaProviders(), listWaMessages(30)]);
      setProviders(providerData);
      setMessages(messageData);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const messageSummary = useMemo(() => {
    const delivered = messages.filter((item) => item.status === "delivered").length;
    const sent = messages.filter((item) => item.status === "sent").length;
    const queued = messages.filter((item) => item.status === "queued").length;
    const failed = messages.filter((item) => item.status === "failed").length;

    return { delivered, sent, queued, failed };
  }, [messages]);

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="logo-whatsapp" size={15} />
            <Text style={styles.heroBadgeText}>Kirim WA</Text>
          </View>
          <Pressable onPress={() => void loadData()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Kirim WA</Text>
        <Text style={styles.subtitle}>Kontrol provider dan ringkasan status pesan WhatsApp tenant.</Text>
      </AppPanel>

      {!roleAllowed ? (
        <View style={styles.warningWrap}>
          <Ionicons color={theme.colors.danger} name="lock-closed-outline" size={16} />
          <StatusPill label="Akses Ditolak" tone="danger" />
          <Text style={styles.warningText}>Fitur WA hanya untuk owner/admin.</Text>
        </View>
      ) : null}

      {!planAllowed ? (
        <View style={styles.warningWrap}>
          <Ionicons color={theme.colors.warning} name="arrow-up-circle-outline" size={16} />
          <StatusPill label="Upgrade Plan" tone="warning" />
          <Text style={styles.warningText}>Fitur WA tersedia untuk plan Premium atau Pro.</Text>
        </View>
      ) : null}

      {roleAllowed && planAllowed ? (
        <>
          <AppPanel style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.sectionTitle}>Provider WA</Text>
              <AppButton
                leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={17} />}
                onPress={() => void loadData()}
                title="Refresh"
                variant="secondary"
              />
            </View>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.primaryStrong} />
                <Text style={styles.loadingText}>Memuat provider...</Text>
              </View>
            ) : providers.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada provider aktif.</Text>
            ) : (
              <View style={styles.listWrap}>
                {providers.map((provider) => (
                  <View key={provider.id} style={styles.listItem}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{provider.name}</Text>
                      <Text style={styles.listSubtitle}>Key: {provider.key}</Text>
                    </View>
                    <StatusPill label={provider.is_active ? "Aktif" : "Nonaktif"} tone={provider.is_active ? "success" : "neutral"} />
                  </View>
                ))}
              </View>
            )}
          </AppPanel>

          <AppPanel style={styles.panel}>
            <Text style={styles.sectionTitle}>Ringkasan Pesan Terakhir</Text>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.primaryStrong} />
                <Text style={styles.loadingText}>Memuat statistik pesan...</Text>
              </View>
            ) : (
              <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{messageSummary.delivered}</Text>
                  <Text style={styles.metricLabel}>Delivered</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{messageSummary.sent}</Text>
                  <Text style={styles.metricLabel}>Sent</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{messageSummary.queued}</Text>
                  <Text style={styles.metricLabel}>Queued</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricValue, styles.failedValue]}>{messageSummary.failed}</Text>
                  <Text style={styles.metricLabel}>Failed</Text>
                </View>
              </View>
            )}
          </AppPanel>
        </>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.92)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
      flex: 1,
    },
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    listWrap: {
      gap: theme.spacing.xs,
    },
    listItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    listMain: {
      flex: 1,
      gap: 1,
    },
    listTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 14.5 : 14,
    },
    listSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    metricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    metricCard: {
      minWidth: isTablet ? 190 : 150,
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    metricValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
    },
    failedValue: {
      color: theme.colors.danger,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    warningWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#684d1f" : "#f0d7a8",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#3f3117" : "#fff8ea",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 7,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
    },
    warningText: {
      flex: 1,
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
