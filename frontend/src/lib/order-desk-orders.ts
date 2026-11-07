
export type OrderStatus =
  | "submitted"
  | "on_hold"
  | "exported";

export type DeskOrder = {
  id: number;
  retailer_id: number;
  retailer_name: string;
  status: OrderStatus;
  created_at: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
};

export type DashboardResponse = {
  orders: DeskOrder[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    total_orders: number;
    total_value_paise: number;
    submitted: number;
    on_hold: number;
    exported: number;
  };
};

export type DeskOrderItem = {
  product_sku: string;
  product_name: string;
  pack: string;
  paid_cases: number;
  free_cases: number;
  total_cases: number;
  unit_price_paise: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
};

export type DeskOrderDetail = DeskOrder & {
  items: DeskOrderItem[];
};

export function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

export function orderDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }
  );
}

export function statusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    submitted: "Submitted",
    on_hold: "On hold",
    exported: "Exported",
  };

  return labels[status];
}

export function statusClass(status: OrderStatus): string {
  const classes: Record<OrderStatus, string> = {
    submitted: "bg-amber-50 text-amber-800",
    on_hold: "bg-orange-50 text-orange-800",
    exported: "bg-emerald-50 text-emerald-800",
  };

  return classes[status];
}

export type DeskStatusEvent = {
  id: number;
  order_id: number;
  actor_name: string;
  old_status: OrderStatus;
  new_status: OrderStatus;
  reason: string;
  changed_at: number;
};
