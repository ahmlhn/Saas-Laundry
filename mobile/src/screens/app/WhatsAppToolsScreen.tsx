import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Kirim WA</Text>
        <Text style={styles.subtitle}>Kontrol provider dan ringkasan status pesan WhatsApp tenant.</Text>
      </View>

      {!roleAllowed ? (
        <View style={styles.warningWrap}>
          <StatusPill label="Akses Ditolak" tone="danger" />
          <Text style={styles.warningText}>Fitur WA hanya untuk owner/admin.</Text>
        </View>
      ) : null}

      {!planAllowed ? (
        <View style={styles.warningWrap}>
          <StatusPill label="Upgrade Plan" tone="warning" />
          <Text style={styles.warningText}>Fitur WA tersedia untuk plan Premium atau Pro.</Text>
        </View>
      ) : null}

      {roleAllowed && planAllowed ? (
        <>
          <AppPanel style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.sectionTitle}>Provider WA</Text>
              <AppButton onPress={() => void loadData()} title="Refresh" variant="secondary" />
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
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    header: {
      gap: 2,
    },
    backButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 2,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
      fontSize: 16,
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
      fontSize: 14,
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
      minWidth: "47%",
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
      fontSize: 15,
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
      paddingVertical: 9,
      gap: 6,
    },
    warningText: {
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
      paddingVertical: 9,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
