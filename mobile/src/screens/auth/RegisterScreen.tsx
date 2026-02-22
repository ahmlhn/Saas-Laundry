import axios from "axios";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { AuthStackParamList } from "../../navigation/types";

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList>;

interface ValidationErrorData {
  message?: string;
  errors?: Record<string, string[] | string>;
}

function resolveRegisterErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ValidationErrorData>(error)) {
    if (!error.response) {
      return "Tidak bisa terhubung ke server. Cek internet atau status API.";
    }

    const validationErrors = error.response.data?.errors ?? {};

    if (validationErrors.email) {
      return "Email sudah terdaftar. Gunakan email lain atau login.";
    }

    if (validationErrors.phone) {
      return "Nomor HP tidak valid atau sudah terdaftar.";
    }

    if (validationErrors.password) {
      return "Kata sandi minimal 8 karakter dan konfirmasi harus sama.";
    }

    if (validationErrors.tenant_name) {
      return "Nama usaha wajib diisi.";
    }

    if (validationErrors.name) {
      return "Nama pemilik wajib diisi.";
    }

    if (error.response.status >= 500) {
      return "Server sedang bermasalah. Coba lagi beberapa saat.";
    }

    const fallbackMessage = error.response.data?.message?.trim();
    if (fallbackMessage) {
      return fallbackMessage;
    }
  }

  return "Pendaftaran gagal. Silakan coba lagi.";
}

export function RegisterScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<AuthNavigation>();
  const { register } = useSession();

  const [ownerName, setOwnerName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [outletName, setOutletName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorSummary, setErrorSummary] = useState<string | null>(null);

  const passwordMatched = password === passwordConfirmation;
  const canSubmit =
    !submitting &&
    ownerName.trim().length > 0 &&
    tenantName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordConfirmation.length > 0 &&
    passwordMatched;

  async function handleRegister(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorSummary(null);

    try {
      await register({
        name: ownerName,
        tenantName,
        outletName: outletName.trim() ? outletName : undefined,
        email,
        phone: phone.trim() ? phone : undefined,
        password,
        passwordConfirmation,
      });
    } catch (error) {
      setErrorSummary(resolveRegisterErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" scroll>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Daftar akun baru</Text>
        <Text style={styles.heroSubtitle}>Buat tenant laundry baru dan langsung login sebagai pemilik.</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.panelHint}>Isi data usaha dan akun owner</Text>

        <TextInput
          autoCapitalize="words"
          editable={!submitting}
          onChangeText={setOwnerName}
          placeholder="Nama pemilik"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          textContentType="name"
          value={ownerName}
        />

        <TextInput
          autoCapitalize="words"
          editable={!submitting}
          onChangeText={setTenantName}
          placeholder="Nama usaha / tenant"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          value={tenantName}
        />

        <TextInput
          autoCapitalize="words"
          editable={!submitting}
          onChangeText={setOutletName}
          placeholder="Nama outlet pertama (opsional)"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          value={outletName}
        />

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          textContentType="emailAddress"
          value={email}
        />

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          keyboardType="phone-pad"
          onChangeText={setPhone}
          placeholder="Nomor HP (opsional)"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          textContentType="telephoneNumber"
          value={phone}
        />

        <View style={styles.passwordRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={setPassword}
            placeholder="Kata sandi"
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
              if (canSubmit) {
                void handleRegister();
              }
            }}
            placeholder="Konfirmasi kata sandi"
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

        {!passwordMatched && passwordConfirmation.length > 0 ? <Text style={styles.validationHint}>Konfirmasi kata sandi belum sama.</Text> : null}

        {errorSummary ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorTitle}>Pendaftaran gagal</Text>
            <Text style={styles.errorText}>{errorSummary}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => void handleRegister()}
          style={({ pressed }) => [styles.primaryButton, !canSubmit ? styles.primaryButtonDisabled : null, pressed && canSubmit ? styles.primaryButtonPressed : null]}
        >
          {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Daftar</Text>}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => navigation.navigate("Login")}
          style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}
        >
          <Text style={styles.secondaryButtonText}>Sudah punya akun? Masuk</Text>
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
      backgroundColor: "#1887df",
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
      maxWidth: 340,
    },
    panel: {
      width: "100%",
      borderRadius: 24,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
      borderColor: theme.colors.borderStrong,
      gap: theme.spacing.sm,
    },
    panelHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
      marginBottom: 2,
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
    primaryButton: {
      minHeight: 52,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#1b9ecf",
      backgroundColor: "#24b7de",
      marginTop: 2,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonPressed: {
      opacity: 0.88,
    },
    primaryButtonText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 18,
      letterSpacing: 0.7,
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
    },
    secondaryButtonPressed: {
      opacity: 0.86,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
  });
}
