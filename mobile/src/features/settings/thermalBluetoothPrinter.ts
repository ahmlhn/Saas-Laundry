import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import type { Permission } from "react-native";
import type { BluetoothThermalPrinterDevice } from "../../types/printerBluetooth";

interface ThermalPrinterModule {
  BLEPrinter: {
    init(): Promise<void>;
    getDeviceList(): Promise<unknown[]>;
    connectPrinter(inner_mac_address: string): Promise<unknown>;
    closeConn(): Promise<void>;
    printBill(
      text: string,
      opts?: {
        beep?: boolean;
        cut?: boolean;
        tailingLine?: boolean;
        encoding?: string;
      },
    ): void;
  };
}

const MISSING_NATIVE_MODULE_MESSAGE =
  "Fitur printer Bluetooth belum tersedia di build ini. Gunakan APK/Dev Client, bukan Expo Go.";

let thermalPrinterModulePromise: Promise<ThermalPrinterModule | null> | null = null;

async function loadThermalPrinterModule(): Promise<ThermalPrinterModule | null> {
  if (thermalPrinterModulePromise) {
    return thermalPrinterModulePromise;
  }

  thermalPrinterModulePromise = (async () => {
    try {
      const module = require("@haroldtran/react-native-thermal-printer") as ThermalPrinterModule;
      if (!module || typeof module !== "object" || !module.BLEPrinter || typeof NativeModules.RNBLEPrinter === "undefined") {
        return null;
      }

      return module;
    } catch {
      return null;
    }
  })();

  return thermalPrinterModulePromise;
}

function normalizePrinterName(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "Thermal Printer";
}

function normalizePrinterAddress(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "";
}

function mapPrinterList(rawList: unknown[]): BluetoothThermalPrinterDevice[] {
  const uniqueByAddress = new Map<string, BluetoothThermalPrinterDevice>();

  for (const item of rawList) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const dictionary = item as Record<string, unknown>;
    const address = normalizePrinterAddress(dictionary.inner_mac_address ?? dictionary.address ?? dictionary.mac_address);
    if (!address) {
      continue;
    }

    uniqueByAddress.set(address, {
      name: normalizePrinterName(dictionary.device_name ?? dictionary.name),
      address,
    });
  }

  return Array.from(uniqueByAddress.values()).sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
}

async function getBlePrinterModuleOrThrow(): Promise<ThermalPrinterModule> {
  const module = await loadThermalPrinterModule();
  if (!module) {
    throw new Error(MISSING_NATIVE_MODULE_MESSAGE);
  }

  return module;
}

export async function isBluetoothThermalPrinterRuntimeAvailable(): Promise<boolean> {
  const module = await loadThermalPrinterModule();
  return module !== null;
}

export async function ensureBluetoothThermalPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const required: Permission[] = [];
  const androidVersion = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  if (Number.isFinite(androidVersion) && androidVersion >= 31) {
    const bluetoothScanPermission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN;
    const bluetoothConnectPermission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;

    if (bluetoothScanPermission) {
      required.push(bluetoothScanPermission as Permission);
    }
    if (bluetoothConnectPermission) {
      required.push(bluetoothConnectPermission as Permission);
    }
  } else {
    const fineLocationPermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarseLocationPermission = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;

    if (fineLocationPermission) {
      required.push(fineLocationPermission as Permission);
    }
    if (coarseLocationPermission) {
      required.push(coarseLocationPermission as Permission);
    }
  }

  if (required.length === 0) {
    return false;
  }

  try {
    const grantedMap = await PermissionsAndroid.requestMultiple(required);
    return required.every((permission) => grantedMap[permission] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export async function scanBluetoothThermalPrinters(): Promise<BluetoothThermalPrinterDevice[]> {
  const module = await getBlePrinterModuleOrThrow();
  await module.BLEPrinter.init();
  const rawList = await module.BLEPrinter.getDeviceList();
  const list = Array.isArray(rawList) ? rawList : [];

  return mapPrinterList(list as unknown[]);
}

export async function connectBluetoothThermalPrinter(address: string): Promise<BluetoothThermalPrinterDevice> {
  const sanitizedAddress = normalizePrinterAddress(address);
  if (!sanitizedAddress) {
    throw new Error("Alamat printer Bluetooth tidak valid.");
  }

  const module = await getBlePrinterModuleOrThrow();
  await module.BLEPrinter.init();
  const connected = await module.BLEPrinter.connectPrinter(sanitizedAddress);
  const mapped = mapPrinterList([connected as unknown]);

  if (mapped.length === 0) {
    return {
      name: "Thermal Printer",
      address: sanitizedAddress,
    };
  }

  return mapped[0];
}

export async function printBluetoothThermalTest(address: string, title?: string): Promise<void> {
  const sanitizedAddress = normalizePrinterAddress(address);
  if (!sanitizedAddress) {
    throw new Error("Printer belum dipilih.");
  }

  const module = await getBlePrinterModuleOrThrow();
  await module.BLEPrinter.init();
  await module.BLEPrinter.connectPrinter(sanitizedAddress);

  const now = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const lines = [
    "TEST PRINT THERMAL",
    "------------------------------",
    `Outlet : ${title?.trim() || "-"}`,
    `Waktu  : ${now}`,
    `Device : ${sanitizedAddress}`,
    "",
    "Koneksi printer Bluetooth berhasil.",
    "",
    "Terima kasih.",
  ];

  module.BLEPrinter.printBill(lines.join("\n"), {
    beep: false,
    cut: true,
    tailingLine: true,
  });
}
