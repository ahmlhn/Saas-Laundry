import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { createCustomer, updateCustomer } from "../../features/customers/customerApi";
import { buildCustomerProfileMeta, parseCustomerProfileMeta, type CustomerGender } from "../../features/customers/customerProfileNote";
import {
  CUSTOMER_DIAL_CODE_OPTIONS,
  DEFAULT_CUSTOMER_DIAL_CODE,
  normalizeCustomerPhoneForSave,
  splitCustomerPhoneForForm,
} from "../../features/customers/customerPhone";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList, AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type CustomerFormRoute = RouteProp<AccountStackParamList, "CustomerForm">;

export function CustomerFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "CustomerForm">>();
  const route = useRoute<CustomerFormRoute>();
  const { session } = useSession();

  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const editingCustomer = route.params.mode === "edit" ? route.params.customer : undefined;
  const parsedMeta = useMemo(() => parseCustomerProfileMeta(editingCustomer?.notes ?? null), [editingCustomer?.notes]);
  const initialPhoneParts = useMemo(() => splitCustomerPhoneForForm(editingCustomer?.phone_normalized), [editingCustomer?.phone_normalized]);

  const [name, setName] = useState(editingCustomer?.name ?? "");
  const [dialCode, setDialCode] = useState(initialPhoneParts.dialCode || DEFAULT_CUSTOMER_DIAL_CODE);
  const [phone, setPhone] = useState(initialPhoneParts.localNumber);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [email, setEmail] = useState(parsedMeta.email);
  const [birthDate, setBirthDate] = useState(parsedMeta.birthDate);
  const [gender, setGender] = useState<CustomerGender>(parsedMeta.gender);
  const [address, setAddress] = useState(parsedMeta.address);
  const [note, setNote] = useState(parsedMeta.note);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedDialOption = useMemo(
    () =>
      CUSTOMER_DIAL_CODE_OPTIONS.find((option) => option.dialCode === dialCode) ?? {
        code: "ZZ",
        country: "Kode Lainnya",
        dialCode,
        sample: "123456789",
      },
    [dialCode]
  );

  function navigateToQuickAction(preselectCustomerId?: string): void {
    const tabNavigation = navigation.getParent<NavigationProp<AppTabParamList>>();
    if (!tabNavigation) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("AccountHub");
      }
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: "AccountHub" }],
    });
    tabNavigation.navigate("QuickActionTab", {
      openCreateStamp: Date.now(),
      preselectCustomerId,
    });
  }

  function closeFormScreen(): void {
    if (route.params.returnToQuickAction) {
      navigateToQuickAction();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("AccountHub");
  }

  useEffect(() => {
    if (!route.params.returnToQuickAction) {
      return;
    }

    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      const actionType = event.data.action.type;
      if (actionType !== "GO_BACK" && actionType !== "POP" && actionType !== "POP_TO_TOP") {
        return;
      }

      event.preventDefault();
      navigateToQuickAction();
    });

    return unsubscribe;
  }, [navigation, route.params.returnToQuickAction]);

  async function handleSave(): Promise<void> {
    if (!canCreateOrEdit || saving) {
      return;
    }

    const trimmedName = name.trim();
    const normalizedPhone = normalizeCustomerPhoneForSave(phone, dialCode);

    if (!trimmedName) {
      setErrorMessage("Nama pelanggan wajib diisi.");
      return;
    }

    if (!normalizedPhone) {
      setErrorMessage("Nomor telepon tidak valid. Cek kode negara dan nomor tujuan.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const composedNotes = buildCustomerProfileMeta({
        note,
        email,
        birthDate,
        gender,
        address,
      });

      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, {
          name: trimmedName,
          phone: normalizedPhone,
          notes: composedNotes || undefined,
        });

        closeFormScreen();
        return;
      } else {
        const createdCustomer = await createCustomer({
          name: trimmedName,
          phone: normalizedPhone,
          notes: composedNotes || undefined,
        });

        if (route.params.returnToQuickAction) {
          navigateToQuickAction(createdCustomer.id);
          return;
        }
      }

      closeFormScreen();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <AppScreen contentContainerStyle={styles.content} scroll>
        <View style={styles.heroCard}>
          <View style={styles.heroLayerPrimary} />
          <View style={styles.heroLayerSecondary} />
          <View style={styles.heroGlow} />

          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={closeFormScreen} style={styles.topIconButton}>
                <Ionicons color="#eaf6ff" name="arrow-back" size={21} />
              </Pressable>

              <View style={styles.heroBrandWrap}>
                <Text style={styles.brandText}>Cuci Laundry</Text>
                <Text style={styles.heroSubtitle}>Form Pelanggan</Text>
              </View>

              <View style={styles.modeChip}>
                <Ionicons color="#dff1ff" name={editingCustomer ? "create-outline" : "person-add-outline"} size={12} />
                <Text style={styles.modeChipText}>{editingCustomer ? "Edit" : "Baru"}</Text>
              </View>
            </View>

            <Text style={styles.title}>{editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan"}</Text>
            <Text style={styles.heroHint}>Lengkapi data inti pelanggan untuk transaksi dan komunikasi yang lebih cepat.</Text>
          </View>
        </View>

        <AppPanel style={styles.formSection}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nama</Text>
            <TextInput
              onChangeText={setName}
              onFocus={() => setCountryPickerOpen(false)}
              placeholder="Nama Pelanggan"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={name}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Telepon</Text>
            <View style={styles.phoneFieldWrap}>
              <View style={styles.phoneInputWrap}>
                <Pressable onPress={() => setCountryPickerOpen((value) => !value)} style={styles.prefixBox}>
                  <Text style={styles.prefixText}>{selectedDialOption.code}</Text>
                  <Text style={styles.prefixDial}>+{selectedDialOption.dialCode}</Text>
                  <Ionicons color={theme.colors.textSecondary} name={countryPickerOpen ? "chevron-up" : "chevron-down"} size={15} />
                </Pressable>
                <TextInput
                  keyboardType="phone-pad"
                  onChangeText={setPhone}
                  onFocus={() => setCountryPickerOpen(false)}
                  placeholder={selectedDialOption.sample}
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.phoneInput}
                  value={phone}
                />
              </View>

              {countryPickerOpen ? (
                <View style={styles.countryPickerPanel}>
                  {CUSTOMER_DIAL_CODE_OPTIONS.map((option, index) => (
                    <Pressable
                      key={option.code}
                      onPress={() => {
                        setDialCode(option.dialCode);
                        setCountryPickerOpen(false);
                      }}
                      style={[styles.countryItem, option.dialCode === dialCode ? styles.countryItemActive : null, index === CUSTOMER_DIAL_CODE_OPTIONS.length - 1 ? styles.countryItemLast : null]}
                    >
                      <Text style={styles.countryCode}>{option.code}</Text>
                      <Text numberOfLines={1} style={styles.countryName}>
                        {option.country}
                      </Text>
                      <Text style={styles.countryDial}>+{option.dialCode}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              onFocus={() => setCountryPickerOpen(false)}
              placeholder="Email"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tanggal Lahir</Text>
            <TextInput
              onChangeText={setBirthDate}
              onFocus={() => setCountryPickerOpen(false)}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={birthDate}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Jenis Kelamin</Text>
            <View style={styles.genderRow}>
              <Pressable onPress={() => setGender("male")} style={[styles.genderChip, gender === "male" ? styles.genderChipActive : null]}>
                <View style={[styles.radioOuter, gender === "male" ? styles.radioOuterActive : null]}>{gender === "male" ? <View style={styles.radioInner} /> : null}</View>
                <Text style={[styles.genderLabel, gender === "male" ? styles.genderLabelActive : null]}>Laki-laki</Text>
              </Pressable>

              <Pressable onPress={() => setGender("female")} style={[styles.genderChip, gender === "female" ? styles.genderChipActive : null]}>
                <View style={[styles.radioOuter, gender === "female" ? styles.radioOuterActive : null]}>{gender === "female" ? <View style={styles.radioInner} /> : null}</View>
                <Text style={[styles.genderLabel, gender === "female" ? styles.genderLabelActive : null]}>Perempuan</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Alamat</Text>
            <TextInput
              multiline
              onChangeText={setAddress}
              onFocus={() => setCountryPickerOpen(false)}
              placeholder="Masukkan Alamat"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.addressInput]}
              textAlignVertical="top"
              value={address}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Catatan</Text>
            <TextInput
              multiline
              onChangeText={setNote}
              onFocus={() => setCountryPickerOpen(false)}
              placeholder="Catatan pelanggan"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.notesInput]}
              textAlignVertical="top"
              value={note}
            />
          </View>
        </AppPanel>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Ionicons color={theme.colors.danger} name="warning-outline" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <AppPanel style={styles.savePanel}>
          <Text style={styles.saveHint}>Pastikan nama dan nomor telepon benar sebelum simpan.</Text>
          <AppButton
            disabled={saving || !canCreateOrEdit}
            loading={saving}
            onPress={() => void handleSave()}
            title={editingCustomer ? "Simpan Perubahan" : "Simpan"}
          />
        </AppPanel>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    heroCard: {
      position: "relative",
      borderRadius: isTablet ? 28 : isCompactLandscape ? 20 : 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(91,174,255,0.35)" : "rgba(83,166,248,0.32)",
      minHeight: isTablet ? 182 : isCompactLandscape ? 156 : 172,
      backgroundColor: "#1368bc",
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1368bc",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -40,
      bottom: 0,
      width: "70%",
      backgroundColor: "#1fa3e8",
      opacity: 0.74,
    },
    heroGlow: {
      position: "absolute",
      right: -72,
      top: -84,
      width: 205,
      height: 205,
      borderRadius: 132,
      borderWidth: 28,
      borderColor: "rgba(255,255,255,0.12)",
    },
    heroContent: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    topIconButton: {
      width: isCompactLandscape ? 34 : 36,
      height: isCompactLandscape ? 34 : 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.32)",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    heroBrandWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      gap: 1,
    },
    brandText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 24 : isCompactLandscape ? 20 : 22,
      lineHeight: isTablet ? 30 : isCompactLandscape ? 24 : 27,
      letterSpacing: 0.3,
    },
    heroSubtitle: {
      color: "rgba(233,247,255,0.9)",
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10 : 11,
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    modeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.32)",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 5,
      minWidth: 56,
      justifyContent: "center",
    },
    modeChipText: {
      color: "#dff1ff",
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
    },
    title: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 32 : isCompactLandscape ? 24 : 29,
      lineHeight: isTablet ? 38 : isCompactLandscape ? 29 : 35,
    },
    heroHint: {
      color: "rgba(231,246,255,0.92)",
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 11 : 12,
      lineHeight: isCompactLandscape ? 15 : 17,
    },
    formSection: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
    },
    fieldGroup: {
      gap: 7,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 13 : 14,
      paddingHorizontal: 12,
      paddingVertical: isCompactLandscape ? 10 : 12,
    },
    phoneFieldWrap: {
      gap: 8,
    },
    phoneInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.inputBg,
      overflow: "hidden",
    },
    prefixBox: {
      minWidth: isCompactLandscape ? 102 : 112,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: isCompactLandscape ? 10 : 12,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
    },
    prefixText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    prefixDial: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    phoneInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isCompactLandscape ? 13 : 14,
      paddingHorizontal: 12,
      paddingVertical: isCompactLandscape ? 10 : 12,
    },
    countryPickerPanel: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      overflow: "hidden",
    },
    countryItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    countryItemLast: {
      borderBottomWidth: 0,
    },
    countryItemActive: {
      backgroundColor: theme.colors.surfaceSoft,
    },
    countryCode: {
      width: 32,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      textTransform: "uppercase",
    },
    countryName: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    countryDial: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    genderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      flexWrap: "wrap",
    },
    genderChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 40,
    },
    genderChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    radioOuterActive: {
      borderColor: theme.colors.info,
    },
    radioInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.info,
    },
    genderLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    genderLabelActive: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
    },
    addressInput: {
      minHeight: isCompactLandscape ? 72 : 84,
    },
    notesInput: {
      minHeight: isCompactLandscape ? 66 : 76,
    },
    errorWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    savePanel: {
      gap: theme.spacing.sm,
      borderColor: theme.colors.borderStrong,
    },
    saveHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
