import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { getPrinterNoteSettings, setPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { PrinterNoteSettings } from "../../types/printerNote";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "PrinterNote">;

export function PrinterNoteScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<Navigation>();
  const { selectedOutlet } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Printer & Nota</Text>
        <Text style={styles.subtitle}>Atur profil nota dan format nomor struk sesuai standar outlet.</Text>
      </View>

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
              <Text style={styles.helper}>Mode MVP: upload logo akan diaktifkan setelah endpoint media tersedia.</Text>
            </View>
            <AppButton disabled onPress={() => undefined} title="Upload" variant="secondary" />
          </View>

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

          <AppButton disabled={saving} loading={saving} onPress={() => void handleSave()} title="Simpan" />
        </AppPanel>
      )}

      {successMessage ? (
        <View style={styles.successWrap}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
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
      gap: theme.spacing.xs,
    },
    rowBetween: {
      flexDirection: "row",
      alignItems: "center",
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
      fontSize: 11,
      lineHeight: 16,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    notesInput: {
      minHeight: 70,
    },
    modeRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    modeOption: {
      flex: 1,
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
      paddingVertical: 9,
    },
    successText: {
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
