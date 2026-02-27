export interface OrderCustomer {
  id: string;
  name: string;
  phone_normalized: string;
}

export interface OrderCourier {
  id: string;
  name: string;
}

export interface OrderItemServiceDetail {
  id: string;
  duration_days: number | null;
  service_type?: string | null;
}

export interface OrderItemDetail {
  id: string;
  order_id: string;
  service_id: string;
  service_name_snapshot: string;
  unit_type_snapshot: string;
  qty: string | number | null;
  weight_kg: string | number | null;
  unit_price_amount: number;
  subtotal_amount: number;
  created_at: string;
  updated_at: string;
  service?: OrderItemServiceDetail | null;
}

export interface OrderPaymentDetail {
  id: string;
  order_id: string;
  amount: number;
  method: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderSummary {
  id: string;
  tenant_id: string;
  outlet_id: string;
  customer_id: string;
  courier_user_id: string | null;
  invoice_no: string | null;
  order_code: string;
  is_pickup_delivery: boolean;
  laundry_status: string;
  courier_status: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  created_at: string;
  updated_at: string;
  customer?: OrderCustomer;
  courier?: OrderCourier | null;
}

export interface OrderDetail extends OrderSummary {
  shipping_fee_amount?: number;
  discount_amount?: number;
  notes?: string | null;
  estimated_completion_at?: string | null;
  estimated_completion_duration_days?: number | null;
  estimated_completion_is_late?: boolean;
  pickup?: Record<string, unknown> | null;
  delivery?: Record<string, unknown> | null;
  items?: OrderItemDetail[];
  payments?: OrderPaymentDetail[];
  customer?: (OrderCustomer & { notes?: string | null }) | undefined;
  courier?: (OrderCourier & { phone?: string | null }) | null;
}
