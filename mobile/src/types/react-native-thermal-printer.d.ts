declare module "@haroldtran/react-native-thermal-printer" {
  export interface IBLEPrinter {
    device_name: string;
    inner_mac_address: string;
    device?: unknown;
  }

  interface PrintOptions {
    beep?: boolean;
    cut?: boolean;
    tailingLine?: boolean;
    encoding?: string;
    onError?: (error: Error) => void;
  }

  export const BLEPrinter: {
    init(): Promise<void>;
    getDeviceList(): Promise<IBLEPrinter[]>;
    connectPrinter(inner_mac_address: string): Promise<IBLEPrinter>;
    closeConn(): Promise<void>;
    printBill(text: string, opts?: PrintOptions): void;
  };
}
