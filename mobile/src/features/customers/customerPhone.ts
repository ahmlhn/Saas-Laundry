export interface CustomerDialCodeOption {
  code: string;
  country: string;
  dialCode: string;
  sample: string;
}

export const CUSTOMER_DIAL_CODE_OPTIONS: CustomerDialCodeOption[] = [
  { code: "ID", country: "Indonesia", dialCode: "62", sample: "8123456789" },
  { code: "SG", country: "Singapore", dialCode: "65", sample: "81234567" },
  { code: "MY", country: "Malaysia", dialCode: "60", sample: "123456789" },
  { code: "TH", country: "Thailand", dialCode: "66", sample: "812345678" },
  { code: "PH", country: "Philippines", dialCode: "63", sample: "9171234567" },
  { code: "VN", country: "Vietnam", dialCode: "84", sample: "912345678" },
  { code: "JP", country: "Japan", dialCode: "81", sample: "9012345678" },
  { code: "KR", country: "South Korea", dialCode: "82", sample: "1012345678" },
  { code: "CN", country: "China", dialCode: "86", sample: "13123456789" },
  { code: "IN", country: "India", dialCode: "91", sample: "9876543210" },
  { code: "AE", country: "United Arab Emirates", dialCode: "971", sample: "501234567" },
  { code: "SA", country: "Saudi Arabia", dialCode: "966", sample: "512345678" },
  { code: "AU", country: "Australia", dialCode: "61", sample: "412345678" },
  { code: "GB", country: "United Kingdom", dialCode: "44", sample: "7700900123" },
  { code: "US", country: "United States", dialCode: "1", sample: "2025550123" },
];

export const DEFAULT_CUSTOMER_DIAL_CODE = "62";

interface CustomerPhoneParts {
  dialCode: string;
  localNumber: string;
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

function isValidInternationalDigits(value: string): boolean {
  return /^\d{8,16}$/.test(value) && !value.startsWith("0");
}

function findDialOptionByPrefix(digits: string): CustomerDialCodeOption | null {
  const sorted = [...CUSTOMER_DIAL_CODE_OPTIONS].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const option of sorted) {
    if (digits.startsWith(option.dialCode) && digits.length > option.dialCode.length) {
      return option;
    }
  }

  return null;
}

function groupDigits(digits: string): string {
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

export function splitCustomerPhoneForForm(rawPhone: string | null | undefined): CustomerPhoneParts {
  const digits = digitsOnly(rawPhone ?? "");
  if (!digits) {
    return {
      dialCode: DEFAULT_CUSTOMER_DIAL_CODE,
      localNumber: "",
    };
  }

  const matched = findDialOptionByPrefix(digits);
  if (matched) {
    return {
      dialCode: matched.dialCode,
      localNumber: digits.slice(matched.dialCode.length),
    };
  }

  if (digits.startsWith(DEFAULT_CUSTOMER_DIAL_CODE)) {
    return {
      dialCode: DEFAULT_CUSTOMER_DIAL_CODE,
      localNumber: digits.slice(DEFAULT_CUSTOMER_DIAL_CODE.length),
    };
  }

  const fallbackDialLength = digits.length >= 12 ? 3 : digits.length >= 11 ? 2 : 1;

  return {
    dialCode: digits.slice(0, fallbackDialLength),
    localNumber: digits.slice(fallbackDialLength),
  };
}

export function normalizeCustomerPhoneForSave(rawPhone: string, selectedDialCode: string): string | null {
  const selected = selectedDialCode.trim().replace(/\D+/g, "") || DEFAULT_CUSTOMER_DIAL_CODE;
  const trimmed = rawPhone.trim();
  let digits = digitsOnly(trimmed);

  if (!digits) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    return isValidInternationalDigits(digits) ? digits : null;
  }

  if (digits.startsWith("00")) {
    const international = digits.slice(2);
    return isValidInternationalDigits(international) ? international : null;
  }

  if (digits.startsWith(selected)) {
    digits = digits.slice(selected.length);
  }

  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  if (!digits) {
    return null;
  }

  const combined = `${selected}${digits}`;
  return isValidInternationalDigits(combined) ? combined : null;
}

export function formatCustomerPhoneDisplay(rawPhone: string | null | undefined): string {
  const digits = digitsOnly(rawPhone ?? "");
  if (!digits) {
    return "Tidak ada nomor telepon";
  }

  const { dialCode, localNumber } = splitCustomerPhoneForForm(digits);
  if (!localNumber) {
    return `+${dialCode}`;
  }

  return `+${dialCode} ${groupDigits(localNumber)}`;
}

export function extractCustomerPhoneDigits(rawPhone: string | null | undefined): string {
  const digits = digitsOnly(rawPhone ?? "");
  return isValidInternationalDigits(digits) ? digits : "";
}
