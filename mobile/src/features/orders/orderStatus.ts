const LAUNDRY_FLOW = ["received", "washing", "drying", "ironing", "ready", "completed"] as const;
const COURIER_FLOW = [
  "pickup_pending",
  "pickup_on_the_way",
  "picked_up",
  "at_outlet",
  "delivery_pending",
  "delivery_on_the_way",
  "delivered",
] as const;

const STATUS_LABELS: Record<string, string> = {
  received: "Diterima",
  washing: "Dicuci",
  drying: "Dikeringkan",
  ironing: "Disetrika",
  ready: "Siap",
  completed: "Selesai",
  pickup_pending: "Menunggu Jemput",
  pickup_on_the_way: "Menuju Penjemputan",
  picked_up: "Sudah Dijemput",
  at_outlet: "Sampai Outlet",
  delivery_pending: "Menunggu Antar",
  delivery_on_the_way: "Sedang Diantar",
  delivered: "Sudah Diantar",
  "pickup on the way": "Menuju Penjemputan",
  "picked up": "Sudah Dijemput",
  "at outlet": "Sampai Outlet",
  "delivery on the way": "Sedang Diantar",
};

export function formatStatusLabel(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().toLowerCase();
  const lookupKey = normalized.replaceAll(" ", "_");

  if (STATUS_LABELS[lookupKey]) {
    return STATUS_LABELS[lookupKey];
  }

  if (STATUS_LABELS[normalized]) {
    return STATUS_LABELS[normalized];
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getNextLaundryStatus(current: string | null | undefined): string | null {
  if (!current) {
    return null;
  }

  const index = LAUNDRY_FLOW.indexOf(current as (typeof LAUNDRY_FLOW)[number]);
  if (index < 0 || index + 1 >= LAUNDRY_FLOW.length) {
    return null;
  }

  return LAUNDRY_FLOW[index + 1];
}

export function getNextCourierStatus(current: string | null | undefined): string | null {
  const resolved = current ?? "pickup_pending";
  const index = COURIER_FLOW.indexOf(resolved as (typeof COURIER_FLOW)[number]);
  if (index < 0 || index + 1 >= COURIER_FLOW.length) {
    return null;
  }

  return COURIER_FLOW[index + 1];
}

export function resolveLaundryTone(status: string | null | undefined): "info" | "warning" | "success" | "danger" {
  if (!status) {
    return "info";
  }
  if (status === "completed" || status === "ready") {
    return "success";
  }
  if (status === "received") {
    return "warning";
  }
  return "info";
}

export function resolveCourierTone(status: string | null | undefined): "info" | "warning" | "success" | "danger" {
  if (!status) {
    return "warning";
  }
  if (status === "delivered") {
    return "success";
  }
  if (status === "pickup_pending" || status === "delivery_pending") {
    return "warning";
  }
  return "info";
}
