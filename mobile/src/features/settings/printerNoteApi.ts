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
  const uriExtensionMatch = payload.uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const uriExtension = uriExtensionMatch?.[1]?.toLowerCase() || "";

  const resolvedType =
    payload.mimeType?.trim() ||
    (uriExtension === "png"
      ? "image/png"
      : uriExtension === "webp"
        ? "image/webp"
        : uriExtension === "heic" || uriExtension === "heif"
          ? "image/heic"
          : "image/jpeg");

  const resolvedExtension = (() => {
    if (uriExtension) {
      return uriExtension;
    }
    if (resolvedType.includes("/")) {
      return resolvedType.split("/")[1].toLowerCase();
    }
    return "jpg";
  })();

  const normalizedExtension = resolvedExtension === "jpeg" ? "jpg" : resolvedExtension;
  const name = payload.fileName?.trim() || `logo-${Date.now()}.${normalizedExtension}`;

  formData.append("outlet_id", payload.outletId);
  formData.append(
    "logo",
    {
      uri: payload.uri,
      name,
      type: resolvedType,
    } as any
  );

  // Let Axios/React Native set multipart boundary automatically.
  const response = await httpClient.post<UploadPrinterLogoResponse>("/printer-note/logo", formData);

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
