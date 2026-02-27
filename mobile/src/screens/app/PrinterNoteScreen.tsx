import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { clearStoredBluetoothThermalPrinter, getStoredBluetoothThermalPrinter, setStoredBluetoothThermalPrinter } from "../../features/settings/printerBluetoothStorage";
import { DEFAULT_PRINTER_LOCAL_SETTINGS, getPrinterLocalSettings, setPrinterLocalSettings } from "../../features/settings/printerLocalSettingsStorage";
import {
  getPrinterDeviceSettingsFromServer,
  getPrinterNoteSettingsFromServer,
  removePrinterLogo,
  upsertPrinterDeviceSettingsToServer,
  upsertPrinterNoteSettingsToServer,
  uploadPrinterLogo,
} from "../../features/settings/printerNoteApi";
import { DEFAULT_PRINTER_NOTE_SETTINGS, getPrinterNoteSettings, setPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { connectBluetoothThermalPrinter, ensureBluetoothThermalPermissions, isBluetoothThermalPrinterRuntimeAvailable, printBluetoothThermalTest, scanBluetoothThermalPrinters } from "../../features/settings/thermalBluetoothPrinter";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { BluetoothThermalPrinterDevice, StoredBluetoothThermalPrinter } from "../../types/printerBluetooth";
import type { PrinterLocalSettings, PrinterPaperWidth } from "../../types/printerLocalSettings";
import type { PrinterNoteSettings } from "../../types/printerNote";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "PrinterNote">;
const PRINTER_NOTE_BOOTSTRAP_SYNC_TIMEOUT_MS = 8000;
const PRINTER_NOTE_ALERT_AUTO_HIDE_MS = 4000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("REQUEST_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

function resolveReceiptPreviewLayout(paperWidth: PrinterPaperWidth): {
  divider: string;
  labelWidth: number;
  previewWidth: number;
} {
  if (paperWidth === "80mm") {
    return {
      divider: "-".repeat(48),
      labelWidth: 13,
      previewWidth: 332,
    };
  }

  return {
    divider: "-".repeat(32),
    labelWidth: 11,
    previewWidth: 244,
  };
}

function buildReceiptPreviewLine(label: string, value: string, labelWidth: number): string {
  const normalizedLabel = label.length > labelWidth ? label.slice(0, labelWidth) : label;
  return `${normalizedLabel.padEnd(labelWidth, " ")} : ${value}`;
}

function buildPrinterNotePreviewText(params: {
  profileName: string;
  description: string;
  phone: string;
  footer: string;
  paperWidth: PrinterPaperWidth;
  noteNumber: string;
  showCustomerReceipt: boolean;
}): string {
  const { profileName, description, phone, footer, paperWidth, noteNumber, showCustomerReceipt } = params;
  const { divider, labelWidth } = resolveReceiptPreviewLayout(paperWidth);
  const lines: string[] = [];

  lines.push(profileName);
  lines.push(description);
  lines.push(`Telp. ${phone}`);
  lines.push(divider);
  lines.push(buildReceiptPreviewLine("Nomor Nota", noteNumber, labelWidth));
  lines.push(buildReceiptPreviewLine("Pelanggan", "Nama Pelanggan", labelWidth));
  lines.push(buildReceiptPreviewLine("Tgl Pesan", "28-02-2026 10:30", labelWidth));
  lines.push(buildReceiptPreviewLine("Est Selesai", "03-03-2026 10:30", labelWidth));
  lines.push(divider);
  lines.push("Kiloan Reguler | 2.0 kg | Rp 14.000");
  lines.push("Bedcover      | 1 pcs | Rp 25.000");
  lines.push(divider);

  if (showCustomerReceipt) {
    lines.push(buildReceiptPreviewLine("Total", "Rp 39.000", labelWidth));
    lines.push(buildReceiptPreviewLine("Dibayar", "Rp 20.000", labelWidth));
    lines.push(buildReceiptPreviewLine("Sisa", "Rp 19.000", labelWidth));
    lines.push(divider);
  } else {
    lines.push("Nota pelanggan dinonaktifkan.");
    lines.push(divider);
  }

  lines.push(footer);

  return lines.join("\n");
}

export function PrinterNoteScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const [removingLogo, setRemovingLogo] = useState(false);
  const [scanningBluetoothPrinters, setScanningBluetoothPrinters] = useState(false);
  const [pairingBluetoothPrinter, setPairingBluetoothPrinter] = useState(false);
  const [testingBluetoothPrinter, setTestingBluetoothPrinter] = useState(false);
  const [bluetoothPrinterReady, setBluetoothPrinterReady] = useState<boolean | null>(null);
  const [discoveredBluetoothPrinters, setDiscoveredBluetoothPrinters] = useState<BluetoothThermalPrinterDevice[]>([]);
  const [pairedBluetoothPrinter, setPairedBluetoothPrinter] = useState<StoredBluetoothThermalPrinter | null>(null);
  const [form, setForm] = useState<PrinterNoteSettings | null>(null);
  const [printerSettings, setPrinterSettings] = useState<PrinterLocalSettings | null>(null);
  const [activeTab, setActiveTab] = useState<"printer" | "note">("printer");
  const [devicePickerVisible, setDevicePickerVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingPrinterSettings, setSavingPrinterSettings] = useState(false);
  const [saveFeedbackModal, setSaveFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    tone: "success" | "error";
  }>({
    visible: false,
    title: "",
    message: "",
    tone: "success",
  });
  const bootstrapRequestSeqRef = useRef(0);
  const contentScrollRef = useRef<ScrollView | null>(null);

  function reloadConfiguration(): void {
    const requestSeq = bootstrapRequestSeqRef.current + 1;
    bootstrapRequestSeqRef.current = requestSeq;
    void bootstrap(requestSeq, selectedOutlet?.id ?? null, selectedOutlet?.name ?? "");
  }

  useEffect(() => {
    reloadConfiguration();
  }, [selectedOutlet?.id]);

  useEffect(() => {
    if (!successMessage && !errorMessage) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, PRINTER_NOTE_ALERT_AUTO_HIDE_MS);

    return () => clearTimeout(timeoutId);
  }, [successMessage, errorMessage]);

  async function bootstrap(requestSeq: number, outletId: string | null, outletName: string): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [stored, pairedPrinter, storedPrinterSettings] = await Promise.all([
        getPrinterNoteSettings(outletId),
        getStoredBluetoothThermalPrinter(outletId),
        getPrinterLocalSettings(outletId),
      ]);
      const localMerged: PrinterNoteSettings = {
        ...stored,
        profileName: stored.profileName || outletName || "",
      };

      if (requestSeq !== bootstrapRequestSeqRef.current) {
        return;
      }

      setForm(localMerged);
      setPairedBluetoothPrinter(pairedPrinter);
      setPrinterSettings(storedPrinterSettings);
      setDiscoveredBluetoothPrinters([]);
      setLoading(false);

      if (!outletId) {
        return;
      }

      try {
        const [fromServer, printerSettingsFromServer] = await Promise.all([
          withTimeout(getPrinterNoteSettingsFromServer(outletId), PRINTER_NOTE_BOOTSTRAP_SYNC_TIMEOUT_MS),
          withTimeout(getPrinterDeviceSettingsFromServer(outletId), PRINTER_NOTE_BOOTSTRAP_SYNC_TIMEOUT_MS),
        ]);
        const mergedFromServer: PrinterNoteSettings = {
          ...localMerged,
          ...fromServer,
          profileName: fromServer.profileName || localMerged.profileName || outletName || "",
        };
        await setPrinterNoteSettings(mergedFromServer, outletId);
        await setPrinterLocalSettings(printerSettingsFromServer, outletId);

        if (requestSeq !== bootstrapRequestSeqRef.current) {
          return;
        }

        setForm(mergedFromServer);
        setPrinterSettings(printerSettingsFromServer);
      } catch {
        // Keep local cache when server sync fails or timeout.
      }
    } catch {
      if (requestSeq !== bootstrapRequestSeqRef.current) {
        return;
      }

      setForm({
        ...DEFAULT_PRINTER_NOTE_SETTINGS,
        profileName: outletName || "",
      });
      setPrinterSettings(DEFAULT_PRINTER_LOCAL_SETTINGS);
      setPairedBluetoothPrinter(null);
      setDiscoveredBluetoothPrinters([]);
      setErrorMessage("Gagal memuat pengaturan nota. Menampilkan konfigurasi default perangkat.");
    } finally {
      if (requestSeq === bootstrapRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }

  function focusFeedback(): void {
    setTimeout(() => {
      contentScrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 0);
  }

  function notifySaveSuccess(message: string): void {
    setSuccessMessage(message);
    setErrorMessage(null);
    setSaveFeedbackModal({
      visible: true,
      title: "Berhasil",
      message,
      tone: "success",
    });
  }

  function notifySaveError(message: string): void {
    setErrorMessage(message);
    setSuccessMessage(null);
    setSaveFeedbackModal({
      visible: true,
      title: "Gagal Menyimpan",
      message,
      tone: "error",
    });
  }

  function updateForm<K extends keyof PrinterNoteSettings>(key: K, value: PrinterNoteSettings[K]): void {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function updatePrinterSettings<K extends keyof PrinterLocalSettings>(key: K, value: PrinterLocalSettings[K]): void {
    setPrinterSettings((current) => ({
      ...(current ?? DEFAULT_PRINTER_LOCAL_SETTINGS),
      [key]: value,
    }));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSavePrinterSettings(): Promise<void> {
    if (savingPrinterSettings) {
      return;
    }

    const normalized = printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS;
    setSavingPrinterSettings(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!selectedOutlet) {
        await setPrinterLocalSettings(normalized, null);
        setPrinterSettings(normalized);
        setSuccessMessage("Pengaturan printer tersimpan di perangkat.");
        focusFeedback();
        return;
      }

      const synced = await upsertPrinterDeviceSettingsToServer({
        outletId: selectedOutlet.id,
        settings: normalized,
      });
      await setPrinterLocalSettings(synced, selectedOutlet.id);
      setPrinterSettings(synced);
      setSuccessMessage("Pengaturan printer tersimpan dan tersinkron.");
      focusFeedback();
    } catch (error) {
      try {
        await setPrinterLocalSettings(normalized, selectedOutlet?.id ?? null);
      } catch {
        // Ignore local fallback errors and keep the primary sync failure message.
      }
      setPrinterSettings(normalized);
      setErrorMessage(`Pengaturan printer tersimpan di perangkat, namun sinkron server gagal.\n${getApiErrorMessage(error)}`);
      focusFeedback();
    } finally {
      setSavingPrinterSettings(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!form || saving) {
      return;
    }

    if (!selectedOutlet) {
      notifySaveError("Pilih outlet aktif sebelum menyimpan pengaturan.");
      return;
    }

    const normalizedProfileName = form.profileName.trim();
    const normalizedDescription = form.descriptionLine.trim();
    const normalizedPhone = form.phone.replace(/[^\d+]/g, "").trim();
    const normalizedFooterNote = form.footerNote.trim();
    const normalizedPrefix = form.customPrefix.trim().toUpperCase().replace(/\s+/g, "");

    if (!normalizedProfileName) {
      notifySaveError("Profil nota wajib diisi.");
      return;
    }

    if (normalizedProfileName.length > 32) {
      notifySaveError("Profil nota maksimal 32 karakter.");
      return;
    }

    if (normalizedDescription.length > 80) {
      notifySaveError("Keterangan 1 maksimal 80 karakter.");
      return;
    }

    if (normalizedFooterNote.length > 200) {
      notifySaveError("Catatan kaki nota maksimal 200 karakter.");
      return;
    }

    if (normalizedPhone && !/^\+?\d{8,15}$/.test(normalizedPhone)) {
      notifySaveError("Format nomor telepon tidak valid.");
      return;
    }

    if (form.numberingMode === "custom" && !normalizedPrefix) {
      notifySaveError("Nomor nota custom membutuhkan prefix.");
      return;
    }

    if (normalizedPrefix && !/^[A-Z0-9/_\.-]+$/.test(normalizedPrefix)) {
      notifySaveError("Prefix custom hanya boleh huruf, angka, /, _, ., atau -.");
      return;
    }

    if (normalizedPrefix.length > 24) {
      notifySaveError("Prefix custom maksimal 24 karakter.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalized: PrinterNoteSettings = {
      ...form,
      profileName: normalizedProfileName,
      descriptionLine: normalizedDescription,
      phone: normalizedPhone,
      footerNote: normalizedFooterNote,
      customPrefix: form.numberingMode === "custom" ? normalizedPrefix : "",
    };

    try {
      const synced = await upsertPrinterNoteSettingsToServer({
        outletId: selectedOutlet.id,
        settings: normalized,
      });
      await setPrinterNoteSettings(synced, selectedOutlet.id);
      setForm(synced);
      notifySaveSuccess("Pengaturan nota tersimpan dan tersinkron.");
      focusFeedback();
    } catch (error) {
      // Fallback: tetap simpan lokal agar input tidak hilang saat sync server gagal.
      await setPrinterNoteSettings(normalized, selectedOutlet.id);
      setForm(normalized);
      notifySaveError(`Pengaturan tersimpan di perangkat, namun sinkron server gagal.\n${getApiErrorMessage(error)}`);
      focusFeedback();
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(): Promise<void> {
    if (!form || uploadingLogo || removingLogo) {
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
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (typeof asset.fileSize === "number" && asset.fileSize > 4 * 1024 * 1024) {
        setErrorMessage("Ukuran logo terlalu besar. Maksimal 4 MB.");
        return;
      }
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

      await setPrinterNoteSettings(nextForm, selectedOutlet.id);
      setForm(nextForm);
      setSuccessMessage("Logo nota berhasil diunggah.");
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo(): Promise<void> {
    if (!form || uploadingLogo || removingLogo || !form.logoUrl) {
      return;
    }

    if (!selectedOutlet) {
      setErrorMessage("Pilih outlet aktif sebelum menghapus logo.");
      return;
    }

    setRemovingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await removePrinterLogo(selectedOutlet.id);
      const nextForm: PrinterNoteSettings = {
        ...form,
        logoUrl: "",
      };
      await setPrinterNoteSettings(nextForm, selectedOutlet.id);
      setForm(nextForm);
      setSuccessMessage("Logo nota berhasil dihapus.");
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setRemovingLogo(false);
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

  async function ensureBluetoothRuntimeAndPermission(): Promise<boolean> {
    const runtimeReady = bluetoothPrinterReady ?? (await isBluetoothThermalPrinterRuntimeAvailable());
    setBluetoothPrinterReady(runtimeReady);

    if (!runtimeReady) {
      setErrorMessage("Fitur printer Bluetooth butuh build native (APK/Dev Client), tidak tersedia di Expo Go.");
      return false;
    }

    const granted = await ensureBluetoothThermalPermissions();
    if (!granted) {
      setErrorMessage("Izin Bluetooth belum diberikan. Aktifkan izin Bluetooth agar bisa scan printer.");
      return false;
    }

    return true;
  }

  async function handleScanBluetoothPrinters(): Promise<void> {
    if (scanningBluetoothPrinters || pairingBluetoothPrinter || testingBluetoothPrinter) {
      return;
    }

    setScanningBluetoothPrinters(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const allowed = await ensureBluetoothRuntimeAndPermission();
      if (!allowed) {
        return;
      }

      const devices = await scanBluetoothThermalPrinters();
      setDiscoveredBluetoothPrinters(devices);

      if (devices.length === 0) {
        setErrorMessage("Tidak ada perangkat Bluetooth terdeteksi. Pair printer dulu di Pengaturan Bluetooth Android, lalu coba Scan lagi.");
        return;
      }

      setSuccessMessage(`Menemukan ${devices.length} printer Bluetooth.`);
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setScanningBluetoothPrinters(false);
    }
  }

  function openDevicePicker(): void {
    setDevicePickerVisible(true);
    void handleScanBluetoothPrinters();
  }

  async function handlePairBluetoothPrinter(device: BluetoothThermalPrinterDevice): Promise<void> {
    if (pairingBluetoothPrinter || scanningBluetoothPrinters || testingBluetoothPrinter) {
      return;
    }

    setPairingBluetoothPrinter(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const allowed = await ensureBluetoothRuntimeAndPermission();
      if (!allowed) {
        return;
      }

      const connected = await connectBluetoothThermalPrinter(device.address);
      const nextPaired: StoredBluetoothThermalPrinter = {
        name: connected.name || device.name,
        address: connected.address || device.address,
        updatedAt: new Date().toISOString(),
      };

      await setStoredBluetoothThermalPrinter(nextPaired, selectedOutlet?.id ?? null);
      setPairedBluetoothPrinter(nextPaired);
      setDevicePickerVisible(false);
      setSuccessMessage(`Printer ${nextPaired.name} tersanding dan disimpan.`);
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setPairingBluetoothPrinter(false);
    }
  }

  async function handleUnpairBluetoothPrinter(): Promise<void> {
    if (!pairedBluetoothPrinter || pairingBluetoothPrinter || testingBluetoothPrinter) {
      return;
    }

    try {
      await clearStoredBluetoothThermalPrinter(selectedOutlet?.id ?? null);
      setPairedBluetoothPrinter(null);
      setSuccessMessage("Pairing printer Bluetooth dihapus.");
      setErrorMessage(null);
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    }
  }

  async function handleBluetoothTestPrint(): Promise<void> {
    if (!pairedBluetoothPrinter || testingBluetoothPrinter || pairingBluetoothPrinter || scanningBluetoothPrinters) {
      return;
    }

    setTestingBluetoothPrinter(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const allowed = await ensureBluetoothRuntimeAndPermission();
      if (!allowed) {
        return;
      }

      await printBluetoothThermalTest(
        pairedBluetoothPrinter.address,
        form?.profileName || selectedOutlet?.name || "Outlet",
        printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS,
      );
      setSuccessMessage("Perintah test print berhasil dikirim ke printer.");
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setTestingBluetoothPrinter(false);
    }
  }

  const feedbackBanner = successMessage ? (
    <View style={styles.successWrap}>
      <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
      <Text style={styles.successText}>{successMessage}</Text>
    </View>
  ) : errorMessage ? (
    <View style={styles.errorWrap}>
      <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
      <Text style={styles.errorText}>{errorMessage}</Text>
    </View>
  ) : null;
  const previewProfileName = form?.profileName.trim() || selectedOutlet?.name || "Nama Outlet";
  const previewDescription = form?.descriptionLine.trim() || "Alamat / keterangan singkat outlet";
  const previewPhone = form?.phone.trim() || "08xxxxxxxxxx";
  const previewFooter = form?.footerNote.trim() || "Terima kasih";
  const previewNoteNumber = buildPreviewNumber();
  const activePaperWidth = (printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).paperWidth;
  const previewLayout = useMemo(() => resolveReceiptPreviewLayout(activePaperWidth), [activePaperWidth]);
  const previewReceiptWidth = useMemo(
    () => Math.min(previewLayout.previewWidth, Math.max(width - theme.spacing.xl * 2, 188)),
    [previewLayout.previewWidth, theme.spacing.xl, width],
  );
  const previewReceiptText = useMemo(
    () =>
      buildPrinterNotePreviewText({
        profileName: previewProfileName,
        description: previewDescription,
        phone: previewPhone,
        footer: previewFooter,
        paperWidth: activePaperWidth,
        noteNumber: previewNoteNumber,
        showCustomerReceipt: form?.showCustomerReceipt ?? true,
      }),
    [activePaperWidth, form?.showCustomerReceipt, previewDescription, previewFooter, previewNoteNumber, previewPhone, previewProfileName],
  );

  return (
    <AppScreen contentContainerStyle={styles.content} scroll={false}>
      <View style={styles.screenShell}>
        {feedbackBanner ? <View style={styles.floatingFeedbackDock}>{feedbackBanner}</View> : null}

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
          <Text style={styles.subtitle}>Pisahkan pengaturan printer dan format nota agar lebih mudah diatur per outlet.</Text>
        </AppPanel>

        {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.primaryStrong} />
          <Text style={styles.loadingText}>Memuat konfigurasi nota...</Text>
        </View>
      ) : !form ? (
        <AppPanel style={styles.unavailablePanel}>
          <View style={styles.unavailableRow}>
            <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={18} />
            <Text style={styles.unavailableText}>Konfigurasi nota belum tersedia.</Text>
          </View>
          <AppButton
            leftElement={<Ionicons color={theme.colors.info} name="refresh-outline" size={16} />}
            onPress={() => reloadConfiguration()}
            title="Muat Ulang"
            variant="secondary"
          />
        </AppPanel>
      ) : (
        <View style={styles.mainPane}>
          <AppPanel style={styles.settingsCard}>
            <View style={styles.tabHeader}>
              <Pressable
                onPress={() => setActiveTab("printer")}
                style={({ pressed }) => [styles.tabButton, activeTab === "printer" ? styles.tabButtonActive : null, pressed ? styles.heroIconButtonPressed : null]}
              >
                <Text style={[styles.tabButtonText, activeTab === "printer" ? styles.tabButtonTextActive : null]}>Printer</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("note")}
                style={({ pressed }) => [styles.tabButton, activeTab === "note" ? styles.tabButtonActive : null, pressed ? styles.heroIconButtonPressed : null]}
              >
                <Text style={[styles.tabButtonText, activeTab === "note" ? styles.tabButtonTextActive : null]}>Nota</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.settingsScrollContent}
              keyboardShouldPersistTaps="handled"
              ref={contentScrollRef}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={styles.settingsScroll}
            >
              {!selectedOutlet ? <Text style={styles.outletHint}>Pilih outlet aktif terlebih dulu agar pengaturan tersimpan dan sinkron lintas perangkat.</Text> : null}

              {activeTab === "printer" ? (
                <View style={styles.panelSection}>
                  <View style={styles.btSectionWrap}>
                    <View style={styles.rowBetween}>
                      <View style={styles.logoInfo}>
                        <Text style={styles.label}>Printer Thermal Bluetooth</Text>
                        <Text style={styles.helper}>Scan menampilkan perangkat Bluetooth yang sudah dipair di Android, lalu pilih printer.</Text>
                      </View>
                      <AppButton
                        disabled={scanningBluetoothPrinters || pairingBluetoothPrinter || testingBluetoothPrinter}
                        leftElement={<Ionicons color={theme.colors.info} name="bluetooth-outline" size={17} />}
                        loading={scanningBluetoothPrinters}
                        onPress={openDevicePicker}
                        title="Cari Printer"
                        variant="secondary"
                      />
                    </View>

                    {bluetoothPrinterReady === false ? (
                      <Text style={styles.bluetoothWarning}>
                        Fitur Bluetooth printer belum tersedia di build ini. Jalankan aplikasi lewat APK/Dev Client.
                      </Text>
                    ) : null}

                    {pairedBluetoothPrinter ? (
                      <View style={styles.pairedPrinterCard}>
                        <View style={styles.pairedPrinterMain}>
                          <Text style={styles.pairedPrinterTitle}>Printer Tersanding</Text>
                          <Text style={styles.pairedPrinterName}>{pairedBluetoothPrinter.name}</Text>
                          <Text style={styles.pairedPrinterMeta}>{pairedBluetoothPrinter.address}</Text>
                        </View>
                        <View style={styles.pairedActionRow}>
                          <AppButton
                            disabled={testingBluetoothPrinter || pairingBluetoothPrinter || scanningBluetoothPrinters}
                            leftElement={<Ionicons color={theme.colors.info} name="print-outline" size={16} />}
                            loading={testingBluetoothPrinter}
                            onPress={() => void handleBluetoothTestPrint()}
                            title="Tes Cetak"
                            variant="secondary"
                          />
                          <Pressable
                            disabled={testingBluetoothPrinter || pairingBluetoothPrinter || scanningBluetoothPrinters}
                            onPress={() => void handleUnpairBluetoothPrinter()}
                            style={({ pressed }) => [
                              styles.logoDangerAction,
                              pressed ? styles.heroIconButtonPressed : null,
                              testingBluetoothPrinter || pairingBluetoothPrinter || scanningBluetoothPrinters ? styles.logoDangerActionDisabled : null,
                            ]}
                          >
                            <Ionicons color={theme.colors.danger} name="unlink-outline" size={15} />
                            <Text style={styles.logoDangerActionText}>Lepas Pairing</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.unpairedCard}>
                        <Text style={styles.unpairedText}>Belum ada printer tersanding.</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.settingCard}>
                    <Text style={styles.label}>Pilih Ukuran Kertas</Text>
                    <View style={styles.booleanChoiceRow}>
                      <Pressable
                        onPress={() => updatePrinterSettings("paperWidth", "58mm")}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, (printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).paperWidth === "58mm" ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>58 mm</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updatePrinterSettings("paperWidth", "80mm")}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, (printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).paperWidth === "80mm" ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>80 mm</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.settingCard}>
                    <Text style={styles.label}>Aktifkan Auto Cutter Printer</Text>
                    <View style={styles.booleanChoiceRow}>
                      <Pressable
                        onPress={() => updatePrinterSettings("autoCut", true)}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, (printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).autoCut ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>Ya</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updatePrinterSettings("autoCut", false)}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, !(printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).autoCut ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>Tidak</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.settingCard}>
                    <Text style={styles.label}>Buka Brangkas (Cash Drawer) Otomatis</Text>
                    <View style={styles.booleanChoiceRow}>
                      <Pressable
                        onPress={() => updatePrinterSettings("autoOpenCashDrawer", true)}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, (printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).autoOpenCashDrawer ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>Ya</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updatePrinterSettings("autoOpenCashDrawer", false)}
                        style={({ pressed }) => [styles.booleanChoice, pressed ? styles.heroIconButtonPressed : null]}
                      >
                        <View style={[styles.choiceRadio, !(printerSettings ?? DEFAULT_PRINTER_LOCAL_SETTINGS).autoOpenCashDrawer ? styles.choiceRadioActive : null]} />
                        <Text style={styles.choiceText}>Tidak</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              {activeTab === "note" ? (
                <View style={styles.panelSection}>
                  <View style={styles.rowBetween}>
                    <View style={styles.logoInfo}>
                      <Text style={styles.label}>Logo Nota</Text>
                      <Text style={styles.helper}>Upload logo tersimpan di server agar konsisten lintas perangkat.</Text>
                    </View>
                    <AppButton
                      disabled={uploadingLogo || removingLogo || !selectedOutlet}
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
                  {form.logoUrl ? (
                    <Pressable
                      disabled={uploadingLogo || removingLogo || !selectedOutlet}
                      onPress={() => void handleRemoveLogo()}
                      style={({ pressed }) => [styles.logoDangerAction, pressed ? styles.heroIconButtonPressed : null, uploadingLogo || removingLogo || !selectedOutlet ? styles.logoDangerActionDisabled : null]}
                    >
                      {removingLogo ? <ActivityIndicator color={theme.colors.danger} size="small" /> : <Ionicons color={theme.colors.danger} name="trash-outline" size={15} />}
                      <Text style={styles.logoDangerActionText}>Hapus Logo</Text>
                    </Pressable>
                  ) : null}

                  <Text style={styles.label}>Profil Nota</Text>
                  <TextInput
                    maxLength={32}
                    onChangeText={(value) => updateForm("profileName", value)}
                    placeholder="Nama outlet pada nota"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.profileName}
                  />

                  <TextInput
                    maxLength={80}
                    onChangeText={(value) => updateForm("descriptionLine", value)}
                    placeholder="Keterangan 1"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.descriptionLine}
                  />

                  <TextInput
                    keyboardType="phone-pad"
                    maxLength={20}
                    onChangeText={(value) => updateForm("phone", value)}
                    placeholder="Telp."
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.phone}
                  />

                  <Text style={styles.label}>Catatan Kaki Nota</Text>
                  <TextInput
                    maxLength={200}
                    multiline
                    onChangeText={(value) => updateForm("footerNote", value)}
                    placeholder="Misal: Pengambilan maksimal jam 8 malam."
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
                      maxLength={24}
                      onChangeText={(value) => updateForm("customPrefix", value.toUpperCase().replace(/\s+/g, ""))}
                      placeholder="Prefix custom (contoh OUTLET-A/TRX)"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={form.customPrefix}
                    />
                  ) : null}

                  <View style={styles.previewWrap}>
                    <Text style={styles.previewLabel}>Contoh Format Nomor Nota</Text>
                    <Text style={styles.previewValue}>{previewNoteNumber}</Text>
                    <Text style={styles.previewHint}>Nomor final mengikuti urutan transaksi saat order dibuat.</Text>
                  </View>

                  <Pressable onPress={() => updateForm("shareEnota", !form.shareEnota)} style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Bagikan Link E-Nota pada nota gambar</Text>
                    <View style={[styles.toggleKnob, form.shareEnota ? styles.toggleKnobActive : null]} />
                  </Pressable>

                  <Pressable onPress={() => updateForm("showCustomerReceipt", !form.showCustomerReceipt)} style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Tampilan Nota Pelanggan</Text>
                    <View style={[styles.toggleKnob, form.showCustomerReceipt ? styles.toggleKnobActive : null]} />
                  </Pressable>

                  <View style={styles.receiptPreviewHeader}>
                    <Text style={styles.previewLabel}>Preview Nota</Text>
                    <View style={styles.paperWidthBadge}>
                      <Text style={styles.paperWidthBadgeText}>{activePaperWidth === "80mm" ? "80 mm" : "58 mm"}</Text>
                    </View>
                  </View>
                  <View style={[styles.receiptPreviewCard, { width: previewReceiptWidth }]}>
                    <Text style={styles.receiptPreviewMono}>{previewReceiptText}</Text>
                  </View>
                  <Text style={styles.receiptPreviewFootnote}>Lebar preview mengikuti ukuran kertas printer yang sedang aktif.</Text>
                </View>
              ) : null}
            </ScrollView>
          </AppPanel>

          <View style={[styles.footerDock, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
            {activeTab === "printer" ? (
              <AppButton
                disabled={savingPrinterSettings}
                leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
                loading={savingPrinterSettings}
                onPress={() => void handleSavePrinterSettings()}
                title="Simpan"
              />
            ) : (
              <AppButton
                disabled={saving || !selectedOutlet}
                leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
                loading={saving}
                onPress={() => void handleSave()}
                title="Simpan"
              />
            )}
          </View>
        </View>
      )}

      <Modal animationType="slide" onRequestClose={() => setDevicePickerVisible(false)} transparent visible={devicePickerVisible}>
        <View style={styles.deviceModalBackdrop}>
          <View style={styles.deviceModalCard}>
            <View style={styles.deviceModalHeader}>
              <Pressable onPress={() => setDevicePickerVisible(false)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
                <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
              </Pressable>
              <Text style={styles.deviceModalTitle}>Cari Perangkat</Text>
              <View style={styles.heroSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.deviceListContent} showsVerticalScrollIndicator={false} style={styles.deviceListScroll}>
              {scanningBluetoothPrinters ? (
                <View style={styles.deviceLoadingState}>
                  <ActivityIndicator color={theme.colors.info} />
                  <Text style={styles.helper}>Mencari printer Bluetooth yang sudah dipair di Android...</Text>
                </View>
              ) : discoveredBluetoothPrinters.length > 0 ? (
                discoveredBluetoothPrinters.map((device) => {
                  const isPaired = pairedBluetoothPrinter?.address === device.address;

                  return (
                    <Pressable
                      key={device.address}
                      disabled={pairingBluetoothPrinter || testingBluetoothPrinter}
                      onPress={() => void handlePairBluetoothPrinter(device)}
                      style={({ pressed }) => [styles.devicePickerItem, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <View style={styles.devicePickerMain}>
                        <Text style={styles.devicePickerName}>{device.name}</Text>
                        <Text style={styles.devicePickerAddress}>{device.address}</Text>
                      </View>
                      <View style={[styles.devicePickerStatusPill, isPaired ? styles.devicePickerStatusPillActive : null]}>
                        <Text style={[styles.devicePickerStatusText, isPaired ? styles.devicePickerStatusTextActive : null]}>
                          {isPaired ? "Tersambung" : "Pilih"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.unpairedCard}>
                  <Text style={styles.unpairedText}>Belum ada perangkat ditemukan. Tekan tombol di bawah untuk mulai scan.</Text>
                </View>
              )}
            </ScrollView>

            <AppButton
              disabled={scanningBluetoothPrinters || pairingBluetoothPrinter || testingBluetoothPrinter}
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="bluetooth-outline" size={17} />}
              loading={scanningBluetoothPrinters}
              onPress={() => void handleScanBluetoothPrinters()}
              title="Cari Perangkat"
            />
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setSaveFeedbackModal((prev) => ({ ...prev, visible: false }))} transparent visible={saveFeedbackModal.visible}>
        <View style={styles.feedbackModalBackdrop}>
          <View
            style={[
              styles.feedbackModalCard,
              saveFeedbackModal.tone === "success" ? styles.feedbackModalCardSuccess : styles.feedbackModalCardError,
            ]}
          >
            <View style={styles.feedbackModalHeader}>
              <Ionicons color={saveFeedbackModal.tone === "success" ? theme.colors.success : theme.colors.danger} name={saveFeedbackModal.tone === "success" ? "checkmark-circle" : "alert-circle"} size={18} />
              <Text style={styles.feedbackModalTitle}>{saveFeedbackModal.title}</Text>
            </View>
            <Text style={styles.feedbackModalMessage}>{saveFeedbackModal.message}</Text>
            <Pressable onPress={() => setSaveFeedbackModal((prev) => ({ ...prev, visible: false }))} style={({ pressed }) => [styles.feedbackModalButton, pressed ? styles.heroIconButtonPressed : null]}>
              <Text style={styles.feedbackModalButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </View>
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: 0,
    },
    screenShell: {
      flex: 1,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    floatingFeedbackDock: {
      position: "absolute",
      top: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      left: isTablet ? theme.spacing.xl : theme.spacing.lg,
      right: isTablet ? theme.spacing.xl : theme.spacing.lg,
      zIndex: 8,
    },
    mainPane: {
      flex: 1,
      gap: theme.spacing.sm,
    },
    settingsCard: {
      flex: 1,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      overflow: "hidden",
    },
    tabHeader: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: 4,
    },
    tabButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 15,
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
    },
    tabButtonActive: {
      borderBottomColor: theme.colors.info,
    },
    tabButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 15,
    },
    tabButtonTextActive: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
    },
    settingsScroll: {
      flex: 1,
    },
    settingsScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
      gap: theme.spacing.sm,
    },
    panelSection: {
      gap: theme.spacing.sm,
    },
    footerDock: {
      paddingTop: theme.spacing.xs,
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
    unavailablePanel: {
      gap: theme.spacing.sm,
    },
    unavailableRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    unavailableText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    btSectionWrap: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: theme.spacing.sm,
    },
    settingCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: theme.spacing.sm,
    },
    outletHint: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6a5830" : "#f2dca2",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#4b3f26" : "#fff8e8",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    bluetoothWarning: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6a5830" : "#f2dca2",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#4b3f26" : "#fff8e8",
      paddingHorizontal: 10,
      paddingVertical: 8,
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
    booleanChoiceRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 16,
    },
    booleanChoice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 34,
    },
    choiceRadio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: theme.colors.textMuted,
      backgroundColor: theme.colors.surface,
    },
    choiceRadioActive: {
      borderColor: theme.colors.warning,
      backgroundColor: theme.colors.warning,
    },
    choiceText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
    },
    pairedPrinterCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: theme.spacing.xs,
    },
    pairedPrinterMain: {
      gap: 2,
    },
    pairedPrinterTitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    pairedPrinterName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 17,
    },
    pairedPrinterMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 15,
    },
    pairedActionRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      alignItems: isTablet || isCompactLandscape ? "center" : "stretch",
      gap: 8,
    },
    unpairedCard: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    unpairedText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    discoveredList: {
      gap: 7,
    },
    discoveredItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    discoveredItemActive: {
      borderColor: theme.colors.success,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
    },
    discoveredMain: {
      flex: 1,
      gap: 1,
    },
    discoveredTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    discoveredMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    discoveredAction: {
      minWidth: 88,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 8,
      paddingVertical: 5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    discoveredActionText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    discoveredActionTextActive: {
      color: theme.colors.success,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
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
    logoDangerAction: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    logoDangerActionDisabled: {
      opacity: 0.55,
    },
    logoDangerActionText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
      lineHeight: 15,
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
    previewHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    receiptPreviewCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      alignSelf: "center",
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    receiptPreviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    paperWidthBadge: {
      minWidth: 58,
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    paperWidthBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    receiptPreviewMono: {
      color: theme.colors.textPrimary,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: theme.fonts.medium }),
      fontSize: 10.5,
      lineHeight: 16,
    },
    receiptPreviewFootnote: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 10.5,
      lineHeight: 14,
    },
    receiptPreviewBrand: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
      textAlign: "center",
    },
    receiptPreviewMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      textAlign: "center",
    },
    receiptPreviewDivider: {
      height: 1,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderStrong,
      borderStyle: "dashed",
      marginVertical: 2,
    },
    receiptPreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    receiptPreviewLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    receiptPreviewValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    receiptPreviewFooter: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
      marginTop: 2,
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
    deviceModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.34)",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    deviceModalCard: {
      maxHeight: "86%",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.xl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      gap: 12,
    },
    deviceModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    deviceModalTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 20,
      textAlign: "center",
    },
    deviceListScroll: {
      maxHeight: 420,
    },
    deviceListContent: {
      gap: 10,
      paddingBottom: 6,
    },
    deviceLoadingState: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 18,
    },
    devicePickerItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingVertical: 8,
    },
    devicePickerMain: {
      flex: 1,
      gap: 2,
    },
    devicePickerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
    },
    devicePickerAddress: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    devicePickerStatusPill: {
      minWidth: 84,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "#5a2431" : "#fbe1e6",
      paddingHorizontal: 12,
      paddingVertical: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    devicePickerStatusPillActive: {
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
    },
    devicePickerStatusText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    devicePickerStatusTextActive: {
      color: theme.colors.success,
    },
    feedbackModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.32)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    feedbackModalCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    feedbackModalCardSuccess: {
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
    },
    feedbackModalCardError: {
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
    },
    feedbackModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    feedbackModalTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 18,
    },
    feedbackModalMessage: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    feedbackModalButton: {
      alignSelf: "flex-end",
      minWidth: 74,
      borderWidth: 1,
      borderColor: theme.colors.info,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
    },
    feedbackModalButtonText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
