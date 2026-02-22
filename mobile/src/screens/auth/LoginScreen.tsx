import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Google from "expo-auth-session/providers/google";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  type KeyboardEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollView,
} from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_EXPO_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_LOGIN_ENABLED,
  GOOGLE_WEB_CLIENT_ID,
} from "../../config/env";
import { checkApiHealth } from "../../features/auth/authApi";
import type { AuthStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type FocusedField = "credential" | "password" | null;
type ApiStatus = "online" | "offline";
type AuthNavigation = NativeStackNavigationProp<AuthStackParamList>;

interface LoginLayoutMode {
  isLandscape: boolean;
  isTablet: boolean;
}

function resolveLoginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Tidak bisa terhubung ke server. Cek internet atau status API.";
    }

    const responseData = error.response.data as { message?: unknown } | undefined;
    if (responseData && typeof responseData.message === "string" && responseData.message.trim().length > 0) {
      return responseData.message.trim();
    }

    if (error.response.status === 401) {
      return "Email/nomor HP atau kata sandi tidak sesuai.";
    }

    if (error.response.status === 403) {
      return "Akun belum diizinkan login. Hubungi admin tenant.";
    }

    if (error.response.status === 422) {
      return "Data login belum valid. Periksa lagi email/nomor HP dan kata sandi.";
    }

    if (error.response.status >= 500) {
      return "Server sedang bermasalah. Coba lagi beberapa saat.";
    }
  }

  return "Login gagal. Silakan coba lagi.";
}

export function LoginScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<AuthNavigation>();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const isLandscape = viewportWidth > viewportHeight;
  const isTablet = Math.min(viewportWidth, viewportHeight) >= 600;
  const styles = useMemo(() => createStyles(theme, { isLandscape, isTablet }), [theme, isLandscape, isTablet]);
  const { login, loginWithGoogle, biometricLogin, hasStoredSession, biometricAvailable, biometricEnabled, biometricLabel } = useSession();
  const [loginCredential, setLoginCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("offline");
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const passwordInputRef = useRef<TextInput | null>(null);
  const focusedFieldRef = useRef<FocusedField>(null);
  const screenScrollRef = useRef<ScrollView | null>(null);
  const panelTopRef = useRef(0);
  const currentScrollYRef = useRef(0);
  const restoreScrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const keyboardRaisedRef = useRef(false);
  const entranceProgress = useRef(new Animated.Value(0)).current;
  const [googleAuthRequest, , promptGoogleAuth] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID || GOOGLE_EXPO_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
  });

  useEffect(() => {
    Animated.timing(entranceProgress, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceProgress]);

  useEffect(() => {
    void runApiHealthCheck();
  }, []);

  function scrollFormIntoView(targetField: FocusedField = focusedFieldRef.current, keyboardHeightPx?: number): void {
    const baseOffset = Math.max(panelTopRef.current - 20, 0);
    const effectiveKeyboardHeight = keyboardHeightPx ?? keyboardHeightRef.current;
    const keyboardBoost = effectiveKeyboardHeight > 0 ? Math.min(Math.max(effectiveKeyboardHeight * 0.3, 56), 120) : 0;
    const fieldBoost = targetField === "password" ? 160 : targetField === "credential" ? 110 : 90;

    screenScrollRef.current?.scrollTo({
      y: Math.max(baseOffset + keyboardBoost + fieldBoost, 0),
      animated: true,
    });
  }

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event: KeyboardEvent) => {
      if (!keyboardRaisedRef.current) {
        restoreScrollYRef.current = currentScrollYRef.current;
      }
      keyboardRaisedRef.current = true;
      keyboardHeightRef.current = event.endCoordinates.height;
      setKeyboardVisible(true);
      setTimeout(() => {
        scrollFormIntoView(undefined, event.endCoordinates.height);
      }, 60);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      focusedFieldRef.current = null;
      setFocusedField(null);
      setKeyboardVisible(false);
      keyboardHeightRef.current = 0;
      const restoreY = restoreScrollYRef.current;
      keyboardRaisedRef.current = false;
      setTimeout(() => {
        screenScrollRef.current?.scrollTo({
          y: Math.max(restoreY, 0),
          animated: true,
        });
      }, 60);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

  const canSubmit = !submitting && loginCredential.trim().length > 0 && password.length > 0;
  const canBiometricLogin = hasStoredSession && biometricAvailable && biometricEnabled && !biometricSubmitting && !submitting;
  const googleFeatureReady = GOOGLE_LOGIN_ENABLED && !!googleAuthRequest;
  const canGooglePress = !googleSubmitting && !submitting && !biometricSubmitting;
  const inputDisabled = submitting || biometricSubmitting || googleSubmitting;
  const focusMode = keyboardVisible || focusedField !== null;

  function clearErrorState(): void {
    setErrorSummary(null);
  }

  async function runApiHealthCheck(): Promise<void> {
    try {
      const health = await checkApiHealth();
      setApiStatus(health.ok === false ? "offline" : "online");
    } catch {
      setApiStatus("offline");
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    clearErrorState();

    try {
      await login({ login: loginCredential, password });
    } catch (error) {
      setErrorSummary(resolveLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBiometricLogin(): Promise<void> {
    if (!canBiometricLogin) {
      return;
    }

    setBiometricSubmitting(true);
    clearErrorState();

    try {
      await biometricLogin();
    } catch (error) {
      setErrorSummary(resolveLoginErrorMessage(error));
    } finally {
      setBiometricSubmitting(false);
    }
  }

  async function handleGoogleLogin(): Promise<void> {
    if (!canGooglePress) {
      return;
    }

    if (!googleFeatureReady) {
      if (!GOOGLE_LOGIN_ENABLED) {
        setErrorSummary("Login Google belum dikonfigurasi pada aplikasi mobile.");
      } else {
        setErrorSummary("Google login belum siap. Coba lagi beberapa detik.");
      }
      return;
    }

    setGoogleSubmitting(true);
    clearErrorState();

    try {
      const result = await promptGoogleAuth();
      if (result.type !== "success") {
        return;
      }

      const idToken = result.params?.id_token;
      if (!idToken) {
        setErrorSummary("Google tidak mengembalikan token login.");
        return;
      }

      await loginWithGoogle({ idToken });
    } catch (error) {
      setErrorSummary(resolveLoginErrorMessage(error));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <AppScreen
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => {
        currentScrollYRef.current = event.nativeEvent.contentOffset.y;
      }}
      scroll
      scrollEventThrottle={16}
      scrollRef={screenScrollRef}
    >
      <View style={styles.responsiveWrap}>
        <Animated.View style={[styles.heroShell, heroAnimatedStyle, focusMode ? styles.heroShellFocused : null]}>
          <View pointerEvents="none" style={styles.heroBlueBase} />
          <View pointerEvents="none" style={styles.heroBlueLayer} />
          <View pointerEvents="none" style={styles.heroAccentRing} />
          <View pointerEvents="none" style={styles.heroAccentDot} />
          <View pointerEvents="none" style={styles.heroWavePrimary} />
          <View pointerEvents="none" style={styles.heroWaveSecondary} />
          <View pointerEvents="none" style={[styles.apiStatusIndicator, apiStatus === "online" ? styles.apiStatusIndicatorOnline : styles.apiStatusIndicatorOffline]} />

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

        <Animated.View
          onLayout={(event) => {
            panelTopRef.current = event.nativeEvent.layout.y;
          }}
          style={[styles.panelWrap, focusMode ? styles.panelWrapFocused : null, panelAnimatedStyle]}
        >
          <AppPanel style={styles.panel}>
          <Text style={styles.autoRoleHint}>Login sebagai pemilik atau pegawai</Text>

          <View style={styles.fieldGroup}>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              editable={!inputDisabled}
              keyboardType="default"
              onBlur={() => {
                focusedFieldRef.current = null;
                setFocusedField((field) => (field === "credential" ? null : field));
              }}
              onChangeText={setLoginCredential}
              onFocus={() => {
                focusedFieldRef.current = "credential";
                setFocusedField("credential");
                setTimeout(() => {
                  scrollFormIntoView("credential");
                }, 70);
              }}
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              placeholder="Email atau nomor HP"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="next"
              style={[styles.input, focusedField === "credential" ? styles.inputFocused : null]}
              textContentType="username"
              value={loginCredential}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.passwordFieldContainer}>
              <TextInput
                editable={!inputDisabled}
                onBlur={() => {
                  focusedFieldRef.current = null;
                  setFocusedField((field) => (field === "password" ? null : field));
                }}
                onChangeText={setPassword}
                onFocus={() => {
                  focusedFieldRef.current = "password";
                  setFocusedField("password");
                  setTimeout(() => {
                    scrollFormIntoView("password");
                  }, 70);
                }}
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
                style={[styles.passwordInputField, focusedField === "password" ? styles.inputFocused : null]}
                textContentType="password"
                value={password}
              />
              <Pressable
                accessibilityRole="button"
                disabled={inputDisabled}
                onPress={() => setShowPassword((value) => !value)}
                style={({ pressed }) => [styles.passwordToggle, pressed ? styles.passwordTogglePressed : null]}
              >
                <View style={styles.passwordEyeIcon}>
                  <View style={styles.passwordEyeContour} />
                  <View style={styles.passwordEyeIris}>
                    <View style={styles.passwordEyeDot} />
                  </View>
                  {!showPassword ? (
                    <>
                      <View style={styles.passwordEyeSlashBack} />
                      <View style={styles.passwordEyeSlashFront} />
                    </>
                  ) : null}
                </View>
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={inputDisabled}
            onPress={() => navigation.navigate("ForgotPassword")}
            style={({ pressed }) => [styles.forgotHintButton, pressed ? styles.forgotHintButtonPressed : null]}
          >
            <Text style={styles.forgotHint}>Lupa password? Reset di sini.</Text>
          </Pressable>
          <View style={styles.registerRow}>
            <Text style={styles.registerLabel}>Belum punya akun?</Text>
            <Pressable
              accessibilityRole="button"
              disabled={inputDisabled}
              onPress={() => navigation.navigate("Register")}
              style={({ pressed }) => [styles.registerLinkButton, pressed ? styles.registerLinkButtonPressed : null]}
            >
              <Text style={styles.registerLinkText}>Daftar sekarang</Text>
            </Pressable>
          </View>

          {errorSummary ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorTitle}>Login gagal</Text>
              <Text style={styles.errorText}>{errorSummary}</Text>
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
              <View pointerEvents="none" style={styles.submitPrimaryBase} />
              <View pointerEvents="none" style={styles.submitPrimaryAccent} />
              <View pointerEvents="none" style={styles.submitPrimaryGlow} />
              <View pointerEvents="none" style={styles.submitPrimarySheen} />
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitPrimaryText}>Masuk</Text>
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
                    <View style={styles.faceIconFrame}>
                      <View style={[styles.faceIconCorner, styles.faceIconCornerTl]} />
                      <View style={[styles.faceIconCorner, styles.faceIconCornerTr]} />
                      <View style={[styles.faceIconCorner, styles.faceIconCornerBl]} />
                      <View style={[styles.faceIconCorner, styles.faceIconCornerBr]} />
                      <View style={styles.faceIconCore}>
                        <View style={styles.faceIconEyes}>
                          <View style={styles.faceIconEye} />
                          <View style={styles.faceIconEye} />
                        </View>
                        <View style={styles.faceIconMouth} />
                      </View>
                    </View>
                    <Text style={styles.submitBiometricSubLabel}>{biometricLabel}</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canGooglePress}
            onPress={() => void handleGoogleLogin()}
            style={({ pressed }) => [
              styles.googleButton,
              !googleFeatureReady ? styles.googleButtonNotReady : null,
              !canGooglePress ? styles.googleButtonDisabled : null,
              pressed && canGooglePress ? styles.googleButtonPressed : null,
            ]}
          >
            {googleSubmitting ? (
              <ActivityIndicator color={theme.colors.textPrimary} size="small" />
            ) : (
              <>
                <View style={styles.googleBadge}>
                  <Text style={styles.googleBadgeText}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Masuk dengan Google</Text>
              </>
            )}
          </Pressable>

          {hasStoredSession && (!biometricAvailable || !biometricEnabled) ? (
            <View style={styles.biometricHintWrap}>
              <Text style={styles.biometricHint}>Sesi tersimpan terdeteksi. Aktifkan login biometrik dari menu Akun untuk akses instan.</Text>
            </View>
          ) : null}
          </AppPanel>
        </Animated.View>
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, layout: LoginLayoutMode) {
  return StyleSheet.create({
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: layout.isLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
      alignItems: "center",
    },
    responsiveWrap: {
      width: "100%",
      maxWidth: layout.isTablet ? 760 : layout.isLandscape ? 640 : 520,
    },
    heroShell: {
      height: layout.isLandscape ? (layout.isTablet ? 224 : 192) : layout.isTablet ? 356 : 306,
      borderRadius: 32,
      overflow: "hidden",
      position: "relative",
    },
    heroShellFocused: {
      height: layout.isLandscape ? 176 : 220,
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
    apiStatusIndicator: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.7)",
      zIndex: 2,
    },
    apiStatusIndicatorOnline: {
      backgroundColor: "#58e2a6",
    },
    apiStatusIndicatorOffline: {
      backgroundColor: "#ff758f",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: layout.isLandscape ? theme.spacing.md : theme.spacing.xl,
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
      fontSize: layout.isLandscape ? 25 : 30,
      lineHeight: layout.isLandscape ? 30 : 34,
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
      fontSize: layout.isLandscape ? 17 : 19,
      lineHeight: layout.isLandscape ? 22 : 25,
      maxWidth: layout.isLandscape ? 500 : 320,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.86)",
      fontFamily: theme.fonts.medium,
      fontSize: layout.isLandscape ? 11 : 12,
      lineHeight: 18,
      maxWidth: layout.isLandscape ? 520 : 340,
    },
    panelWrap: {
      marginTop: layout.isLandscape ? -34 : -72,
      paddingHorizontal: 2,
    },
    panelWrapFocused: {
      marginTop: layout.isLandscape ? -16 : -92,
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
    autoRoleHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
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
    passwordFieldContainer: {
      position: "relative",
      justifyContent: "center",
    },
    passwordInputField: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      minHeight: 50,
      fontSize: 15,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 84,
    },
    passwordToggle: {
      position: "absolute",
      right: 8,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      width: 40,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    passwordTogglePressed: {
      opacity: 0.8,
    },
    passwordEyeIcon: {
      width: 21,
      height: 15,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    passwordEyeContour: {
      position: "absolute",
      width: 20,
      height: 12,
      borderWidth: 1.6,
      borderColor: theme.colors.textSecondary,
      borderRadius: 11,
      backgroundColor: "transparent",
    },
    passwordEyeIris: {
      width: 7,
      height: 7,
      borderRadius: 4,
      borderWidth: 1.4,
      borderColor: theme.colors.textSecondary,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    passwordEyeDot: {
      width: 2.5,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: theme.colors.textSecondary,
    },
    passwordEyeSlashBack: {
      position: "absolute",
      width: 23,
      height: 2.6,
      borderRadius: 2,
      backgroundColor: theme.colors.surface,
      transform: [{ rotate: "-34deg" }],
    },
    passwordEyeSlashFront: {
      position: "absolute",
      width: 23,
      height: 1.7,
      borderRadius: 2,
      backgroundColor: theme.colors.textSecondary,
      transform: [{ rotate: "-34deg" }],
    },
    forgotHint: {
      color: "#20b6cf",
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    forgotHintButton: {
      alignSelf: "flex-start",
      marginTop: -2,
      marginLeft: 2,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 8,
    },
    forgotHintButtonPressed: {
      opacity: 0.74,
    },
    registerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: -2,
      marginBottom: 2,
    },
    registerLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    registerLinkButton: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    registerLinkButtonPressed: {
      opacity: 0.72,
    },
    registerLinkText: {
      color: "#1aa8d3",
      fontFamily: theme.fonts.bold,
      fontSize: 12,
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
    googleButton: {
      marginTop: 8,
      minHeight: 50,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 14,
    },
    googleButtonDisabled: {
      opacity: 0.52,
    },
    googleButtonNotReady: {
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
    },
    googleButtonPressed: {
      opacity: 0.86,
    },
    googleBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "#ffffff",
      borderWidth: 1,
      borderColor: "#e2e5ea",
      alignItems: "center",
      justifyContent: "center",
    },
    googleBadgeText: {
      color: "#ea4335",
      fontFamily: theme.fonts.heavy,
      fontSize: 14,
      lineHeight: 16,
    },
    googleButtonText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      letterSpacing: 0.2,
    },
    submitPrimaryButton: {
      flex: 1,
      minHeight: 54,
      borderRadius: theme.radii.pill,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#1b9ecf",
      backgroundColor: "#24b7de",
      position: "relative",
      shadowColor: "#1b9ecf",
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.26,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    submitPrimaryBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1fa0d6",
    },
    submitPrimaryAccent: {
      position: "absolute",
      left: -42,
      top: -26,
      width: 172,
      height: 116,
      borderRadius: 64,
      backgroundColor: "#4bd5d5",
      opacity: 0.96,
    },
    submitPrimaryGlow: {
      position: "absolute",
      right: -36,
      top: -42,
      width: 146,
      height: 146,
      borderRadius: 74,
      backgroundColor: "rgba(107, 210, 255, 0.42)",
    },
    submitPrimarySheen: {
      position: "absolute",
      left: -28,
      top: 8,
      width: 112,
      height: 16,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.28)",
      transform: [{ rotate: "-17deg" }],
    },
    submitPrimaryButtonDisabled: {
      opacity: 0.52,
    },
    submitPrimaryButtonPressed: {
      opacity: 0.9,
    },
    submitPrimaryText: {
      color: "#ffffff",
      fontFamily: theme.fonts.bold,
      fontSize: 19,
      letterSpacing: 0.9,
      textTransform: "uppercase",
    },
    submitBiometricButton: {
      width: 88,
      minHeight: 52,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "#24abd8",
      backgroundColor: "#23bde4",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
      gap: 3,
    },
    submitBiometricButtonDisabled: {
      opacity: 0.52,
    },
    submitBiometricButtonPressed: {
      opacity: 0.85,
    },
    faceIconFrame: {
      width: 24,
      height: 24,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    faceIconCorner: {
      position: "absolute",
      width: 8,
      height: 8,
      borderColor: "#ffffff",
    },
    faceIconCornerTl: {
      top: 0,
      left: 0,
      borderTopWidth: 1.6,
      borderLeftWidth: 1.6,
      borderTopLeftRadius: 2,
    },
    faceIconCornerTr: {
      top: 0,
      right: 0,
      borderTopWidth: 1.6,
      borderRightWidth: 1.6,
      borderTopRightRadius: 2,
    },
    faceIconCornerBl: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 1.6,
      borderLeftWidth: 1.6,
      borderBottomLeftRadius: 2,
    },
    faceIconCornerBr: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 1.6,
      borderRightWidth: 1.6,
      borderBottomRightRadius: 2,
    },
    faceIconCore: {
      width: 13,
      height: 13,
      borderRadius: 7,
      borderWidth: 1.3,
      borderColor: "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    faceIconEyes: {
      flexDirection: "row",
      gap: 2,
    },
    faceIconEye: {
      width: 1.8,
      height: 1.8,
      borderRadius: 1,
      backgroundColor: "#ffffff",
    },
    faceIconMouth: {
      width: 5,
      height: 2,
      borderRadius: 2,
      backgroundColor: "#ffffff",
      opacity: 0.95,
    },
    submitBiometricSubLabel: {
      color: "rgba(255,255,255,0.9)",
      fontFamily: theme.fonts.semibold,
      fontSize: 9,
      textAlign: "center",
      lineHeight: 11,
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
  });
}
