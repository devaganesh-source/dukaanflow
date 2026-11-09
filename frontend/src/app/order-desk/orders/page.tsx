
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

import {
  type DashboardResponse,
  money,
  orderDate,
  statusClass,
  statusLabel,
} from "@/lib/order-desk-orders";

type Filters = {
  status?: string | string[];
  retailer_id?: string | string[];
  page?: string | string[];
};

type Props = {
  searchParams: Promise<Filters>;
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function orderListUrl(
  status: string,
  retailerId: string,
  page: number
) {
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (retailerId) {
    params.set("retailer_id", retailerId);
  }

  params.set("page", String(page));

  return `/order-desk/orders?${params.toString()}`;
}

function Unavailable() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-[#e1e8e1] bg-white p-8"
    >
      <h2 className="text-lg font-semibold">
        Orders unavailable
      </h2>

      <p className="mt-3 text-sm text-[#64766a]">
        We couldn&apos;t load the order dashboard.
        Please check the backend connection.
      </p>

      <Link
        href="/order-desk/orders"
        className="mt-5 inline-flex min-h-11 items-center font-medium text-[#176b52]"
      >
        Try again
      </Link>
    </section>
  );
}

async function OrdersContent({
  searchParams,
}: Props) {
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

  const filters = await searchParams;

  const rawStatus = single(filters.status);

  const status =
    rawStatus === "submitted" ||
    rawStatus === "on_hold" ||
    rawStatus === "exported"
      ? rawStatus
      : "";

  const rawRetailerId = single(filters.retailer_id);

  const retailerId =
    /^[1-9]\d*$/.test(rawRetailerId) &&
    Number.isSafeInteger(Number(rawRetailerId))
      ? rawRetailerId
      : "";

  const rawPage = single(filters.page);

  const page =
    /^[1-9]\d*$/.test(rawPage) &&
    Number.isSafeInteger(Number(rawPage)) &&
    Number(rawPage) <= 10000
      ? Number(rawPage)
      : 1;

  const query = new URLSearchParams({
    page: String(page),
    page_size: "20",
  });

  if (status) {
    query.set("status", status);
  }

  if (retailerId) {
    query.set("retailer_id", retailerId);
  }

  let dashboard: DashboardResponse | null = null;
  let responseStatus = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/orders?${query}`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    responseStatus = response.status;

    if (response.ok) {
      dashboard =
        (await response.json()) as DashboardResponse;
    }
  } catch {
    // Show the unavailable state below.
  }

  if (responseStatus === 401) {
    redirect("/login");
  }

  if (responseStatus === 403) {
    redirect("/");
  }

  if (!dashboard) {
    return <Unavailable />;
  }

  const metrics = [
    {
      label: "Total orders",
      value: dashboard.summary.total_orders,
    },
    {
      label: "Submitted",
      value: dashboard.summary.submitted,
    },
    {
      label: "On hold",
      value: dashboard.summary.on_hold,
    },
    {
      label: "Exported",
      value: dashboard.summary.exported,
    },
  ];

  const hasPrevious = page > 1;

  const hasNext =
    page * dashboard.page_size < dashboard.total;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <section
            key={metric.label}
            className="rounded-2xl border border-[#e1e8e1] bg-white p-5"
          >
            <p className="text-sm text-[#64766a]">
              {metric.label}
            </p>

            <p className="mt-3 text-3xl font-semibold">
              {metric.value}
            </p>
          </section>
        ))}
        <section className="col-span-2 rounded-2xl border border-[#e1e8e1] bg-white p-5 lg:col-span-1">
          <p className="text-sm text-[#64766a]">Total order value</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {money(dashboard.summary.total_value_paise)}
          </p>
          <p className="mt-1 text-xs text-[#64766a]">Excluding GST</p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e1e8e1] bg-white">
        <div className="border-b border-[#edf0ec] p-5 sm:p-6">
          <h2 className="text-xl font-semibold">
            Retailer orders
          </h2>

          <p className="mt-1 text-sm text-[#64766a]">
            {dashboard.total} matching orders
          </p>

          <form
            action="/order-desk/orders"
            method="get"
            className="mt-5 flex flex-wrap items-end gap-3"
          >
            <div className="min-w-36 flex-1">
              <label
                htmlFor="order-status-filter"
                className="mb-2 block text-xs font-medium text-[#64766a]"
              >
                Status
              </label>

              <select
                id="order-status-filter"
                name="status"
                defaultValue={status}
                className="min-h-11 w-full rounded-xl border border-[#dce5dc] bg-white px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="submitted">Submitted</option>
                <option value="on_hold">On hold</option>
                <option value="exported">Exported</option>
              </select>
            </div>

            <div className="min-w-36 flex-1">
              <label
                htmlFor="retailer-filter"
                className="mb-2 block text-xs font-medium text-[#64766a]"
              >
                Retailer ID
              </label>

              <input
                id="retailer-filter"
                name="retailer_id"
                type="number"
                min="1"
                step="1"
                defaultValue={retailerId}
                placeholder="All retailers"
                className="min-h-11 w-full rounded-xl border border-[#dce5dc] px-3 text-sm"
              />
            </div>

            <button
              type="submit"
              className="min-h-11 rounded-xl bg-[#176b52] px-5 text-sm font-semibold text-white"
            >
              Apply filters
            </button>

            <Link
              href="/order-desk/orders"
              className="inline-flex min-h-11 items-center px-3 text-sm text-[#64766a]"
            >
              Clear
            </Link>
          </form>
        </div>

        {dashboard.orders.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold">
              No orders found
            </h3>

            <p className="mt-2 text-sm text-[#64766a]">
              Try changing the filters or place
              a new retailer order.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {dashboard.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/order-desk/orders/${order.id}`}
                  className="block rounded-xl border border-[#e1e8e1] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      Order #{order.id}
                    </p>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(order.status)}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium">
                    {order.retailer_name}
                  </p>

                  <p className="mt-1 text-xs text-[#64766a]">
                    Retailer #{order.retailer_id}
                  </p>

                  <p className="mt-1 text-xs text-[#64766a]">
                    {orderDate(order.created_at)}
                  </p>

                  <p className="mt-3 font-semibold">
                    {money(order.total_paise)}
                  </p>

                  <p className="mt-2 text-xs font-medium text-[#176b52]">
                    View details
                  </p>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f8faf7] text-xs text-[#64766a]">
                  <tr>
                    <th className="px-5 py-4 font-medium">
                      Order
                    </th>
                    <th className="px-5 py-4 font-medium">
                      Retailer
                    </th>
                    <th className="px-5 py-4 font-medium">
                      Placed
                    </th>
                    <th className="px-5 py-4 font-medium">
                      Status
                    </th>
                    <th className="px-5 py-4 text-right font-medium">
                      Value
                    </th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf0ec]">
                  {dashboard.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-4 font-semibold">
                        #{order.id}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium">
                          {order.retailer_name}
                        </p>

                        <p className="text-xs text-[#64766a]">
                          ID {order.retailer_id}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-[#64766a]">
                        {orderDate(order.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(order.status)}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right font-semibold">
                        {money(order.total_paise)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/order-desk/orders/${order.id}`}
                          className="font-semibold text-[#176b52] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0ec] px-5 py-4">
          <p className="text-xs text-[#64766a]">
            Page {page} · {dashboard.total} matching orders
          </p>

          <div className="flex gap-2">
            {hasPrevious ? (
              <Link
                href={orderListUrl(
                  status,
                  retailerId,
                  page - 1
                )}
                className="inline-flex min-h-11 items-center rounded-xl border border-[#dce5dc] px-4 text-sm font-medium"
              >
                Previous
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center rounded-xl border border-[#edf0ec] px-4 text-sm text-[#9ca9a0]">
                Previous
              </span>
            )}

            {hasNext ? (
              <Link
                href={orderListUrl(
                  status,
                  retailerId,
                  page + 1
                )}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#176b52] px-4 text-sm font-medium text-white"
              >
                Next
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center rounded-xl border border-[#edf0ec] px-4 text-sm text-[#9ca9a0]">
                Next
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function OrdersDashboardPage({
  searchParams,
}: Props) {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#176b52]">
            Distributor operations
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Order dashboard
          </h1>

          <p className="mt-2 text-sm text-[#64766a]">
            View retailer orders, statuses and totals.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-2xl bg-white p-8 text-sm text-[#64766a]">
              Loading orders...
            </div>
          }
        >
          <OrdersContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
