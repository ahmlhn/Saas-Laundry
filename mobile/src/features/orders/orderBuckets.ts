import type { OrderSummary } from "../../types/order";

export type OrderBucket = "antrian" | "proses" | "siap_ambil" | "siap_antar" | "selesai";

export const ORDER_BUCKETS: Array<{ key: OrderBucket; label: string }> = [
  { key: "antrian", label: "Antrian" },
  { key: "proses", label: "Proses" },
  { key: "siap_ambil", label: "Siap Ambil" },
  { key: "siap_antar", label: "Siap Antar" },
  { key: "selesai", label: "Selesai" },
];

const ORDER_BUCKET_KEY_SET = new Set<string>(ORDER_BUCKETS.map((bucket) => bucket.key));

export function normalizeOrderBucket(value: string | null | undefined): OrderBucket {
  if (value === "validasi") {
    return "antrian";
  }

  if (value && ORDER_BUCKET_KEY_SET.has(value)) {
    return value as OrderBucket;
  }

  return "antrian";
}

export function resolveOrderBucket(order: OrderSummary): OrderBucket {
  const laundryStatus = (order.laundry_status || "").toLowerCase();
  const courierStatus = (order.courier_status || "").toLowerCase();
  const isPickupDelivery = Boolean(order.is_pickup_delivery);

  if (isPickupDelivery && courierStatus === "delivered") {
    return "selesai";
  }

  if (!isPickupDelivery && laundryStatus === "completed") {
    return "selesai";
  }

  if (laundryStatus === "received") {
    return "antrian";
  }

  if (laundryStatus === "washing") {
    return "proses";
  }

  if (laundryStatus === "drying" || laundryStatus === "ironing") {
    return "proses";
  }

  if (laundryStatus === "ready") {
    return isPickupDelivery ? "siap_antar" : "siap_ambil";
  }

  if (laundryStatus === "completed") {
    return isPickupDelivery ? "siap_antar" : "selesai";
  }

  if (isPickupDelivery && ["delivery_pending", "delivery_on_the_way"].includes(courierStatus)) {
    return "siap_antar";
  }

  return "proses";
}

export function countOrdersByBucket(orders: OrderSummary[]): Record<OrderBucket, number> {
  const counts: Record<OrderBucket, number> = {
    antrian: 0,
    proses: 0,
    siap_ambil: 0,
    siap_antar: 0,
    selesai: 0,
  };

  for (const order of orders) {
    const bucket = resolveOrderBucket(order);
    counts[bucket] += 1;
  }

  return counts;
}
