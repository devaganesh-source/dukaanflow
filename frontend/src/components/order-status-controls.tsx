
"use client";

import {
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import type {
  OrderStatus,
} from "@/lib/order-desk-orders";


type Props = {
  orderId: number;
  status: OrderStatus;
};


export default function OrderStatusControls({
  orderId,
  status,
}: Props) {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submittingRef = useRef(false);

  if (status === "exported") {
    return (
      <div className="mt-6 rounded-xl bg-[#edf5ef] p-4 text-sm text-[#176b52]">
        This order is exported and cannot be edited.
      </div>
    );
  }

  const nextStatus: "submitted" | "on_hold" =
    status === "submitted" ? "on_hold" : "submitted";

  const actionLabel =
    status === "submitted"
      ? "Put order on hold"
      : "Resume order";

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submittingRef.current ||
      reason.trim().length < 3
    ) {
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/order-desk/orders/${orderId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            expected_status: status,
            new_status: nextStatus,
            reason: reason.trim(),
          }),
        }
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }

if (!response.ok) {
  let message = `Status update failed (${response.status}).`;

  if (
    data &&
    typeof data === "object" &&
    "detail" in data
  ) {
    const detail = data.detail;

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      const errors = detail
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            "msg" in item &&
            typeof item.msg === "string"
        )
        .map((item) => item.msg);

      if (errors.length > 0) {
        message = errors.join("; ");
      }
    }
  }

  throw new Error(message);
}


      setReason("");
      setSuccess("Order status updated successfully.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update order status."
      );

      // Refresh in case another staff member changed it.
      router.refresh();
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t border-[#edf0ec] pt-6">
      <h3 className="text-base font-semibold">
        Manage order
      </h3>

      <p className="mt-2 text-xs leading-5 text-[#64766a]">
        A reason is required. Every change is saved
        in the audit history.
      </p>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-4 space-y-4"
      >
        <div>
          <label
            htmlFor="status-reason"
            className="mb-2 block text-sm font-medium"
          >
            Reason for change
          </label>

          <textarea
            id="status-reason"
            value={reason}
            onChange={(event) =>
              setReason(event.target.value)
            }
            maxLength={300}
            minLength={3}
            rows={3}
            required
            disabled={busy}
            placeholder={
              status === "submitted"
                ? "Why does this order need review?"
                : "What was verified before resuming?"
            }
            className="w-full resize-y rounded-xl border border-[#dce5dc] p-3 text-sm outline-none focus:border-[#176b52]"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="rounded-lg bg-[#edf5ef] p-3 text-sm text-[#176b52]"
          >
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || reason.trim().length < 3}
          className="min-h-12 w-full rounded-xl bg-[#176b52] px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Updating..." : actionLabel}
        </button>
      </form>
    </section>
  );
}
