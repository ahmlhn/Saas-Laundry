import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { API_BASE_URL } from "../../config/env";
import { checkApiHealth } from "../../features/auth/authApi";
import { getActiveApiBaseUrl, getApiBaseCandidates, getApiErrorMessage, getApiSetupChecklist } from "../../lib/httpClient";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

export function LoginScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { login } = useSession();
  const [email, setEmail] = useState("cashier@demo.local");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const setupChecklist = useMemo(() => getApiSetupChecklist(), []);
  const apiCandidates = useMemo(() => getApiBaseCandidates(), []);

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setConnectionMessage(null);

    try {
      await login({ email, password });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckConnection(): Promise<void> {
    if (checkingConnection) {
      return;
    }

    setCheckingConnection(true);
    setConnectionMessage("Mengecek koneksi API...");

    try {
      const health = await checkApiHealth();
      const timeInfo = health.time ? ` (${health.time})` : "";
      setConnectionMessage(`API terhubung: ok=${String(health.ok)}${timeInfo}`);
    } catch (error) {
      setConnectionMessage(getApiErrorMessage(error));
    } finally {
      setCheckingConnection(false);
    }
  }

  const isConnectionError = connectionMessage ? !connectionMessage.toLowerCase().includes("ok=true") : false;

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} scroll>
      <View style={styles.heroBlock}>
        <View style={styles.brandPill}>
          <Text style={styles.brandPillText}>bilas</Text>
        </View>
        <Text style={styles.heroTitle}>Masuk ke Kasir Mobile</Text>
        <Text style={styles.heroSubtitle}>Workflow operasional outlet, order harian, dan status layanan dalam satu tampilan.</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.panelTitle}>Login Akun</Text>
        <Text style={styles.panelSubtitle}>Gunakan akun yang sudah diberi akses outlet oleh owner/admin.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="email@contoh.com"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={email}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              onChangeText={setPassword}
              placeholder="Masukkan password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}>
              <Text style={styles.passwordToggleText}>{showPassword ? "Sembunyikan" : "Tampil"}</Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.actionsBlock}>
          <AppButton disabled={!canSubmit} loading={submitting} onPress={() => void handleSubmit()} title={submitting ? "Memproses..." : "Masuk Sekarang"} />
          <AppButton
            disabled={checkingConnection}
            loading={checkingConnection}
            onPress={() => void handleCheckConnection()}
            title={checkingConnection ? "Mengecek..." : "Tes Koneksi API"}
            variant="secondary"
          />
        </View>

        {connectionMessage ? (
          <View style={[styles.connectionInfo, isConnectionError ? styles.connectionError : styles.connectionOk]}>
            <Text style={styles.connectionText}>{connectionMessage}</Text>
          </View>
        ) : null}
      </AppPanel>

      <AppPanel style={styles.hintPanel}>
        <Text style={styles.hintTitle}>Pengaturan Environment</Text>
        <Text style={styles.hintText}>API dari env: {API_BASE_URL}</Text>
        <Text style={styles.hintText}>API aktif runtime: {getActiveApiBaseUrl()}</Text>
        <Text style={styles.hintText}>Kandidat fallback: {apiCandidates.join(", ")}</Text>
        <Text style={styles.hintText}>Pastikan `EXPO_PUBLIC_API_URL` sesuai emulator atau device fisik.</Text>
        {setupChecklist.map((tip, index) => (
          <Text key={`${index}-${tip}`} style={styles.hintText}>
            {index + 1}. {tip}
          </Text>
        ))}
      </AppPanel>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.lg,
    },
    heroBlock: {
      gap: theme.spacing.sm,
    },
    brandPill: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.primaryStrong,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    brandPillText: {
      color: theme.colors.primaryContrast,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      letterSpacing: 0.9,
      textTransform: "lowercase",
    },
    heroTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 30,
      lineHeight: 37,
    },
    heroSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 340,
    },
    panel: {
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
    },
    panelTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 22,
    },
    panelSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 20,
      marginTop: -4,
    },
    fieldGroup: {
      gap: theme.spacing.xs,
    },
    fieldLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontSize: 14,
    },
    passwordWrap: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      flexDirection: "row",
      alignItems: "center",
      paddingRight: 8,
    },
    passwordInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontSize: 14,
    },
    passwordToggle: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    passwordToggleText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    actionsBlock: {
      gap: theme.spacing.sm,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    connectionInfo: {
      borderRadius: theme.radii.md,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    connectionOk: {
      borderColor: theme.mode === "dark" ? "#1f5b3f" : "#bde7cc",
      backgroundColor: theme.mode === "dark" ? "#173926" : "#ebf9f0",
    },
    connectionError: {
      borderColor: theme.mode === "dark" ? "#703040" : "#f5bec8",
      backgroundColor: theme.mode === "dark" ? "#4a2330" : "#fff0f3",
    },
    connectionText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    hintPanel: {
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.borderStrong,
      gap: theme.spacing.xs,
    },
    hintTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    hintText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
