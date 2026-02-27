export interface BluetoothThermalPrinterDevice {
  name: string;
  address: string;
}

export interface StoredBluetoothThermalPrinter extends BluetoothThermalPrinterDevice {
  updatedAt: string;
}
