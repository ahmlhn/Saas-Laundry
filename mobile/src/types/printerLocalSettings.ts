export type PrinterPaperWidth = "58mm" | "80mm";

export interface PrinterLocalSettings {
  paperWidth: PrinterPaperWidth;
  autoCut: boolean;
  autoOpenCashDrawer: boolean;
}
