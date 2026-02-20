import type { OrderSummary } from "../../types/order";

export type OrderBucket = "validasi" | "antrian" | "proses" | "siap_ambil" | "siap_antar";

export const ORDER_BUCKETS: Array<{ key: OrderBucket; label: string }> = [
  { key: "validasi", label: "Validasi" },
  { key: "antrian", label: "Antrian" },
  { key: "proses", label: "Proses" },
  { key: "siap_ambil", label: "Siap Ambil" },
  { key: "siap_antar", label: "Siap Antar" },
];

export function resolveOrderBucket(order: OrderSummary): OrderBucket {
  const laundryStatus = (order.laundry_status || "").toLowerCase();
  const courierStatus = (order.courier_status || "").toLowerCase();

  if (laundryStatus === "received") {
    return "validasi";
  }

  if (laundryStatus === "washing") {
    return "antrian";
  }

  if (laundryStatus === "drying" || laundryStatus === "ironing") {
    return "proses";
  }

  if (laundryStatus === "ready") {
    return order.is_pickup_delivery ? "siap_antar" : "siap_ambil";
  }

  if (laundryStatus === "completed") {
    return order.is_pickup_delivery ? "siap_antar" : "siap_ambil";
  }

  if (["delivery_pending", "delivery_on_the_way", "delivered"].includes(courierStatus)) {
    return "siap_antar";
  }

  return "proses";
}

export function countOrdersByBucket(orders: OrderSummary[]): Record<OrderBucket, number> {
  const counts: Record<OrderBucket, number> = {
    validasi: 0,
    antrian: 0,
    proses: 0,
    siap_ambil: 0,
    siap_antar: 0,
  };

  for (const order of orders) {
    const bucket = resolveOrderBucket(order);
    counts[bucket] += 1;
  }

  return counts;
}
