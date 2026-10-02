// Order-tracking types shared by the status route and the browser tracker.
// Kept free of server imports so the client bundle never pulls in the Square
// client. The Square-state -> stage mapping lives in square/orderStatus.ts.

export type OrderStage = "received" | "preparing" | "ready" | "completed" | "canceled";

export interface OrderStatus {
  orderId: string;
  stage: OrderStage;
  /** ISO, when Square last changed the order. Null in mock mode. */
  updatedAt: string | null;
}

export const TERMINAL_STAGES: ReadonlySet<OrderStage> = new Set(["completed", "canceled"]);

/** Most orders one status request may ask about, and most a browser tracks. */
export const MAX_STATUS_IDS = 5;
