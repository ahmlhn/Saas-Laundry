import { httpClient } from "../../lib/httpClient";
import type { PrinterNoteSettings } from "../../types/printerNote";

export interface UploadedPrinterLogo {
  path: string;
  filename: string;
  url: string;
}

interface UploadPrinterLogoResponse {
  data: UploadedPrinterLogo;
}

interface PrinterNoteSettingsResponse {
  data: {
    profile_name: string;
    description_line: string;
    phone: string;
    numbering_mode: "default" | "custom";
    custom_prefix: string;
    footer_note: string;
    share_enota: boolean;
    show_customer_receipt: boolean;
    logo_url: string;
  };
}

interface RemovePrinterLogoResponse {
  data: {
    logo_url: string;
  };
}

export interface UploadPrinterLogoPayload {
  outletId: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
}

export interface UpsertPrinterNoteSettingsPayload {
  outletId: string;
  settings: PrinterNoteSettings;
}

function mapApiSettingsToMobile(payload: PrinterNoteSettingsResponse["data"]): PrinterNoteSettings {
  return {
    logoUrl: payload.logo_url || "",
    profileName: payload.profile_name || "",
    descriptionLine: payload.description_line || "",
    phone: payload.phone || "",
    footerNote: payload.footer_note || "",
    numberingMode: payload.numbering_mode === "custom" ? "custom" : "default",
    customPrefix: payload.custom_prefix || "",
    shareEnota: payload.share_enota !== false,
    showCustomerReceipt: payload.show_customer_receipt !== false,
  };
}

export async function getPrinterNoteSettingsFromServer(outletId: string): Promise<PrinterNoteSettings> {
  const response = await httpClient.get<PrinterNoteSettingsResponse>("/printer-note/settings", {
    params: {
      outlet_id: outletId,
    },
  });

  return mapApiSettingsToMobile(response.data.data);
}

export async function upsertPrinterNoteSettingsToServer(payload: UpsertPrinterNoteSettingsPayload): Promise<PrinterNoteSettings> {
  const response = await httpClient.put<PrinterNoteSettingsResponse>("/printer-note/settings", {
    outlet_id: payload.outletId,
    profile_name: payload.settings.profileName,
    description_line: payload.settings.descriptionLine || null,
    phone: payload.settings.phone || null,
    numbering_mode: payload.settings.numberingMode,
    custom_prefix: payload.settings.customPrefix || null,
    footer_note: payload.settings.footerNote || null,
    share_enota: payload.settings.shareEnota,
    show_customer_receipt: payload.settings.showCustomerReceipt,
  });

  return mapApiSettingsToMobile(response.data.data);
}

export async function uploadPrinterLogo(payload: UploadPrinterLogoPayload): Promise<UploadedPrinterLogo> {
  const formData = new FormData();
  const type = payload.mimeType || "image/jpeg";
  const extension = type.includes("/") ? type.split("/")[1] : "jpg";
  const name = payload.fileName?.trim() || `logo-${Date.now()}.${extension}`;

  formData.append("outlet_id", payload.outletId);
  formData.append(
    "logo",
    {
      uri: payload.uri,
      name,
      type,
    } as any
  );

  const response = await httpClient.post<UploadPrinterLogoResponse>("/printer-note/logo", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.data;
}

export async function removePrinterLogo(outletId: string): Promise<string> {
  const response = await httpClient.delete<RemovePrinterLogoResponse>("/printer-note/logo", {
    params: {
      outlet_id: outletId,
    },
  });

  return response.data.data.logo_url || "";
}
