import { httpClient } from "../../lib/httpClient";

export interface UploadedPrinterLogo {
  path: string;
  filename: string;
  url: string;
}

interface UploadPrinterLogoResponse {
  data: UploadedPrinterLogo;
}

export interface UploadPrinterLogoPayload {
  outletId: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
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
