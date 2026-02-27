import * as SecureStore from "expo-secure-store";
import type { PrinterLocalSettings } from "../../types/printerLocalSettings";

const PRINTER_LOCAL_SETTINGS_KEY = "saas_laundry_printer_local_settings_v1";

export const DEFAULT_PRINTER_LOCAL_SETTINGS: PrinterLocalSettings = {
  paperWidth: "58mm",
  autoCut: false,
  autoOpenCashDrawer: false,
};

function resolvePrinterLocalSettingsKey(outletId?: string | null): string {
  if (!outletId || !outletId.trim()) {
    return PRINTER_LOCAL_SETTINGS_KEY;
  }

  return `${PRINTER_LOCAL_SETTINGS_KEY}:${outletId.trim()}`;
}

function parsePrinterLocalSettings(raw: string): PrinterLocalSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<PrinterLocalSettings>;
    return {
      paperWidth: parsed.paperWidth === "80mm" ? "80mm" : "58mm",
      autoCut: parsed.autoCut === true,
      autoOpenCashDrawer: parsed.autoOpenCashDrawer === true,
    };
  } catch {
    return DEFAULT_PRINTER_LOCAL_SETTINGS;
  }
}

export async function getPrinterLocalSettings(outletId?: string | null): Promise<PrinterLocalSettings> {
  const raw = await SecureStore.getItemAsync(resolvePrinterLocalSettingsKey(outletId));
  if (!raw) {
    return DEFAULT_PRINTER_LOCAL_SETTINGS;
  }

  return parsePrinterLocalSettings(raw);
}

export async function setPrinterLocalSettings(settings: PrinterLocalSettings, outletId?: string | null): Promise<void> {
  await SecureStore.setItemAsync(resolvePrinterLocalSettingsKey(outletId), JSON.stringify(settings));
}
