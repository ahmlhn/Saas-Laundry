import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
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
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type CustomerFormRoute = RouteProp<AccountStackParamList, "CustomerForm">;

export function CustomerFormScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      } else {
        await createCustomer({
          name: trimmedName,
          phone: normalizedPhone,
          notes: composedNotes || undefined,
        });
      }

      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <AppScreen contentContainerStyle={styles.content} scroll>
        <View style={styles.header}>
          <View style={styles.topBar}>
            <Pressable onPress={() => navigation.goBack()} style={styles.topIconButton}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={22} />
            </Pressable>
            <Text style={styles.brandText}>Cuci Laundry</Text>
            <View style={styles.topIconGhost} />
          </View>
          <Text style={styles.title}>{editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan"}</Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nama</Text>
            <TextInput
              onChangeText={setName}
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
                  <Text style={styles.prefixText}>+{selectedDialOption.dialCode}</Text>
                  <Ionicons color={theme.colors.textSecondary} name={countryPickerOpen ? "chevron-up" : "chevron-down"} size={16} />
                </Pressable>
                <TextInput
                  keyboardType="phone-pad"
                  onChangeText={setPhone}
                  placeholder={selectedDialOption.sample}
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.phoneInput}
                  value={phone}
                />
              </View>
              {countryPickerOpen ? (
                <View style={styles.countryPickerPanel}>
                  {CUSTOMER_DIAL_CODE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.code}
                      onPress={() => {
                        setDialCode(option.dialCode);
                        setCountryPickerOpen(false);
                      }}
                      style={[styles.countryItem, option.dialCode === dialCode ? styles.countryItemActive : null]}
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
              placeholder="DD/MM/YYYY"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={birthDate}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Jenis Kelamin</Text>
            <View style={styles.radioRow}>
              <Pressable onPress={() => setGender("male")} style={styles.radioOption}>
                <View style={[styles.radioOuter, gender === "male" ? styles.radioOuterActive : null]}>
                  {gender === "male" ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.radioLabel}>Laki-laki</Text>
              </Pressable>
              <Pressable onPress={() => setGender("female")} style={styles.radioOption}>
                <View style={[styles.radioOuter, gender === "female" ? styles.radioOuterActive : null]}>
                  {gender === "female" ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.radioLabel}>Perempuan</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Alamat</Text>
            <TextInput
              multiline
              onChangeText={setAddress}
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
              placeholder="Catatan pelanggan"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.notesInput]}
              textAlignVertical="top"
              value={note}
            />
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.saveWrap}>
          <AppButton
            disabled={saving || !canCreateOrEdit}
            loading={saving}
            onPress={() => void handleSave()}
            title={editingCustomer ? "Simpan Perubahan" : "Simpan"}
          />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    header: {
      gap: theme.spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    topIconGhost: {
      width: 38,
      height: 38,
    },
    brandText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 23,
      letterSpacing: 0.3,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 31,
      lineHeight: 38,
    },
    formSection: {
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.xl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    fieldGroup: {
      gap: 7,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
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
      minWidth: 86,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
    },
    prefixText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    phoneInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
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
    countryItemActive: {
      backgroundColor: theme.colors.surfaceSoft,
    },
    countryCode: {
      width: 32,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
    radioRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      flexWrap: "wrap",
    },
    radioOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    radioOuter: {
      width: 24,
      height: 24,
      borderRadius: 12,
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
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.info,
    },
    radioLabel: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
    },
    addressInput: {
      minHeight: 86,
    },
    notesInput: {
      minHeight: 72,
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
    saveWrap: {
      marginTop: 4,
      paddingBottom: theme.spacing.sm,
    },
  });
}
