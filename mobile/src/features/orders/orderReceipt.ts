import type { OrderDetail, OrderItemDetail } from "../../types/order";
import type { PrinterPaperWidth } from "../../types/printerLocalSettings";
import type { PrinterNoteSettings } from "../../types/printerNote";
import { formatStatusLabel } from "./orderStatus";

export type OrderReceiptKind = "production" | "customer";

interface BuildOrderReceiptParams {
  kind: OrderReceiptKind;
  order: OrderDetail;
  outletLabel?: string;
  paperWidth?: PrinterPaperWidth;
  noteSettings?: PrinterNoteSettings | null;
}

const moneyFormatter = new Intl.NumberFormat("id-ID");
const metricFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMoney(value: number | null | undefined): string {
  const normalized = Number.isFinite(value) ? Math.max(Math.round(value ?? 0), 0) : 0;
  return `Rp ${moneyFormatter.format(normalized)}`;
}

function formatReceiptMoney(value: number | null | undefined): string {
  return `${formatMoney(value)},-`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatItemMetric(item: OrderItemDetail): string {
  if (item.unit_type_snapshot === "kg") {
    return `${metricFormatter.format(Math.max(asNumber(item.weight_kg), 0))} kg`;
  }

  return `${metricFormatter.format(Math.max(asNumber(item.qty), 0))} pcs`;
}

function resolveOrderRef(order: OrderDetail): string {
  return order.invoice_no?.trim() || order.order_code;
}

function resolveItemSubTotal(order: OrderDetail): number {
  return (order.items ?? []).reduce((sum, item) => sum + Math.max(item.subtotal_amount ?? 0, 0), 0);
}

function buildKeyValueLine(label: string, value: string, labelWidth: number): string {
  const normalizedLabel = label.length > labelWidth ? label.slice(0, labelWidth) : label;
  return `${normalizedLabel.padEnd(labelWidth, " ")} : ${value}`;
}

function centerReceiptLine(value: string, lineWidth: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length >= lineWidth) {
    return trimmed;
  }
  const paddingStart = Math.max(Math.floor((lineWidth - trimmed.length) / 2), 0);
  return `${" ".repeat(paddingStart)}${trimmed}`;
}

function wrapReceiptText(value: string, lineWidth: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const wrapped: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > lineWidth) {
      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = "";
      }

      let remainder = word;
      while (remainder.length > lineWidth) {
        wrapped.push(remainder.slice(0, lineWidth));
        remainder = remainder.slice(lineWidth);
      }

      if (remainder) {
        currentLine = remainder;
      }
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= lineWidth) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      wrapped.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine) {
    wrapped.push(currentLine);
  }

  return wrapped;
}

function buildCenteredReceiptLines(value: string, lineWidth: number): string[] {
  return wrapReceiptText(value, lineWidth).map((line) => centerReceiptLine(line, lineWidth));
}

function resolveReceiptLayout(paperWidth?: PrinterPaperWidth): { divider: string; labelWidth: number } {
  if (paperWidth === "80mm") {
    return {
      divider: "-".repeat(48),
      labelWidth: 13,
    };
  }

  return {
    divider: "-".repeat(32),
    labelWidth: 11,
  };
}

function buildColumnLines(left: string, right: string, lineWidth: number): string[] {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();

  if (!normalizedLeft && !normalizedRight) {
    return [""];
  }

  if (!normalizedRight) {
    return wrapReceiptText(normalizedLeft, lineWidth);
  }

  if (!normalizedLeft) {
    return wrapReceiptText(normalizedRight, lineWidth);
  }

  const minGap = 2;
  if (normalizedLeft.length + normalizedRight.length + minGap <= lineWidth) {
    const spaces = " ".repeat(Math.max(lineWidth - normalizedLeft.length - normalizedRight.length, minGap));
    return [`${normalizedLeft}${spaces}${normalizedRight}`];
  }

  const leftLines = wrapReceiptText(normalizedLeft, lineWidth);
  if (normalizedRight.length <= lineWidth) {
    return [...leftLines, normalizedRight.padStart(lineWidth, " ")];
  }

  return [...leftLines, ...wrapReceiptText(normalizedRight, lineWidth)];
}

function buildProductionLines(order: OrderDetail, lineWidth: number): string[] {
  const items = order.items ?? [];
  if (items.length === 0) {
    return ["- Tidak ada item layanan"];
  }

  return items.flatMap((item, index) => {
    const serviceLines = wrapReceiptText(`${index + 1}. ${item.service_name_snapshot}`, lineWidth);
    const metricLines = buildColumnLines("Jumlah", formatItemMetric(item), lineWidth);
    return [...serviceLines, ...metricLines];
  });
}

function buildCustomerLines(order: OrderDetail, lineWidth: number): string[] {
  const items = order.items ?? [];
  if (items.length === 0) {
    return ["- Tidak ada item layanan"];
  }

  return items.flatMap((item, index) => {
    const serviceLines = wrapReceiptText(`${index + 1}. ${item.service_name_snapshot}`, lineWidth);
    const detailLines = buildColumnLines(formatItemMetric(item), formatMoney(item.subtotal_amount), lineWidth);
    return [...serviceLines, ...detailLines];
  });
}

function resolveSelectedPerfumeLabel(order: OrderDetail): string | null {
  const perfumeNames = (order.items ?? [])
    .filter((item) => (item.service?.service_type ?? "").toLowerCase() === "perfume")
    .map((item) => item.service_name_snapshot.trim())
    .filter((value, index, source) => value !== "" && source.indexOf(value) === index);

  if (perfumeNames.length === 0) {
    return null;
  }

  return perfumeNames.join(", ");
}

function resolveReceiptProfileName(noteSettings: PrinterNoteSettings | null | undefined, outletLabel?: string): string {
  return noteSettings?.profileName.trim() || outletLabel?.trim() || "Laundry";
}

function resolveReceiptDescription(noteSettings: PrinterNoteSettings | null | undefined): string {
  return noteSettings?.descriptionLine.trim() || "";
}

function resolveReceiptPhone(noteSettings: PrinterNoteSettings | null | undefined): string {
  return noteSettings?.phone.trim() || "";
}

function resolveReceiptFooter(noteSettings: PrinterNoteSettings | null | undefined, fallback: string): string {
  return noteSettings?.footerNote.trim() || fallback;
}

export function buildOrderReceiptText(params: BuildOrderReceiptParams): string {
  const { kind, order, outletLabel, paperWidth, noteSettings } = params;
  const reference = resolveOrderRef(order);
  const customerName = order.customer?.name ?? "-";
  const customerPhone = order.customer?.phone_normalized ?? "-";
  const itemSubTotal = resolveItemSubTotal(order);
  const selectedPerfume = resolveSelectedPerfumeLabel(order);
  const { divider, labelWidth } = resolveReceiptLayout(paperWidth);
  const lineWidth = divider.length;
  const profileName = resolveReceiptProfileName(noteSettings, outletLabel);
  const descriptionLine = resolveReceiptDescription(noteSettings);
  const outletPhone = resolveReceiptPhone(noteSettings);
  const customerReceiptEnabled = noteSettings?.showCustomerReceipt !== false;
  const lines: string[] = [];

  if (kind === "production") {
    lines.push(...buildCenteredReceiptLines("(Nota Produksi)", divider.length));
    lines.push(...buildCenteredReceiptLines(profileName, divider.length));
    if (descriptionLine) {
      lines.push(...buildCenteredReceiptLines(descriptionLine, divider.length));
    }
    if (outletPhone) {
      lines.push(...buildCenteredReceiptLines(`Telp. ${outletPhone}`, divider.length));
    }
    lines.push(...buildCenteredReceiptLines(reference, divider.length));
    lines.push(...buildCenteredReceiptLines(customerName, divider.length));
    lines.push(...buildCenteredReceiptLines("Sisa Pembayaran", divider.length));
    lines.push(...buildCenteredReceiptLines(formatReceiptMoney(order.due_amount), divider.length));
    lines.push(divider);
    lines.push(buildKeyValueLine("Tgl Pesan", formatDateTime(order.created_at), labelWidth));
    lines.push(buildKeyValueLine("Est Selesai", formatDateTime(order.estimated_completion_at ?? null), labelWidth));
    lines.push(divider);
    lines.push(...buildProductionLines(order, lineWidth));
    if (selectedPerfume) {
      lines.push(buildKeyValueLine("Parfum", selectedPerfume, labelWidth));
    }
    lines.push(divider);
    lines.push(buildKeyValueLine("Status Laundry", formatStatusLabel(order.laundry_status), labelWidth));
    if (order.is_pickup_delivery) {
      lines.push(buildKeyValueLine("Status Kurir", formatStatusLabel(order.courier_status), labelWidth));
    }
    if (order.notes?.trim()) {
      lines.push(buildKeyValueLine("Catatan", order.notes.trim(), labelWidth));
    }
    lines.push(divider);
    lines.push(...buildCenteredReceiptLines(resolveReceiptFooter(noteSettings, "Internal produksi. Tanpa informasi harga."), divider.length));
    return lines.join("\n");
  }

  lines.push(...buildCenteredReceiptLines(profileName, divider.length));
  if (descriptionLine) {
    lines.push(...buildCenteredReceiptLines(descriptionLine, divider.length));
  }
  if (outletPhone) {
    lines.push(...buildCenteredReceiptLines(`Telp. ${outletPhone}`, divider.length));
  }
  lines.push(divider);
  lines.push(buildKeyValueLine("Nomor Nota", reference, labelWidth));
  lines.push(buildKeyValueLine("Tanggal", formatDateTime(order.created_at), labelWidth));
  lines.push(buildKeyValueLine("Pelanggan", customerName, labelWidth));
  lines.push(buildKeyValueLine("Telepon", customerPhone, labelWidth));
  lines.push("");

  if (!customerReceiptEnabled) {
    lines.push("Nota pelanggan dinonaktifkan.");
    lines.push(divider);
    lines.push(resolveReceiptFooter(noteSettings, "Terima kasih sudah mempercayakan laundry Anda."));
    return lines.join("\n");
  }

  lines.push("ITEM LAYANAN");
  lines.push(divider);
  lines.push(...buildCustomerLines(order, lineWidth));
  if (selectedPerfume) {
    lines.push(buildKeyValueLine("Parfum", selectedPerfume, labelWidth));
  }
  lines.push("");

  lines.push("RINGKASAN TAGIHAN");
  lines.push(divider);
  lines.push(buildKeyValueLine("Subtotal Item", formatReceiptMoney(itemSubTotal), labelWidth));
  lines.push(buildKeyValueLine("Biaya Antar", formatReceiptMoney(order.shipping_fee_amount ?? 0), labelWidth));
  lines.push(buildKeyValueLine("Diskon", formatReceiptMoney(order.discount_amount ?? 0), labelWidth));
  lines.push(buildKeyValueLine("Total", formatReceiptMoney(order.total_amount), labelWidth));
  lines.push(buildKeyValueLine("Dibayar", formatReceiptMoney(order.paid_amount), labelWidth));
  lines.push(buildKeyValueLine("Sisa", formatReceiptMoney(order.due_amount), labelWidth));
  if (order.notes?.trim()) {
    lines.push(buildKeyValueLine("Catatan", order.notes.trim(), labelWidth));
  }
  lines.push(divider);
  lines.push(resolveReceiptFooter(noteSettings, "Terima kasih sudah mempercayakan laundry Anda."));

  return lines.join("\n");
}

export function buildOrderWhatsAppMessage(order: OrderDetail, outletLabel?: string): string {
  const lines: string[] = [];
  const reference = resolveOrderRef(order);
  const customerName = order.customer?.name?.trim() || "Pelanggan";

  lines.push(`Halo ${customerName},`);
  lines.push("Pesanan laundry Anda sudah kami terima.");
  lines.push(`Ref: ${reference}`);
  lines.push(`Total: ${formatMoney(order.total_amount)}`);
  lines.push(`Dibayar: ${formatMoney(order.paid_amount)}`);
  lines.push(`Sisa: ${formatMoney(order.due_amount)}`);
  lines.push(`Status Laundry: ${formatStatusLabel(order.laundry_status)}`);

  if (order.is_pickup_delivery) {
    lines.push(`Status Kurir: ${formatStatusLabel(order.courier_status)}`);
  }

  if (outletLabel) {
    lines.push(`Outlet: ${outletLabel}`);
  }

  lines.push("Terima kasih.");

  return lines.join("\n");
}
