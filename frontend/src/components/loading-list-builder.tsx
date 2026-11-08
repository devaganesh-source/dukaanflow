
"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Printer, Truck } from "lucide-react";

import {
  type DeskOrder,
  orderDate,
  statusLabel,
} from "@/lib/order-desk-orders";

type LoadingLine = {
  product_sku: string;
  product_name: string;
  pack: string;
  paid_cases: number;
  free_cases: number;
  total_cases: number;
};

type LoadingOrder = {
  order_id: number;
  retailer_id: number;
  retailer_name: string;
  status: string;
  items: LoadingLine[];
};

type LoadingPreview = {
  generated_at: number;
  order_count: number;
  retailer_count: number;
  paid_cases: number;
  free_cases: number;
  total_cases: number;
  lines: LoadingLine[];
  orders: LoadingOrder[];
};

type Props = {
  orders: DeskOrder[];
};

function dateTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function LoadingListBuilder({ orders }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [extraIds, setExtraIds] = useState("");
  const [preview, setPreview] =
    useState<LoadingPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const eligible = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "submitted" ||
          order.status === "exported"
      ),
    [orders]
  );

  function toggle(orderId: number) {
    setSelected((previous) =>
      previous.includes(orderId)
        ? previous.filter((id) => id !== orderId)
        : [...previous, orderId]
    );

    setPreview(null);
    setError("");
  }

  async function generate() {
    setError("");
    setPreview(null);

    const manualParts = extraIds.trim()
      ? extraIds.trim().split(/[\s,]+/)
      : [];

    const invalid = manualParts.some(
      (id) =>
        !/^[1-9]\d*$/.test(id) ||
        !Number.isSafeInteger(Number(id))
    );

    if (invalid) {
      setError(
        "Enter valid positive order IDs separated by commas or spaces."
      );
      return;
    }

    const ids = [
      ...new Set([
        ...selected,
        ...manualParts.map(Number),
      ]),
    ];

    if (!ids.length || ids.length > 50) {
      setError(
        "Select between 1 and 50 eligible orders."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/order-desk/loading-list",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ order_ids: ids }),
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to generate the loading list."
        );
        return;
      }

      setPreview(data as LoadingPreview);
    } catch {
      setError(
        "Unable to connect. Please check your network connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#e1e8e1] bg-white p-5 sm:p-6 print:hidden">
        <div className="flex items-center gap-2">
          <ClipboardList
            className="text-[#176b52]"
            size={22}
          />

          <h2 className="text-xl font-semibold">
            Select orders
          </h2>
        </div>

        <p className="mt-2 text-sm leading-6 text-[#64766a]">
          Showing up to 50 most recent submitted and
          50 most recent exported orders. On-hold orders
          are not eligible. For older orders, enter their
          IDs below. A preview includes a maximum of
          50 unique orders.
        </p>

        {eligible.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[#f7f8f4] p-4 text-sm">
            No eligible recent orders. Place or release
            an order first.
          </p>
        ) : (
          <div className="mt-5 max-h-80 space-y-2 overflow-y-auto">
            {eligible.map((order) => (
              <label
                key={order.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e1e8e1] p-4 hover:bg-[#f7f8f4]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(order.id)}
                  disabled={loading}
                  onChange={() => toggle(order.id)}
                  className="mt-1 h-5 w-5 accent-[#176b52]"
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    Order #{order.id} ·{" "}
                    {order.retailer_name}
                  </span>

                  <span className="mt-1 block text-xs text-[#64766a]">
                    {orderDate(order.created_at)} ·{" "}
                    {statusLabel(order.status)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <label
          htmlFor="extra-loading-order-ids"
          className="mt-5 block text-sm font-semibold"
        >
          Other order IDs (optional)
        </label>

        <input
          id="extra-loading-order-ids"
          value={extraIds}
          disabled={loading}
          onChange={(event) => {
            setExtraIds(event.target.value);
            setPreview(null);
            setError("");
          }}
          placeholder="e.g. 12, 14, 18"
          className="mt-2 min-h-12 w-full rounded-xl border border-[#c9d9cc] px-4 text-sm outline-none focus:border-[#176b52]"
        />

        <p className="mt-2 text-xs text-[#64766a]">
          The backend checks that every order exists
          and is not credit-held.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={generate}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-5 font-semibold text-white hover:bg-[#12543f] disabled:opacity-60 sm:w-auto"
        >
          <Truck size={19} />

          {loading
            ? "Generating..."
            : "Generate loading list"}
        </button>
      </section>

      {preview && (
        <section className="rounded-2xl border border-[#e1e8e1] bg-white p-5 sm:p-8 print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#176b52]">
                DukaanFlow · Distributor
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                Van loading list
              </h2>

              <p className="mt-2 text-sm text-[#64766a]">
                Generated{" "}
                {dateTime(preview.generated_at)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c9d9cc] px-4 text-sm font-semibold text-[#176b52] print:hidden"
            >
              <Printer size={17} />
              Print / Save as PDF
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Orders", preview.order_count],
              ["Shops", preview.retailer_count],
              ["Paid cases", preview.paid_cases],
              ["Free cases", preview.free_cases],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl bg-[#f7f8f4] p-4 print:border"
              >
                <p className="text-xs text-[#64766a]">
                  {label}
                </p>

                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm font-semibold">
            Total to load: {preview.total_cases} cases
            {" "}(including {preview.free_cases} free)
          </p>

          <h3 className="mt-8 text-lg font-semibold">
            Consolidated picking list
          </h3>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-[#f7f8f4]">
                  <th className="p-3">
                    Product / SKU
                  </th>
                  <th className="p-3">
                    Pack
                  </th>
                  <th className="p-3 text-right">
                    Paid
                  </th>
                  <th className="p-3 text-right">
                    Free
                  </th>
                  <th className="p-3 text-right">
                    Load
                  </th>
                </tr>
              </thead>

              <tbody>
                {preview.lines.map((line) => (
                  <tr
                    key={`${line.product_sku}:${line.pack}`}
                    className="border-b"
                  >
                    <td className="p-3">
                      <span className="block font-medium">
                        {line.product_name}
                      </span>

                      <span className="text-xs text-[#64766a]">
                        {line.product_sku}
                      </span>
                    </td>

                    <td className="p-3">
                      {line.pack}
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      {line.paid_cases}
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      {line.free_cases}
                    </td>

                    <td className="p-3 text-right font-semibold tabular-nums">
                      {line.total_cases}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-lg font-semibold">
            Retailer-wise allocations
          </h3>

          <div className="mt-3 space-y-4">
            {preview.orders.map((order) => (
              <div
                key={order.order_id}
                className="break-inside-avoid rounded-xl border p-4"
              >
                <p className="font-semibold">
                  {order.retailer_name} ·
                  {" "}Order #{order.order_id}
                </p>

                <p className="mt-1 text-xs text-[#64766a]">
                  {order.status.replaceAll("_", " ")}
                </p>

                <ul className="mt-3 space-y-1 text-sm">
                  {order.items.map((item) => (
                    <li
                      key={`${item.product_sku}:${item.pack}`}
                      className="flex justify-between gap-3"
                    >
                      <span>
                        {item.product_name} ·{" "}
                        {item.pack}
                      </span>

                      <span className="shrink-0 font-medium tabular-nums">
                        {item.total_cases} cases
                        {item.free_cases
                          ? ` (${item.free_cases} free)`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs leading-5 text-[#64766a]">
            Picking preview only. Confirm physical stock
            and dispatch separately. Generating or printing
            this sheet does not change order status or stock.
          </p>
        </section>
      )}
    </div>
  );
}
