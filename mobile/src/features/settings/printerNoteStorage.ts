import * as SecureStore from "expo-secure-store";
import type { PrinterNoteSettings } from "../../types/printerNote";

const PRINTER_NOTE_SETTINGS_KEY = "saas_laundry_printer_note_settings_v1";

export const DEFAULT_PRINTER_NOTE_SETTINGS: PrinterNoteSettings = {
  profileName: "",
  descriptionLine: "",
  phone: "",
  footerNote: "",
  numberingMode: "default",
  customPrefix: "",
  shareEnota: true,
  showCustomerReceipt: true,
};

export async function getPrinterNoteSettings(): Promise<PrinterNoteSettings> {
  try {
    const raw = await SecureStore.getItemAsync(PRINTER_NOTE_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_PRINTER_NOTE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<PrinterNoteSettings>;
    return {
      ...DEFAULT_PRINTER_NOTE_SETTINGS,
      ...parsed,
      numberingMode: parsed.numberingMode === "custom" ? "custom" : "default",
      shareEnota: parsed.shareEnota !== false,
      showCustomerReceipt: parsed.showCustomerReceipt !== false,
    };
  } catch {
    return DEFAULT_PRINTER_NOTE_SETTINGS;
  }
}

export async function setPrinterNoteSettings(settings: PrinterNoteSettings): Promise<void> {
  await SecureStore.setItemAsync(PRINTER_NOTE_SETTINGS_KEY, JSON.stringify(settings));
}
