import type { OrderDetail, OrderItemDetail } from "../../types/order";
import type { PrinterPaperWidth } from "../../types/printerLocalSettings";
import { formatStatusLabel } from "./orderStatus";

export type OrderReceiptKind = "production" | "customer";

interface BuildOrderReceiptParams {
  kind: OrderReceiptKind;
  order: OrderDetail;
  outletLabel?: string;
  paperWidth?: PrinterPaperWidth;
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

function buildProductionLines(order: OrderDetail): string[] {
  const items = order.items ?? [];
  if (items.length === 0) {
    return ["- Tidak ada item layanan"];
  }

  return items.map((item, index) => `${index + 1}. ${item.service_name_snapshot} (${formatItemMetric(item)})`);
}

function buildCustomerLines(order: OrderDetail): string[] {
  const items = order.items ?? [];
  if (items.length === 0) {
    return ["- Tidak ada item layanan"];
  }

  return items.map((item, index) => `${index + 1}. ${item.service_name_snapshot} | ${formatItemMetric(item)} | ${formatMoney(item.subtotal_amount)}`);
}

export function buildOrderReceiptText(params: BuildOrderReceiptParams): string {
  const { kind, order, outletLabel, paperWidth } = params;
  const reference = resolveOrderRef(order);
  const customerName = order.customer?.name ?? "-";
  const customerPhone = order.customer?.phone_normalized ?? "-";
  const itemSubTotal = resolveItemSubTotal(order);
  const { divider, labelWidth } = resolveReceiptLayout(paperWidth);
  const lines: string[] = [];

  lines.push(kind === "production" ? "NOTA PRODUKSI LAUNDRY" : "NOTA KONSUMEN LAUNDRY");
  lines.push(divider);
  lines.push(buildKeyValueLine("Ref", reference, labelWidth));
  lines.push(buildKeyValueLine("Order Code", order.order_code, labelWidth));
  lines.push(buildKeyValueLine("Tanggal", formatDateTime(order.created_at), labelWidth));
  lines.push(buildKeyValueLine("Pelanggan", customerName, labelWidth));
  lines.push(buildKeyValueLine("Telepon", customerPhone, labelWidth));
  if (outletLabel) {
    lines.push(buildKeyValueLine("Outlet", outletLabel, labelWidth));
  }
  lines.push("");
  lines.push(kind === "production" ? "ITEM PRODUKSI" : "ITEM LAYANAN");
  lines.push(divider);
  lines.push(...(kind === "production" ? buildProductionLines(order) : buildCustomerLines(order)));
  lines.push("");

  if (kind === "production") {
    lines.push(buildKeyValueLine("Status Laundry", formatStatusLabel(order.laundry_status), labelWidth));
    if (order.is_pickup_delivery) {
      lines.push(buildKeyValueLine("Status Kurir", formatStatusLabel(order.courier_status), labelWidth));
    }
    if (order.notes?.trim()) {
      lines.push(buildKeyValueLine("Catatan", order.notes.trim(), labelWidth));
    }
    lines.push(divider);
    lines.push("Internal produksi. Tanpa informasi harga.");
    return lines.join("\n");
  }

  lines.push("RINGKASAN TAGIHAN");
  lines.push(divider);
  lines.push(buildKeyValueLine("Subtotal Item", formatMoney(itemSubTotal), labelWidth));
  lines.push(buildKeyValueLine("Biaya Antar", formatMoney(order.shipping_fee_amount ?? 0), labelWidth));
  lines.push(buildKeyValueLine("Diskon", formatMoney(order.discount_amount ?? 0), labelWidth));
  lines.push(buildKeyValueLine("Total", formatMoney(order.total_amount), labelWidth));
  lines.push(buildKeyValueLine("Dibayar", formatMoney(order.paid_amount), labelWidth));
  lines.push(buildKeyValueLine("Sisa", formatMoney(order.due_amount), labelWidth));
  if (order.notes?.trim()) {
    lines.push(buildKeyValueLine("Catatan", order.notes.trim(), labelWidth));
  }
  lines.push(divider);
  lines.push("Terima kasih sudah mempercayakan laundry Anda.");

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
