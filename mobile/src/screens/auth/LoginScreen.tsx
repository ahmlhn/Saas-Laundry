import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { API_BASE_URL } from "../../config/env";
import { checkApiHealth } from "../../features/auth/authApi";
import { getActiveApiBaseUrl, getApiBaseCandidates, getApiErrorMessage, getApiSetupChecklist } from "../../lib/httpClient";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type FocusedField = "email" | "password" | null;
type LoginViewRole = "owner" | "staff";

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
  const [viewRole, setViewRole] = useState<LoginViewRole>("owner");
  const passwordInputRef = useRef<TextInput | null>(null);
  const setupChecklist = useMemo(() => getApiSetupChecklist(), []);
  const apiCandidates = useMemo(() => getApiBaseCandidates(), []);
  const activeApiBaseUrl = getActiveApiBaseUrl();
  const entranceProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);

  const heroAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress,
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-16, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const panelAnimatedStyle = useMemo(
    () => ({
      opacity: entranceProgress.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0, 0.35, 1],
      }),
      transform: [
        {
          translateY: entranceProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [24, 0],
          }),
        },
      ],
    }),
    [entranceProgress]
  );

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0;
  const canBiometricLogin = hasStoredSession && biometricAvailable && biometricEnabled && !biometricSubmitting && !submitting;
  const inputDisabled = submitting || biometricSubmitting;
  const diagnosticsToggleLabel = showDiagnostics ? "Sembunyikan Diagnostik API" : "Lihat Diagnostik API";
  const biometricButtonLabel = biometricLabel
    .split(" ")
    .map((chunk) => chunk.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleHint =
    viewRole === "owner"
      ? "Mode pemilik untuk monitoring KPI, billing, dan kontrol lintas outlet."
      : "Mode pegawai untuk operasional harian: order, status laundry, dan serah-terima.";

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

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} scroll>
      <Animated.View style={[styles.heroShell, heroAnimatedStyle]}>
        <View style={styles.heroBlueBase} />
        <View style={styles.heroBlueLayer} />
        <View style={styles.heroAccentRing} />
        <View style={styles.heroAccentDot} />
        <View style={styles.heroWavePrimary} />
        <View style={styles.heroWaveSecondary} />

        <View style={styles.heroContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandMarkWrap}>
              <View style={styles.brandMarkBubble} />
              <Text style={styles.brandMarkText}>CL</Text>
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brandTitle}>Cuci Laundry</Text>
              <Text style={styles.brandSubtitle}>Operasional Mobile</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Masuk untuk kendalikan workflow outlet setiap hari.</Text>
          <Text style={styles.heroSubtitle}>Satu aplikasi untuk kasir, progress laundry, kurir, dan rekap cepat operasional.</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.panelWrap, panelAnimatedStyle]}>
        <AppPanel style={styles.panel}>
          <Text style={styles.loginAsLabel}>Login sebagai</Text>
          <View style={styles.roleSwitchRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setViewRole("owner")}
              style={({ pressed }) => [
                styles.roleChip,
                viewRole === "owner" ? styles.roleChipActive : null,
                pressed ? styles.roleChipPressed : null,
              ]}
            >
              <Text style={[styles.roleChipText, viewRole === "owner" ? styles.roleChipTextActive : null]}>PEMILIK</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setViewRole("staff")}
              style={({ pressed }) => [
                styles.roleChip,
                viewRole === "staff" ? styles.roleChipActive : null,
                pressed ? styles.roleChipPressed : null,
              ]}
            >
              <Text style={[styles.roleChipText, viewRole === "staff" ? styles.roleChipTextActive : null]}>PEGAWAI</Text>
            </Pressable>
          </View>
          <Text style={styles.roleHintText}>{roleHint}</Text>

          <View style={styles.fieldGroup}>
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
              placeholder="Email"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="next"
              style={[styles.input, focusedField === "email" ? styles.inputFocused : null]}
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View style={styles.fieldGroup}>
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
                placeholder="Kata Sandi"
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
                <Text style={styles.passwordToggleText}>{showPassword ? "Tutup" : "Lihat"}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.forgotHint}>Lupa password? Hubungi owner/admin tenant untuk reset akun.</Text>

          {errorMessage ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorTitle}>Login gagal</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.submitRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.submitPrimaryButton,
                !canSubmit ? styles.submitPrimaryButtonDisabled : null,
                pressed && canSubmit ? styles.submitPrimaryButtonPressed : null,
              ]}
            >
              <View style={styles.submitPrimaryLayerLeft} pointerEvents="none" />
              <View style={styles.submitPrimaryLayerRight} pointerEvents="none" />
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitPrimaryText}>MASUK</Text>
              )}
            </Pressable>

            {hasStoredSession ? (
              <Pressable
                accessibilityRole="button"
                disabled={!canBiometricLogin}
                onPress={() => void handleBiometricLogin()}
                style={({ pressed }) => [
                  styles.submitBiometricButton,
                  !canBiometricLogin ? styles.submitBiometricButtonDisabled : null,
                  pressed && canBiometricLogin ? styles.submitBiometricButtonPressed : null,
                ]}
              >
                {biometricSubmitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text style={styles.submitBiometricLabel}>{biometricButtonLabel || "BIO"}</Text>
                    <Text style={styles.submitBiometricSubLabel}>{biometricLabel}</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {hasStoredSession && (!biometricAvailable || !biometricEnabled) ? (
            <View style={styles.biometricHintWrap}>
              <Text style={styles.biometricHint}>Sesi tersimpan terdeteksi. Aktifkan login biometrik dari menu Akun untuk akses instan.</Text>
            </View>
          ) : null}

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
              <Text style={styles.utilityButtonText}>{checkingConnection ? "Mengecek API..." : "Tes Koneksi API"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDiagnostics((value) => !value)}
              style={({ pressed }) => [styles.utilityButton, pressed ? styles.utilityButtonPressed : null]}
            >
              <Text style={styles.utilityButtonText}>{diagnosticsToggleLabel}</Text>
            </Pressable>
          </View>

          {connectionMessage ? (
            <View style={[styles.connectionInfo, isConnectionError ? styles.connectionError : styles.connectionOk]}>
              <Text style={styles.connectionText}>{connectionMessage}</Text>
            </View>
          ) : null}

          {showDiagnostics ? (
            <View style={styles.diagnosticsPanel}>
              <Text style={styles.diagnosticsTitle}>Diagnostik API</Text>
              <Text style={styles.diagnosticsText}>API dari env: {API_BASE_URL}</Text>
              <Text style={styles.diagnosticsText}>API aktif runtime: {activeApiBaseUrl}</Text>
              <Text style={styles.diagnosticsText}>Kandidat fallback: {apiCandidates.join(", ")}</Text>
              <Text style={styles.diagnosticsText}>Pastikan `EXPO_PUBLIC_API_URL` sesuai emulator/device fisik.</Text>
              {setupChecklist.map((tip, index) => (
                <Text key={`${index}-${tip}`} style={styles.diagnosticsText}>
                  {index + 1}. {tip}
                </Text>
              ))}
            </View>
          ) : null}
        </AppPanel>
      </Animated.View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    heroShell: {
      height: 306,
      borderRadius: 32,
      overflow: "hidden",
      position: "relative",
    },
    heroBlueBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#2187e8",
    },
    heroBlueLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "72%",
      backgroundColor: "#0e69cc",
      opacity: 0.52,
    },
    heroAccentRing: {
      position: "absolute",
      top: -92,
      right: -74,
      width: 248,
      height: 248,
      borderRadius: 124,
      borderWidth: 40,
      borderColor: "rgba(255,255,255,0.08)",
    },
    heroAccentDot: {
      position: "absolute",
      top: 36,
      left: 36,
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: "rgba(255,255,255,0.09)",
    },
    heroWavePrimary: {
      position: "absolute",
      left: -58,
      right: -44,
      bottom: -134,
      height: 244,
      borderRadius: 180,
      backgroundColor: "#ffffff",
    },
    heroWaveSecondary: {
      position: "absolute",
      right: -56,
      bottom: -100,
      width: 220,
      height: 130,
      borderRadius: 90,
      backgroundColor: "rgba(33, 228, 235, 0.62)",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: 3,
    },
    brandMarkWrap: {
      width: 58,
      height: 58,
      borderRadius: 30,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.9)",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: "rgba(11, 81, 178, 0.45)",
    },
    brandMarkBubble: {
      position: "absolute",
      bottom: -16,
      width: 52,
      height: 31,
      borderRadius: 16,
      backgroundColor: "#ffd45c",
      opacity: 0.95,
    },
    brandMarkText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 18,
      letterSpacing: 0.3,
    },
    brandTextWrap: {
      gap: 2,
    },
    brandTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: 0.2,
    },
    brandSubtitle: {
      color: "rgba(255,255,255,0.82)",
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 19,
      lineHeight: 25,
      maxWidth: 320,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.86)",
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 340,
    },
    panelWrap: {
      marginTop: -72,
      paddingHorizontal: 2,
    },
    panel: {
      gap: theme.spacing.sm,
      borderRadius: 26,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      borderColor: theme.colors.borderStrong,
      shadowOpacity: theme.mode === "dark" ? 0.42 : 0.22,
      shadowRadius: 16,
      elevation: 7,
    },
    loginAsLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      textAlign: "center",
    },
    roleSwitchRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginTop: -2,
    },
    roleChip: {
      minWidth: 112,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    roleChipActive: {
      borderColor: "#0b8de4",
      backgroundColor: "#d9f3ff",
    },
    roleChipPressed: {
      opacity: 0.84,
    },
    roleChipText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
      letterSpacing: 0.5,
    },
    roleChipTextActive: {
      color: "#0877cc",
    },
    roleHintText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      marginBottom: 2,
    },
    fieldGroup: {
      gap: theme.spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      minHeight: 50,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
    },
    inputFocused: {
      borderColor: theme.colors.ring,
      shadowColor: theme.colors.ring,
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.17,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 1 },
    },
    passwordWrap: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.inputBg,
      flexDirection: "row",
      alignItems: "center",
      minHeight: 50,
      paddingRight: 8,
    },
    passwordInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
    },
    passwordToggle: {
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    passwordTogglePressed: {
      opacity: 0.8,
    },
    passwordToggleText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    forgotHint: {
      color: "#20b6cf",
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      marginTop: -2,
      marginLeft: 4,
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
    submitRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginTop: 3,
    },
    submitPrimaryButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: theme.radii.pill,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#149cd5",
      position: "relative",
    },
    submitPrimaryLayerLeft: {
      ...StyleSheet.absoluteFillObject,
      right: "48%",
      backgroundColor: "#3ac9d6",
    },
    submitPrimaryLayerRight: {
      ...StyleSheet.absoluteFillObject,
      left: "48%",
      backgroundColor: "#1390e9",
    },
    submitPrimaryButtonDisabled: {
      opacity: 0.52,
    },
    submitPrimaryButtonPressed: {
      opacity: 0.86,
    },
    submitPrimaryText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 24,
      letterSpacing: 2.4,
    },
    submitBiometricButton: {
      width: 90,
      minHeight: 52,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "#24abd8",
      backgroundColor: "#23bde4",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
      gap: 1,
    },
    submitBiometricButtonDisabled: {
      opacity: 0.52,
    },
    submitBiometricButtonPressed: {
      opacity: 0.85,
    },
    submitBiometricLabel: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 14,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    submitBiometricSubLabel: {
      color: "rgba(255,255,255,0.85)",
      fontFamily: theme.fonts.semibold,
      fontSize: 9,
      textAlign: "center",
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
    utilityRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: 2,
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
      lineHeight: 18,
    },
    diagnosticsPanel: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 6,
    },
    diagnosticsTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    diagnosticsText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
  });
}
