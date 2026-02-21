export type ReceiptNumberMode = "default" | "custom";

export interface PrinterNoteSettings {
  logoUrl: string;
  profileName: string;
  descriptionLine: string;
  phone: string;
  footerNote: string;
  numberingMode: ReceiptNumberMode;
  customPrefix: string;
  shareEnota: boolean;
  showCustomerReceipt: boolean;
}
