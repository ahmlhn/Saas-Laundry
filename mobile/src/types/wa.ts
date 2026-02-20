export interface WaProvider {
  id: string;
  key: string;
  name: string;
  configured: boolean;
  is_active: boolean;
  credentials_set: boolean;
  updated_at: string | null;
}

export interface WaMessageSummary {
  id: string;
  outlet_id: string | null;
  order_id: string | null;
  template_id: string | null;
  status: "queued" | "sent" | "delivered" | "failed" | string;
  recipient_phone: string | null;
  error_message: string | null;
  created_at: string;
}
