import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { clearStoredBluetoothThermalPrinter, getStoredBluetoothThermalPrinter, setStoredBluetoothThermalPrinter } from "../../features/settings/printerBluetoothStorage";
import { getPrinterNoteSettingsFromServer, removePrinterLogo, upsertPrinterNoteSettingsToServer, uploadPrinterLogo } from "../../features/settings/printerNoteApi";
import { DEFAULT_PRINTER_NOTE_SETTINGS, getPrinterNoteSettings, setPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { connectBluetoothThermalPrinter, ensureBluetoothThermalPermissions, isBluetoothThermalPrinterRuntimeAvailable, printBluetoothThermalTest, scanBluetoothThermalPrinters } from "../../features/settings/thermalBluetoothPrinter";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { BluetoothThermalPrinterDevice, StoredBluetoothThermalPrinter } from "../../types/printerBluetooth";
import type { PrinterNoteSettings } from "../../types/printerNote";

type Navigation = NativeStackNavigationProp<AccountStackParamList, "PrinterNote">;
const PRINTER_NOTE_BOOTSTRAP_SYNC_TIMEOUT_MS = 8000;

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
  const [removingLogo, setRemovingLogo] = useState(false);
  const [scanningBluetoothPrinters, setScanningBluetoothPrinters] = useState(false);
  const [pairingBluetoothPrinter, setPairingBluetoothPrinter] = useState(false);
  const [testingBluetoothPrinter, setTestingBluetoothPrinter] = useState(false);
  const [bluetoothPrinterReady, setBluetoothPrinterReady] = useState<boolean | null>(null);
  const [discoveredBluetoothPrinters, setDiscoveredBluetoothPrinters] = useState<BluetoothThermalPrinterDevice[]>([]);
  const [pairedBluetoothPrinter, setPairedBluetoothPrinter] = useState<StoredBluetoothThermalPrinter | null>(null);
  const [form, setForm] = useState<PrinterNoteSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

  async function bootstrap(requestSeq: number, outletId: string | null, outletName: string): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [stored, pairedPrinter] = await Promise.all([getPrinterNoteSettings(outletId), getStoredBluetoothThermalPrinter(outletId)]);
      const localMerged: PrinterNoteSettings = {
        ...stored,
        profileName: stored.profileName || outletName || "",
      };

      if (requestSeq !== bootstrapRequestSeqRef.current) {
        return;
      }

      setForm(localMerged);
      setPairedBluetoothPrinter(pairedPrinter);
      setDiscoveredBluetoothPrinters([]);
      setLoading(false);

      if (!outletId) {
        return;
      }

      try {
        const fromServer = await withTimeout(getPrinterNoteSettingsFromServer(outletId), PRINTER_NOTE_BOOTSTRAP_SYNC_TIMEOUT_MS);
        const mergedFromServer: PrinterNoteSettings = {
          ...localMerged,
          ...fromServer,
          profileName: fromServer.profileName || localMerged.profileName || outletName || "",
        };
        await setPrinterNoteSettings(mergedFromServer, outletId);

        if (requestSeq !== bootstrapRequestSeqRef.current) {
          return;
        }

        setForm(mergedFromServer);
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
      contentScrollRef.current?.scrollToEnd({ animated: true });
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
    Alert.alert("Berhasil", message);
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
    Alert.alert("Gagal Menyimpan", message);
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

      await printBluetoothThermalTest(pairedBluetoothPrinter.address, form?.profileName || selectedOutlet?.name || "Outlet");
      setSuccessMessage("Perintah test print berhasil dikirim ke printer.");
      focusFeedback();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      focusFeedback();
    } finally {
      setTestingBluetoothPrinter(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll scrollRef={contentScrollRef}>
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
        <AppPanel style={styles.panel}>
          {!selectedOutlet ? <Text style={styles.outletHint}>Pilih outlet aktif terlebih dulu agar pengaturan tersimpan dan sinkron lintas perangkat.</Text> : null}

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
                onPress={() => void handleScanBluetoothPrinters()}
                title="Scan Printer"
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

            {discoveredBluetoothPrinters.length > 0 ? (
              <View style={styles.discoveredList}>
                {discoveredBluetoothPrinters.map((device) => {
                  const isPaired = pairedBluetoothPrinter?.address === device.address;

                  return (
                    <Pressable
                      key={device.address}
                      disabled={pairingBluetoothPrinter || testingBluetoothPrinter}
                      onPress={() => void handlePairBluetoothPrinter(device)}
                      style={({ pressed }) => [styles.discoveredItem, isPaired ? styles.discoveredItemActive : null, pressed ? styles.heroIconButtonPressed : null]}
                    >
                      <View style={styles.discoveredMain}>
                        <Text style={styles.discoveredTitle}>{device.name}</Text>
                        <Text style={styles.discoveredMeta}>{device.address}</Text>
                      </View>
                      <View style={styles.discoveredAction}>
                        {isPaired ? (
                          <Text style={styles.discoveredActionTextActive}>Tersanding</Text>
                        ) : (
                          <>
                            <Ionicons color={theme.colors.info} name="link-outline" size={15} />
                            <Text style={styles.discoveredActionText}>Sandingkan</Text>
                          </>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

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

          <Text style={styles.label}>Keterangan 1</Text>
          <TextInput
            maxLength={80}
            onChangeText={(value) => updateForm("descriptionLine", value)}
            placeholder="Tagline atau alamat singkat"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={form.descriptionLine}
          />

          <Text style={styles.label}>Telp.</Text>
          <TextInput
            keyboardType="phone-pad"
            maxLength={20}
            onChangeText={(value) => updateForm("phone", value)}
            placeholder="Nomor telepon outlet"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={form.phone}
          />

          <Text style={styles.label}>Catatan Kaki Nota</Text>
          <TextInput
            maxLength={200}
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
            <Text style={styles.previewValue}>{buildPreviewNumber()}</Text>
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

          <AppButton
            disabled={saving || !selectedOutlet}
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
            loading={saving}
            onPress={() => void handleSave()}
            title="Simpan"
          />
        </AppPanel>
      )}
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
