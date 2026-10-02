"use client";

import { OrderStage, TERMINAL_STAGES } from "@/lib/orderStage";
import { TrackedOrder } from "@/lib/trackedOrders";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STAGE_COLOR: Record<OrderStage, string> = {
  received: "#94a3b8",
  preparing: "#eab308",
  ready: "var(--accent-ice)",
  completed: "#22c55e",
  canceled: "#ef4444",
};

function stageTitle(order: TrackedOrder): string {
  const delivery = order.role === "in_seat";
  switch (order.stage) {
    case "received":
      return "Order received";
    case "preparing":
      return "Being prepared";
    case "ready":
      return delivery ? "On its way" : "Ready for pickup";
    case "completed":
      return delivery ? "Delivered" : "Picked up";
    case "canceled":
      return "Order canceled";
  }
}

function stageDetail(order: TrackedOrder): string {
  const seat = order.seat ? `section ${order.seat.section}, row ${order.seat.row}, seat ${order.seat.seat}` : "your seat";
  switch (order.stage) {
    case "received":
      return `${order.standName} has your order. This screen updates as they work on it — keep it open.`;
    case "preparing":
      return `${order.standName} is making it now.`;
    case "ready":
      return order.role === "in_seat"
        ? `Heading to ${seat}.`
        : `Head to ${order.standName} and give the name ${order.recipientName}.`;
    case "completed":
      return "Enjoy the game!";
    case "canceled":
      return `${order.standName} canceled this order. Ask at the stand if you have questions — quote the order ref below.`;
  }
}

const STEPS: OrderStage[] = ["received", "preparing", "ready", "completed"];

function Steps({ order }: { order: TrackedOrder }) {
  const reached = STEPS.indexOf(order.stage);
  const labels = ["Received", "Preparing", "Ready", order.role === "in_seat" ? "Delivered" : "Picked up"];
  return (
    <ol className="flex items-start justify-between gap-1 my-5" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = reached >= i;
        return (
          <li key={step} className="flex-1 flex flex-col items-center gap-1.5" aria-current={reached === i ? "step" : undefined}>
            <div
              className="h-1.5 w-full rounded-full"
              style={{ backgroundColor: done ? STAGE_COLOR[order.stage] : "var(--border-default)" }}
            />
            <span
              className="an-label text-[10px]"
              style={{ color: done ? "var(--text-primary)" : "var(--text-tertiary)" }}
            >
              {labels[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface OrderTrackerSheetProps {
  order: TrackedOrder;
  /** Hide the sheet; the order keeps being tracked from the home page bar. */
  onClose: () => void;
  /** Stop tracking this order. Offered once it is finished. */
  onDismiss: () => void;
}

/** Live status for one placed order. Replaces the old static confirmation. */
export function OrderTrackerSheet({ order, onClose, onDismiss }: OrderTrackerSheetProps) {
  const finished = TERMINAL_STAGES.has(order.stage);
  const ready = order.stage === "ready";

  return (
    <div className="fixed inset-0 z-50">
      <div className="stand-sheet">
        <div className="stand-sheet-head">
          <button type="button" onClick={onClose} className="stand-sheet-back an-tap" aria-label="Back to stands">
            ‹
          </button>
          <div className="stand-sheet-titles">
            <h2 className="an-display">Your order</h2>
            <p>
              {order.standName} · {order.role === "in_seat" ? "Delivered to your seat" : "Pick up at the stand"}
            </p>
          </div>
        </div>

        <div
          className="text-center rounded-xl px-4 py-5"
          style={{
            backgroundColor: ready ? "var(--accent-gold-bg)" : "var(--bg-surface)",
            border: `${ready ? 2 : 1}px solid ${ready ? "var(--accent-ice)" : "var(--border-default)"}`,
          }}
          aria-live="polite"
        >
          <p
            className={`an-display ${ready ? "text-4xl" : "text-2xl"}`}
            style={{ color: ready ? "var(--accent-ice)" : order.stage === "canceled" ? STAGE_COLOR.canceled : "var(--text-primary)" }}
          >
            {stageTitle(order)}
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>{stageDetail(order)}</p>
        </div>

        {order.stage !== "canceled" && <Steps order={order} />}

        <div className="text-center">
          <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
            {order.paidWith === "card" && order.cardLast4
              ? `Paid ${money(order.amount.amount)} · ${order.cardBrand ?? "Card"} ····${order.cardLast4}`
              : order.paidWith === "promo"
                ? "Paid with promo code · $0.00"
                : `Total ${money(order.amount.amount)}`}
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            For {order.recipientName}
            {order.seat ? ` · Sec ${order.seat.section} Row ${order.seat.row} Seat ${order.seat.seat}` : ""}
          </p>
          {order.requiresIdCheck && !finished && (
            <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
              Have your ID ready — this order includes alcohol.
            </p>
          )}
          {order.receiptUrl && (
            <p className="text-xs mb-3">
              <a href={order.receiptUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent-ice)" }}>
                View Square receipt
              </a>
            </p>
          )}
          <p className="text-[10px] mb-4" style={{ color: "var(--text-tertiary)" }}>Order ref: {order.orderId}</p>
          {finished ? (
            <button type="button" onClick={onDismiss} className="an-btn-primary an-tap w-full">
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="an-btn-ghost an-tap w-full">
                Back to stands
              </button>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                We&apos;ll keep tracking it — tap &ldquo;Your order&rdquo; at the top to come back.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActiveOrdersBarProps {
  orders: TrackedOrder[];
  onOpen: (orderId: string) => void;
}

/** One row per tracked order on the home page, so a closed tracker is one tap away. */
export function ActiveOrdersBar({ orders, onOpen }: ActiveOrdersBarProps) {
  if (orders.length === 0) return null;
  return (
    <div className="w-full mb-4 space-y-2">
      {orders.map((o) => (
        <button
          key={o.orderId}
          type="button"
          onClick={() => onOpen(o.orderId)}
          className="an-tap w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
          style={{
            backgroundColor: o.stage === "ready" ? "var(--accent-gold-bg)" : "var(--bg-surface)",
            border: `${o.stage === "ready" ? 2 : 1}px solid ${o.stage === "ready" ? "var(--accent-ice)" : "var(--border-default)"}`,
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLOR[o.stage] }} />
            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
              <span className="an-label">Your order</span> · {o.standName}
            </span>
          </span>
          <span
            className="an-label text-xs shrink-0 ml-2"
            style={{ color: o.stage === "ready" ? "var(--accent-ice)" : "var(--text-secondary)" }}
          >
            {stageTitle(o)}
          </span>
        </button>
      ))}
    </div>
  );
}
