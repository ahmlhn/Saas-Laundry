import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { uploadPrinterLogo } from "../../features/settings/printerNoteApi";
import { getPrinterNoteSettings, setPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { PrinterNoteSettings } from "../../types/printerNote";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "PrinterNote">;

export function PrinterNoteScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState<PrinterNoteSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [selectedOutlet?.id]);

  async function bootstrap(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const stored = await getPrinterNoteSettings();
      setForm({
        ...stored,
        profileName: stored.profileName || selectedOutlet?.name || "",
      });
    } catch {
      setErrorMessage("Gagal memuat pengaturan nota.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm<K extends keyof PrinterNoteSettings>(key: K, value: PrinterNoteSettings[K]): void {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSave(): Promise<void> {
    if (!form || saving) {
      return;
    }

    if (!form.profileName.trim()) {
      setErrorMessage("Profil nota wajib diisi.");
      return;
    }

    if (form.profileName.trim().length > 32) {
      setErrorMessage("Profil nota maksimal 32 karakter.");
      return;
    }

    if (form.numberingMode === "custom" && !form.customPrefix.trim()) {
      setErrorMessage("Nomor nota custom membutuhkan prefix.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const normalized: PrinterNoteSettings = {
        ...form,
        profileName: form.profileName.trim(),
        descriptionLine: form.descriptionLine.trim(),
        phone: form.phone.trim(),
        footerNote: form.footerNote.trim(),
        customPrefix: form.customPrefix.trim(),
      };
      await setPrinterNoteSettings(normalized);
      setForm(normalized);
      setSuccessMessage("Pengaturan nota tersimpan di perangkat ini.");
    } catch {
      setErrorMessage("Gagal menyimpan pengaturan nota.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(): Promise<void> {
    if (!form || uploadingLogo) {
      return;
    }

    if (!selectedOutlet) {
      setErrorMessage("Pilih outlet aktif sebelum upload logo.");
      return;
    }

    setUploadingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("Izin akses galeri diperlukan untuk upload logo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const uploadResult = await uploadPrinterLogo({
        outletId: selectedOutlet.id,
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });

      const nextForm: PrinterNoteSettings = {
        ...form,
        logoUrl: uploadResult.url,
      };

      await setPrinterNoteSettings(nextForm);
      setForm(nextForm);
      setSuccessMessage("Logo nota berhasil diunggah dan disimpan.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setUploadingLogo(false);
    }
  }

  function buildPreviewNumber(): string {
    if (!form) {
      return "-";
    }

    if (form.numberingMode === "custom" && form.customPrefix.trim()) {
      return `${form.customPrefix.trim()}/001`;
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `TRX/${yy}${mm}${dd}/001`;
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="print-outline" size={15} />
            <Text style={styles.heroBadgeText}>Printer & Nota</Text>
          </View>
          <View style={styles.heroSpacer} />
        </View>
        <Text style={styles.title}>Printer & Nota</Text>
        <Text style={styles.subtitle}>Atur profil nota dan format nomor struk sesuai standar outlet.</Text>
      </AppPanel>

      {loading || !form ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.primaryStrong} />
          <Text style={styles.loadingText}>Memuat konfigurasi nota...</Text>
        </View>
      ) : (
        <AppPanel style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.logoInfo}>
              <Text style={styles.label}>Logo Nota</Text>
              <Text style={styles.helper}>Upload logo tersimpan di server agar konsisten lintas perangkat.</Text>
            </View>
            <AppButton
              disabled={uploadingLogo || !selectedOutlet}
              leftElement={<Ionicons color={theme.colors.info} name="image-outline" size={17} />}
              loading={uploadingLogo}
              onPress={() => void handleUploadLogo()}
              title={form.logoUrl ? "Ganti Logo" : "Upload"}
              variant="secondary"
            />
          </View>

          {form.logoUrl ? (
            <Image source={{ uri: form.logoUrl }} style={styles.logoPreview} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>Belum ada logo. Upload dari galeri perangkat.</Text>
            </View>
          )}

          <Text style={styles.label}>Profil Nota</Text>
          <TextInput
            maxLength={32}
            onChangeText={(value) => updateForm("profileName", value)}
            placeholder="Nama outlet pada nota"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={form.profileName}
          />

          <Text style={styles.label}>Keterangan 1</Text>
          <TextInput
            onChangeText={(value) => updateForm("descriptionLine", value)}
            placeholder="Tagline atau alamat singkat"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={form.descriptionLine}
          />

          <Text style={styles.label}>Telp.</Text>
          <TextInput
            keyboardType="phone-pad"
            onChangeText={(value) => updateForm("phone", value)}
            placeholder="Nomor telepon outlet"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={form.phone}
          />

          <Text style={styles.label}>Catatan Kaki Nota</Text>
          <TextInput
            multiline
            onChangeText={(value) => updateForm("footerNote", value)}
            placeholder="Contoh: Pengambilan maksimal jam 8 malam."
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            textAlignVertical="top"
            value={form.footerNote}
          />

          <Text style={styles.label}>Nomor Nota</Text>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => updateForm("numberingMode", "default")}
              style={[styles.modeOption, form.numberingMode === "default" ? styles.modeOptionActive : null]}
            >
              <Text style={[styles.modeTitle, form.numberingMode === "default" ? styles.modeTitleActive : null]}>Default</Text>
              <Text style={[styles.modeValue, form.numberingMode === "default" ? styles.modeValueActive : null]}>TRX/YYMMDD/001</Text>
            </Pressable>
            <Pressable
              onPress={() => updateForm("numberingMode", "custom")}
              style={[styles.modeOption, form.numberingMode === "custom" ? styles.modeOptionActive : null]}
            >
              <Text style={[styles.modeTitle, form.numberingMode === "custom" ? styles.modeTitleActive : null]}>Kustom</Text>
              <Text style={[styles.modeValue, form.numberingMode === "custom" ? styles.modeValueActive : null]}>Buat Nomor</Text>
            </Pressable>
          </View>

          {form.numberingMode === "custom" ? (
            <TextInput
              onChangeText={(value) => updateForm("customPrefix", value)}
              placeholder="Prefix custom (contoh OUTLET-A/TRX)"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={form.customPrefix}
            />
          ) : null}

          <View style={styles.previewWrap}>
            <Text style={styles.previewLabel}>Preview Nomor Nota</Text>
            <Text style={styles.previewValue}>{buildPreviewNumber()}</Text>
          </View>

          <Pressable onPress={() => updateForm("shareEnota", !form.shareEnota)} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Bagikan Link E-Nota pada nota gambar</Text>
            <View style={[styles.toggleKnob, form.shareEnota ? styles.toggleKnobActive : null]} />
          </Pressable>

          <Pressable onPress={() => updateForm("showCustomerReceipt", !form.showCustomerReceipt)} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Tampilan Nota Pelanggan</Text>
            <View style={[styles.toggleKnob, form.showCustomerReceipt ? styles.toggleKnobActive : null]} />
          </Pressable>

          <AppButton
            disabled={saving}
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
            loading={saving}
            onPress={() => void handleSave()}
            title="Simpan"
          />
        </AppPanel>
      )}

      {successMessage ? (
        <View style={styles.successWrap}>
          <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
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
    heroSpacer: {
      width: 36,
      height: 36,
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
    loadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 10,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    rowBetween: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      alignItems: isTablet || isCompactLandscape ? "flex-start" : "stretch",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    logoInfo: {
      flex: 1,
      gap: 2,
    },
    helper: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    logoPreview: {
      width: "100%",
      height: 132,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      resizeMode: "contain",
    },
    logoPlaceholder: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 14,
    },
    logoPlaceholderText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    notesInput: {
      minHeight: isTablet ? 88 : 70,
    },
    modeRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      gap: theme.spacing.xs,
    },
    modeOption: {
      flex: 1,
      minWidth: isTablet || isCompactLandscape ? 160 : undefined,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 1,
    },
    modeOptionActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    modeTitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    modeTitleActive: {
      color: theme.colors.info,
    },
    modeValue: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    modeValueActive: {
      color: theme.colors.info,
    },
    previewWrap: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 11,
      paddingVertical: 8,
      gap: 2,
    },
    previewLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    previewValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
      marginTop: 2,
      gap: theme.spacing.sm,
    },
    toggleLabel: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    toggleKnob: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    toggleKnobActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.info,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    successText: {
      flex: 1,
      color: theme.colors.success,
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
