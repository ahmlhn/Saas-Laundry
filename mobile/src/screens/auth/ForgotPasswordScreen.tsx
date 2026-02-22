import axios from "axios";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { requestPasswordReset, resetPasswordWithCode } from "../../features/auth/authApi";
import type { AuthStackParamList } from "../../navigation/types";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList>;

function resolveForgotErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Tidak bisa terhubung ke server. Cek internet atau status API.";
    }

    if (error.response.status === 422) {
      return "Data belum valid. Periksa kembali input Anda.";
    }

    if (error.response.status === 429) {
      return "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.";
    }

    if (error.response.status >= 500) {
      return "Server sedang bermasalah. Coba lagi beberapa saat.";
    }
  }

  return "Permintaan gagal. Silakan coba lagi.";
}

export function ForgotPasswordScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<AuthNavigation>();

  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [submitting, setSubmitting] = useState(false);
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

  const passwordMatched = password === passwordConfirmation;
  const canRequestCode = !submitting && login.trim().length > 0;
  const canResetPassword =
    !submitting &&
    login.trim().length > 0 &&
    code.trim().length === 6 &&
    password.length >= 8 &&
    passwordConfirmation.length > 0 &&
    passwordMatched;

  async function handleRequestCode(): Promise<void> {
    if (!canRequestCode) {
      return;
    }

    setSubmitting(true);
    setErrorSummary(null);
    setSuccessSummary(null);

    try {
      const response = await requestPasswordReset({
        login: login.trim(),
      });

      setStep("reset");
      setSuccessSummary(response.message);
    } catch (error) {
      setErrorSummary(resolveForgotErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(): Promise<void> {
    if (!canResetPassword) {
      return;
    }

    setSubmitting(true);
    setErrorSummary(null);
    setSuccessSummary(null);

    try {
      const response = await resetPasswordWithCode({
        login: login.trim(),
        code: code.trim(),
        password,
        passwordConfirmation,
      });

      setSuccessSummary(response.message);
      setCode("");
      setPassword("");
      setPasswordConfirmation("");
      setTimeout(() => {
        navigation.navigate("Login");
      }, 600);
    } catch (error) {
      setErrorSummary(resolveForgotErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" scroll>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Lupa password</Text>
        <Text style={styles.heroSubtitle}>Masukkan email atau nomor HP, lalu reset password dengan kode verifikasi.</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>1. Kirim kode verifikasi</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="default"
          onChangeText={setLogin}
          placeholder="Email atau nomor HP"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          textContentType="username"
          value={login}
        />

        <Pressable
          accessibilityRole="button"
          disabled={!canRequestCode}
          onPress={() => void handleRequestCode()}
          style={({ pressed }) => [styles.primaryButton, !canRequestCode ? styles.primaryButtonDisabled : null, pressed && canRequestCode ? styles.primaryButtonPressed : null]}
        >
          {submitting && step === "request" ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Kirim kode</Text>}
        </Pressable>

        <Text style={styles.sectionTitle}>2. Reset password</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setCode}
          placeholder="Kode verifikasi (6 digit)"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          textContentType="oneTimeCode"
          value={code}
        />

        <View style={styles.passwordRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={setPassword}
            placeholder="Password baru"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="next"
            secureTextEntry={!showPassword}
            style={styles.passwordInput}
            textContentType="newPassword"
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => setShowPassword((current) => !current)}
            style={({ pressed }) => [styles.toggleButton, pressed ? styles.toggleButtonPressed : null]}
          >
            <Text style={styles.toggleButtonText}>{showPassword ? "Sembunyi" : "Lihat"}</Text>
          </Pressable>
        </View>

        <View style={styles.passwordRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={setPasswordConfirmation}
            onSubmitEditing={() => {
              if (canResetPassword) {
                void handleResetPassword();
              }
            }}
            placeholder="Konfirmasi password baru"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="go"
            secureTextEntry={!showPasswordConfirmation}
            style={styles.passwordInput}
            textContentType="newPassword"
            value={passwordConfirmation}
          />
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => setShowPasswordConfirmation((current) => !current)}
            style={({ pressed }) => [styles.toggleButton, pressed ? styles.toggleButtonPressed : null]}
          >
            <Text style={styles.toggleButtonText}>{showPasswordConfirmation ? "Sembunyi" : "Lihat"}</Text>
          </Pressable>
        </View>

        {!passwordMatched && passwordConfirmation.length > 0 ? <Text style={styles.validationHint}>Konfirmasi password belum sama.</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canResetPassword}
          onPress={() => void handleResetPassword()}
          style={({ pressed }) => [styles.primaryButton, !canResetPassword ? styles.primaryButtonDisabled : null, pressed && canResetPassword ? styles.primaryButtonPressed : null]}
        >
          {submitting && step === "reset" ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Reset password</Text>}
        </Pressable>

        {errorSummary ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorTitle}>Gagal</Text>
            <Text style={styles.errorText}>{errorSummary}</Text>
          </View>
        ) : null}

        {successSummary ? (
          <View style={styles.successWrap}>
            <Text style={styles.successTitle}>Berhasil</Text>
            <Text style={styles.successText}>{successSummary}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => navigation.navigate("Login")}
          style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}
        >
          <Text style={styles.secondaryButtonText}>Kembali ke login</Text>
        </Pressable>
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
      alignItems: "center",
    },
    heroCard: {
      width: "100%",
      borderRadius: 24,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
      backgroundColor: "#2083da",
      gap: theme.spacing.xs,
    },
    heroTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: 28,
      lineHeight: 33,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.88)",
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      maxWidth: 360,
    },
    panel: {
      width: "100%",
      borderRadius: 24,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
      borderColor: theme.colors.borderStrong,
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
    },
    passwordRow: {
      position: "relative",
      justifyContent: "center",
    },
    passwordInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      minHeight: 48,
      paddingLeft: 16,
      paddingRight: 88,
      paddingVertical: 12,
      fontSize: 14,
    },
    toggleButton: {
      position: "absolute",
      right: 8,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 72,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    toggleButtonPressed: {
      opacity: 0.82,
    },
    toggleButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    validationHint: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      marginTop: -2,
      marginLeft: 6,
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#1b9ecf",
      backgroundColor: "#24b7de",
      marginTop: 2,
    },
    primaryButtonDisabled: {
      opacity: 0.52,
    },
    primaryButtonPressed: {
      opacity: 0.88,
    },
    primaryButtonText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    secondaryButton: {
      minHeight: 42,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      marginTop: 2,
    },
    secondaryButtonPressed: {
      opacity: 0.86,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
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
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#2e5a3d" : "#c4efd0",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#183829" : "#edfdf2",
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 2,
    },
    successTitle: {
      color: "#1f9a59",
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    successText: {
      color: "#1f9a59",
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
