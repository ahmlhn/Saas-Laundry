function createFormatter(locale: string, options: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormat {
  if (!timeZone) {
    return new Intl.DateTimeFormat(locale, options);
  }

  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}

function getPart(parts: Intl.DateTimeFormatPart[], type: string, fallback: string): string {
  return parts.find((part) => part.type === type)?.value ?? fallback;
}

export function toDateToken(date: Date, timeZone?: string): string {
  const formatter = createFormatter(
    "en-US",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
    timeZone
  );
  const parts = formatter.formatToParts(date);
  const year = getPart(parts, "year", "0000");
  const month = getPart(parts, "month", "01");
  const day = getPart(parts, "day", "01");

  return `${year}-${month}-${day}`;
}

export function formatDateLabel(date: Date, timeZone?: string): string {
  return createFormatter(
    "id-ID",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
    timeZone
  ).format(date);
}

export function formatTimeLabel(date: Date, timeZone?: string): string {
  return createFormatter(
    "id-ID",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
    timeZone
  ).format(date);
}
