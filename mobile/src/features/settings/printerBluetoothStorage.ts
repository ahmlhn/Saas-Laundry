import * as SecureStore from "expo-secure-store";
import type { StoredBluetoothThermalPrinter } from "../../types/printerBluetooth";

const BT_PRINTER_KEY_BASE = "saas_laundry_bt_thermal_printer_v1";

function resolveBtPrinterKey(outletId?: string | null): string {
  if (!outletId || !outletId.trim()) {
    return BT_PRINTER_KEY_BASE;
  }

  return `${BT_PRINTER_KEY_BASE}:${outletId.trim()}`;
}

function parseStoredBtPrinter(raw: string): StoredBluetoothThermalPrinter | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredBluetoothThermalPrinter>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const address = typeof parsed.address === "string" ? parsed.address.trim() : "";
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt.trim() : "";

    if (!address) {
      return null;
    }

    return {
      name: name || "Thermal Printer",
      address,
      updatedAt: updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getStoredBluetoothThermalPrinter(outletId?: string | null): Promise<StoredBluetoothThermalPrinter | null> {
  const raw = await SecureStore.getItemAsync(resolveBtPrinterKey(outletId));
  if (!raw) {
    return null;
  }

  return parseStoredBtPrinter(raw);
}

export async function setStoredBluetoothThermalPrinter(printer: StoredBluetoothThermalPrinter, outletId?: string | null): Promise<void> {
  await SecureStore.setItemAsync(resolveBtPrinterKey(outletId), JSON.stringify(printer));
}

export async function clearStoredBluetoothThermalPrinter(outletId?: string | null): Promise<void> {
  await SecureStore.deleteItemAsync(resolveBtPrinterKey(outletId));
}
