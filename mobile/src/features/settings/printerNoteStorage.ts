import * as SecureStore from "expo-secure-store";
import type { PrinterNoteSettings } from "../../types/printerNote";

const PRINTER_NOTE_SETTINGS_KEY = "saas_laundry_printer_note_settings_v2";
const LEGACY_PRINTER_NOTE_SETTINGS_KEY = "saas_laundry_printer_note_settings_v1";

export const DEFAULT_PRINTER_NOTE_SETTINGS: PrinterNoteSettings = {
  logoUrl: "",
  profileName: "",
  descriptionLine: "",
  phone: "",
  footerNote: "",
  numberingMode: "default",
  customPrefix: "",
  shareEnota: true,
  showCustomerReceipt: true,
};

function resolvePrinterNoteSettingsKey(outletId?: string | null): string {
  if (!outletId || !outletId.trim()) {
    return PRINTER_NOTE_SETTINGS_KEY;
  }

  return `${PRINTER_NOTE_SETTINGS_KEY}:${outletId.trim()}`;
}

function parsePrinterNoteSettings(raw: string): PrinterNoteSettings {
  const parsed = JSON.parse(raw) as Partial<PrinterNoteSettings>;
  return {
    ...DEFAULT_PRINTER_NOTE_SETTINGS,
    ...parsed,
    numberingMode: parsed.numberingMode === "custom" ? "custom" : "default",
    shareEnota: parsed.shareEnota !== false,
    showCustomerReceipt: parsed.showCustomerReceipt !== false,
  };
}

export async function getPrinterNoteSettings(outletId?: string | null): Promise<PrinterNoteSettings> {
  const scopedKey = resolvePrinterNoteSettingsKey(outletId);
  try {
    const scopedRaw = await SecureStore.getItemAsync(scopedKey);
    if (scopedRaw) {
      return parsePrinterNoteSettings(scopedRaw);
    }

    if (outletId) {
      const legacyRaw = await SecureStore.getItemAsync(LEGACY_PRINTER_NOTE_SETTINGS_KEY);
      if (legacyRaw) {
        const migrated = parsePrinterNoteSettings(legacyRaw);
        await SecureStore.setItemAsync(scopedKey, JSON.stringify(migrated));
        return migrated;
      }
    }

    return DEFAULT_PRINTER_NOTE_SETTINGS;
  } catch {
    return DEFAULT_PRINTER_NOTE_SETTINGS;
  }
}

export async function setPrinterNoteSettings(settings: PrinterNoteSettings, outletId?: string | null): Promise<void> {
  await SecureStore.setItemAsync(resolvePrinterNoteSettingsKey(outletId), JSON.stringify(settings));
}
