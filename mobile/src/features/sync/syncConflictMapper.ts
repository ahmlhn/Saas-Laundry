import type { OutboxMutationRecord } from "./outboxRepository";

export function describeSyncReason(reasonCode: string | null | undefined, fallbackMessage?: string | null): string {
  const normalized = (reasonCode ?? "").trim().toUpperCase();

  if (normalized === "QUOTA_EXCEEDED") {
    return "Kuota order tenant sudah habis. Sinkronisasi butuh plan atau kuota baru.";
  }

  if (normalized === "SUBSCRIPTION_READ_ONLY") {
    return "Tenant sedang read-only. Perubahan lokal belum bisa dikirim ke server.";
  }

  if (normalized === "PAYMENT_REQUIRED") {
    return "Status ini butuh tagihan lunas lebih dulu di server.";
  }

  if (normalized === "ITEMS_REQUIRED") {
    return "Server masih membutuhkan item layanan sebelum status bisa diproses.";
  }

  if (normalized === "STATUS_NOT_FORWARD" || normalized === "INVALID_TRANSITION") {
    return "Urutan status tidak valid dibanding kondisi order di server.";
  }

  if (normalized === "ROLE_ACCESS_DENIED") {
    return "Role akun ini tidak punya izin untuk menjalankan aksi tersebut.";
  }

  if (normalized === "OUTLET_ACCESS_DENIED") {
    return "Aksi ini ditolak karena outlet tidak sesuai akses akun.";
  }

  if (normalized === "PHONE_INVALID") {
    return "Nomor pelanggan tidak valid menurut aturan server.";
  }

  if (normalized === "VALIDATION_FAILED") {
    return fallbackMessage?.trim() || "Data lokal tidak lolos validasi server.";
  }

  if (normalized === "INVOICE_RANGE_INVALID" || normalized === "INVOICE_INVALID") {
    return "Nomor invoice lokal tidak valid untuk range device ini.";
  }

  if (fallbackMessage?.trim()) {
    return fallbackMessage.trim();
  }

  return "Sinkronisasi gagal dan butuh koreksi data lokal.";
}

export function formatMutationTypeLabel(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (normalized === "ORDER_CREATE") {
    return "Buat pesanan";
  }

  if (normalized === "ORDER_ADD_PAYMENT") {
    return "Tambah pembayaran";
  }

  if (normalized === "ORDER_UPDATE_LAUNDRY_STATUS") {
    return "Update status laundry";
  }

  if (normalized === "ORDER_UPDATE_COURIER_STATUS") {
    return "Update status kurir";
  }

  if (normalized === "ORDER_ASSIGN_COURIER") {
    return "Assign kurir";
  }

  return normalized.replaceAll("_", " ");
}

export function formatOutboxMutationEntityLabel(record: OutboxMutationRecord): string {
  if (record.entity_type === "order" && record.entity_id) {
    return `Order ${record.entity_id.slice(0, 8)}`;
  }

  if (record.entity_id) {
    return record.entity_id.slice(0, 8);
  }

  return "Data lokal";
}
