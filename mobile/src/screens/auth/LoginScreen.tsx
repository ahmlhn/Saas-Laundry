import { useMemo, useRef, useState } from "react";
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

type FocusedField = "email" | "password" | null;

export function LoginScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { login, biometricLogin, hasStoredSession, biometricAvailable, biometricEnabled, biometricLabel } = useSession();
  const [email, setEmail] = useState("cashier@demo.local");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const passwordInputRef = useRef<TextInput | null>(null);
  const setupChecklist = useMemo(() => getApiSetupChecklist(), []);
  const apiCandidates = useMemo(() => getApiBaseCandidates(), []);
  const activeApiBaseUrl = getActiveApiBaseUrl();

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0;
  const canBiometricLogin = hasStoredSession && biometricAvailable && biometricEnabled && !biometricSubmitting && !submitting;
  const inputDisabled = submitting || biometricSubmitting;

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

  async function handleBiometricLogin(): Promise<void> {
    if (!canBiometricLogin) {
      return;
    }

    setBiometricSubmitting(true);
    setErrorMessage(null);
    setConnectionMessage(null);

    try {
      await biometricLogin();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBiometricSubmitting(false);
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
  const diagnosticsToggleLabel = showDiagnostics ? "Sembunyikan Diagnostik API" : "Lihat Diagnostik API";

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} scroll>
      <View style={styles.heroCard}>
        <View style={styles.heroGlowLarge} pointerEvents="none" />
        <View style={styles.heroGlowSmall} pointerEvents="none" />

        <View style={styles.brandRow}>
          <View style={styles.brandPill}>
            <Text style={styles.brandPillText}>bilas</Text>
          </View>
          <Text style={styles.brandMeta}>Mobile Ops</Text>
        </View>
        <Text style={styles.heroTitle}>Masuk dan mulai operasional outlet.</Text>
        <Text style={styles.heroSubtitle}>Pantau pesanan, update status layanan, dan jalankan quick action dari satu aplikasi.</Text>
        <View style={styles.heroChipRow}>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>Order Harian</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>Status Real-time</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>Multi Outlet</Text>
          </View>
        </View>
      </View>

      <AppPanel style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Login Akun</Text>
          <Text style={styles.panelSubtitle}>Gunakan akun yang sudah diberi akses outlet oleh owner/admin.</Text>
        </View>

        <View style={styles.apiBadge}>
          <Text style={styles.apiBadgeLabel}>Endpoint aktif</Text>
          <Text numberOfLines={1} style={styles.apiBadgeValue}>
            {activeApiBaseUrl}
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!inputDisabled}
            keyboardType="email-address"
            onBlur={() => setFocusedField((field) => (field === "email" ? null : field))}
            onChangeText={setEmail}
            onFocus={() => setFocusedField("email")}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            placeholder="email@contoh.com"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="next"
            style={[styles.input, focusedField === "email" ? styles.inputFocused : null]}
            textContentType="emailAddress"
            value={email}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={[styles.passwordWrap, focusedField === "password" ? styles.inputFocused : null]}>
            <TextInput
              editable={!inputDisabled}
              onBlur={() => setFocusedField((field) => (field === "password" ? null : field))}
              onChangeText={setPassword}
              onFocus={() => setFocusedField("password")}
              onSubmitEditing={() => {
                if (canSubmit) {
                  void handleSubmit();
                }
              }}
              placeholder="Masukkan password"
              placeholderTextColor={theme.colors.textMuted}
              ref={passwordInputRef}
              returnKeyType="go"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              textContentType="password"
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              disabled={inputDisabled}
              onPress={() => setShowPassword((value) => !value)}
              style={({ pressed }) => [styles.passwordToggle, pressed ? styles.passwordTogglePressed : null]}
            >
              <Text style={styles.passwordToggleText}>{showPassword ? "Sembunyikan" : "Tampil"}</Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorTitle}>Login gagal</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.actionsBlock}>
          <AppButton disabled={!canSubmit} loading={submitting} onPress={() => void handleSubmit()} title={submitting ? "Memproses..." : "Masuk Sekarang"} />
          {hasStoredSession ? (
            <AppButton
              disabled={!canBiometricLogin}
              loading={biometricSubmitting}
              onPress={() => void handleBiometricLogin()}
              title={biometricSubmitting ? "Verifikasi..." : `Masuk dengan ${biometricLabel}`}
              variant="secondary"
            />
          ) : null}
        </View>

        <View style={styles.utilityRow}>
          <Pressable
            accessibilityRole="button"
            disabled={checkingConnection}
            onPress={() => void handleCheckConnection()}
            style={({ pressed }) => [
              styles.utilityButton,
              checkingConnection ? styles.utilityButtonDisabled : null,
              pressed && !checkingConnection ? styles.utilityButtonPressed : null,
            ]}
          >
            <Text style={styles.utilityButtonText}>{checkingConnection ? "Mengecek koneksi..." : "Tes Koneksi API"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDiagnostics((value) => !value)}
            style={({ pressed }) => [styles.utilityButton, pressed ? styles.utilityButtonPressed : null]}
          >
            <Text style={styles.utilityButtonText}>{diagnosticsToggleLabel}</Text>
          </Pressable>
        </View>

        {hasStoredSession && (!biometricAvailable || !biometricEnabled) ? (
          <View style={styles.biometricHintWrap}>
            <Text style={styles.biometricHint}>Sesi sebelumnya terdeteksi. Aktifkan login biometrik dari menu Akun untuk akses cepat.</Text>
          </View>
        ) : null}

        {connectionMessage ? (
          <View style={[styles.connectionInfo, isConnectionError ? styles.connectionError : styles.connectionOk]}>
            <Text style={styles.connectionText}>{connectionMessage}</Text>
          </View>
        ) : null}
      </AppPanel>

      {showDiagnostics ? (
        <AppPanel style={styles.hintPanel}>
          <Text style={styles.hintTitle}>Diagnostik API</Text>
          <Text style={styles.hintText}>API dari env: {API_BASE_URL}</Text>
          <Text style={styles.hintText}>API aktif runtime: {activeApiBaseUrl}</Text>
          <Text style={styles.hintText}>Kandidat fallback: {apiCandidates.join(", ")}</Text>
          <Text style={styles.hintText}>Pastikan `EXPO_PUBLIC_API_URL` sesuai emulator atau device fisik.</Text>
          {setupChecklist.map((tip, index) => (
            <Text key={`${index}-${tip}`} style={styles.hintText}>
              {index + 1}. {tip}
            </Text>
          ))}
        </AppPanel>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.lg,
    },
    heroCard: {
      position: "relative",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.xl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    heroGlowLarge: {
      position: "absolute",
      top: -58,
      right: -34,
      width: 176,
      height: 176,
      borderRadius: 90,
      backgroundColor: theme.colors.primarySoft,
      opacity: 0.85,
    },
    heroGlowSmall: {
      position: "absolute",
      bottom: -74,
      left: -42,
      width: 148,
      height: 148,
      borderRadius: 74,
      backgroundColor: theme.colors.backgroundStrong,
      opacity: 0.7,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    brandPill: {
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
    brandMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 29,
      lineHeight: 35,
    },
    heroSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 21,
    },
    heroChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    heroChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    heroChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.15,
    },
    panel: {
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
    },
    panelHeader: {
      gap: 2,
    },
    panelTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 21,
    },
    panelSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    apiBadge: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 9,
      gap: 2,
    },
    apiBadgeLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    apiBadgeValue: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
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
      minHeight: 47,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontSize: 14,
    },
    inputFocused: {
      borderColor: theme.colors.ring,
      shadowColor: theme.colors.ring,
      shadowOpacity: theme.mode === "dark" ? 0.35 : 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    passwordWrap: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      flexDirection: "row",
      alignItems: "center",
      minHeight: 47,
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
    passwordTogglePressed: {
      opacity: 0.82,
    },
    passwordToggleText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    actionsBlock: {
      gap: theme.spacing.sm,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 2,
    },
    errorTitle: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    utilityRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    utilityButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    utilityButtonDisabled: {
      opacity: 0.58,
    },
    utilityButtonPressed: {
      opacity: 0.82,
    },
    utilityButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    biometricHintWrap: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    biometricHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
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
      gap: 7,
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
