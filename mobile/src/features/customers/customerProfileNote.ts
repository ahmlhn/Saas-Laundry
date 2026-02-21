export type CustomerGender = "male" | "female" | "";

export interface CustomerProfileMeta {
  note: string;
  email: string;
  birthDate: string;
  gender: CustomerGender;
  address: string;
}

const META_OPEN = "[CUSTOMER_META]";
const META_CLOSE = "[/CUSTOMER_META]";

export function parseCustomerProfileMeta(rawNotes: string | null): CustomerProfileMeta {
  const fallback: CustomerProfileMeta = {
    note: rawNotes?.trim() || "",
    email: "",
    birthDate: "",
    gender: "",
    address: "",
  };

  if (!rawNotes) {
    return fallback;
  }

  const openIndex = rawNotes.indexOf(META_OPEN);
  const closeIndex = rawNotes.indexOf(META_CLOSE);

  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return fallback;
  }

  const jsonStart = openIndex + META_OPEN.length;
  const metaRaw = rawNotes.slice(jsonStart, closeIndex).trim();

  try {
    const parsed = JSON.parse(metaRaw) as Partial<CustomerProfileMeta>;
    return {
      note: typeof parsed.note === "string" ? parsed.note.trim() : "",
      email: typeof parsed.email === "string" ? parsed.email.trim() : "",
      birthDate: typeof parsed.birthDate === "string" ? parsed.birthDate.trim() : "",
      gender: parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : "",
      address: typeof parsed.address === "string" ? parsed.address.trim() : "",
    };
  } catch {
    return fallback;
  }
}

export function buildCustomerProfileMeta(input: CustomerProfileMeta): string {
  const normalized: CustomerProfileMeta = {
    note: input.note.trim(),
    email: input.email.trim(),
    birthDate: input.birthDate.trim(),
    gender: input.gender === "male" || input.gender === "female" ? input.gender : "",
    address: input.address.trim(),
  };

  const hasMeta = Boolean(normalized.email || normalized.birthDate || normalized.gender || normalized.address);

  if (!hasMeta) {
    return normalized.note;
  }

  return `${META_OPEN}\n${JSON.stringify(normalized)}\n${META_CLOSE}`;
}
