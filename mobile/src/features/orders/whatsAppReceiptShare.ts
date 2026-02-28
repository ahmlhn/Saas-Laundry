import { NativeModules, Platform } from "react-native";

interface WhatsAppDirectShareNativeModule {
  shareReceiptToCustomer(phoneDigits: string, imageUri: string, message?: string): Promise<boolean>;
}

const nativeModule = (NativeModules.WhatsAppDirectShare as WhatsAppDirectShareNativeModule | undefined) ?? null;

export async function shareReceiptImageToCustomerOnWhatsApp(params: {
  phoneDigits: string;
  imageUri: string;
  message?: string;
}): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("Kirim gambar nota langsung ke WhatsApp hanya didukung di Android.");
  }

  if (!nativeModule || typeof nativeModule.shareReceiptToCustomer !== "function") {
    throw new Error("Fitur kirim WhatsApp langsung belum tersedia di build ini.");
  }

  await nativeModule.shareReceiptToCustomer(params.phoneDigits, params.imageUri, params.message);
}
