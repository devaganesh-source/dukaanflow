
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import OrderStatusControls from "@/components/order-status-controls";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

import {
  type DeskOrderDetail,
  type OrderStatus,
  money,
  orderDate,
  statusClass,
  statusLabel,
} from "@/lib/order-desk-orders";

import OrderExportButton from "@/components/order-export-button";

type Props = {
  params: Promise<{ id: string }>;
};

type HistoryEntry = {
  id: number;
  order_id: number;
  actor_name: string;
  old_status: OrderStatus;
  new_status: OrderStatus;
  reason: string;
  changed_at: number;
};

function Unavailable() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-[#e1e8e1] bg-white p-8"
    >
      <h2 className="text-xl font-semibold">
        Order details unavailable
      </h2>

      <p className="mt-3 text-sm text-[#64766a]">
        We couldn&apos;t load this order.
        Please check the backend connection.
      </p>

      <Link
        href="/order-desk/orders"
        className="mt-5 inline-flex min-h-11 items-center font-medium text-[#176b52]"
      >
        Back to orders
      </Link>
    </section>
  );
}

async function OrderDetails({ params }: Props) {
  await connection();

  const session = await readSession();

  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return <Unavailable />;
  }

  if (session.user.role !== "order_desk") {
    redirect("/");
  }

  const { id } = await params;

  if (
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  ) {
    notFound();
  }

  let order: DeskOrderDetail | null = null;
  let responseStatus = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/orders/${id}`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    responseStatus = response.status;

    if (response.ok) {
      order = (await response.json()) as DeskOrderDetail;
    }
  } catch {
    // Display the unavailable state below.
  }

  if (responseStatus === 401) {
    redirect("/login");
  }

  if (responseStatus === 403) {
    redirect("/");
  }

  if (responseStatus === 404) {
    notFound();
  }

  if (!order) {
    return <Unavailable />;
  }

  // Load the saved status-change history.
  let history: HistoryEntry[] | null = null;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/orders/${id}/history`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    if (response.ok) {
      history = (await response.json()) as HistoryEntry[];
    }
  } catch {
    // Order details remain visible if history fails.
  }

  const paidCases = order.items.reduce(
    (total, item) => total + item.paid_cases,
    0
  );

  const freeCases = order.items.reduce(
    (total, item) => total + item.free_cases,
    0
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-[#e1e8e1] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf0ec] p-6">
          <div>
            <h2 className="text-xl font-semibold">
              Order #{order.id}
            </h2>

            <p className="mt-2 text-sm text-[#64766a]">
              {orderDate(order.created_at)}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-semibold ${statusClass(order.status)}`}
          >
            {statusLabel(order.status)}
          </span>
        </div>

        <div className="border-b border-[#edf0ec] p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64766a]">
            Retailer information
          </p>

          <p className="mt-2 font-semibold">
            {order.retailer_name}
          </p>

          <p className="mt-1 text-sm text-[#64766a]">
            Retailer ID #{order.retailer_id}
          </p>
        </div>

        <div className="p-6">
          <h3 className="text-lg font-semibold">
            Ordered products
          </h3>

          <div className="mt-4 divide-y divide-[#edf0ec]">
            {order.items.map((item) => (
              <article
                key={item.product_sku}
                className="py-5 first:pt-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 className="font-semibold">
                      {item.product_name}
                    </h4>

                    <p className="mt-1 text-xs text-[#64766a]">
                      {item.product_sku} · {item.pack}
                    </p>

                    <p className="mt-3 text-sm">
                      {item.paid_cases} paid cases
                    </p>

                    {item.free_cases > 0 && (
                      <p className="mt-1 text-sm font-medium text-[#176b52]">
                        +{item.free_cases} free cases
                      </p>
                    )}

                    <p className="mt-1 text-xs text-[#64766a]">
                      Total to fulfill: {item.total_cases} cases
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold">
                      {money(item.total_paise)}
                    </p>

                    <p className="mt-1 text-xs text-[#64766a]">
                      {money(item.unit_price_paise)} / case
                    </p>
                  </div>
                </div>

                {item.discount_paise > 0 && (
                  <div className="mt-3 rounded-lg bg-[#edf5ef] px-3 py-2 text-sm text-[#176b52]">
                    Scheme discount: −
                    {money(item.discount_paise)}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className="self-start rounded-2xl border border-[#e1e8e1] bg-white p-6 lg:sticky lg:top-6">
        <h3 className="text-lg font-semibold">
          Order summary
        </h3>

        <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-[#64766a]">
              Product lines
            </span>
            <span>{order.items.length}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64766a]">
              Paid cases
            </span>
            <span>{paidCases}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64766a]">
              Free cases
            </span>
            <span className="font-medium text-[#176b52]">
              {freeCases}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64766a]">
              Subtotal
            </span>
            <span>{money(order.subtotal_paise)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64766a]">
              Discounts
            </span>
            <span className="text-[#176b52]">
              −{money(order.discount_paise)}
            </span>
          </div>

          <div className="flex justify-between gap-3 border-t border-[#edf0ec] pt-5">
            <span className="font-semibold">
              Net value
            </span>

            <span className="text-xl font-semibold">
              {money(order.total_paise)}
            </span>
          </div>
        </div>

        <p className="mt-5 text-xs leading-5 text-[#64766a]">
          Excluding GST. No online payment
          has been collected.
        </p>

        <OrderStatusControls
          orderId={order.id}
          status={order.status}
        />
        <OrderExportButton
          orderId={order.id}
         status={order.status}
        />
      </aside>

      <section className="rounded-2xl border border-[#e1e8e1] bg-white p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold">
          Status history
        </h3>

        <p className="mt-2 text-sm text-[#64766a]">
          Review changes made to this order,
          including reasons and staff activity.
        </p>

        {history === null ? (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"
          >
            Status history is temporarily unavailable.
          </p>
        ) : history.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[#f5f8f4] p-4 text-sm text-[#64766a]">
            No status changes have been recorded yet.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            {history.map((event) => (
              <div
                key={event.id}
                className="border-l-2 border-[#b8d9c5] pl-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span>
                    {statusLabel(event.old_status)}
                  </span>

                  <span className="text-[#64766a]">
                    →
                  </span>

                  <span className="text-[#176b52]">
                    {statusLabel(event.new_status)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-[#354c40]">
                  {event.reason}
                </p>

                <p className="mt-2 text-xs text-[#64766a]">
                  {event.actor_name}
                  {" · "}
                  {orderDate(event.changed_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DeskOrderPage({
  params,
}: Props) {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/order-desk/orders"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#176b52]"
        >
          ← Back to orders
        </Link>

        <div className="mb-7 mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#176b52]">
            Distributor operations
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Order details
          </h1>
        </div>

        <Suspense
          fallback={
            <div className="rounded-2xl bg-white p-8 text-sm text-[#64766a]">
              Loading order details...
            </div>
          }
        >
          <OrderDetails params={params} />
        </Suspense>
      </div>
    </main>
  );
}
