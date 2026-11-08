
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type HistoryEntry = {
  id: number;
  status: string;
  created_at: number;
  total_paise: number;
};

type HistoryResponse = {
  orders: HistoryEntry[];
  total: number;
  page: number;
  page_size: number;
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

async function OrdersContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await connection();

  const session = await readSession();

  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return (
      <main className="p-8" role="alert">
        Order service unavailable. Please retry.
      </main>
    );
  }

  if (session.user.role !== "retailer") {
    redirect("/order-desk");
  }

  const params = await searchParams;
  const requestedPage = Number(params.page ?? "1");

  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  let history: HistoryResponse | null = null;
  let status = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/orders?page=${page}&page_size=20`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    status = response.status;

    if (response.ok) {
      history = (await response.json()) as HistoryResponse;
    }
  } catch {
    // Show an error state below.
  }

  if (status === 401) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#176b52]">
              Retailer workspace
            </p>

            <h1 className="mt-2 text-3xl font-semibold">
              My orders
            </h1>

            <p className="mt-2 text-sm text-[#64766a]">
              Open a past order to repeat it with current
              stock and pricing.
            </p>
          </div>

          <Link
            href="/"
            className="flex min-h-11 items-center rounded-xl border border-[#c9d9cc] bg-white px-4 text-sm font-semibold text-[#176b52]"
          >
            Back to catalogue
          </Link>
        </div>

        {!history ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#e1e8e1] bg-white p-8"
          >
            <p className="font-semibold">
              Unable to load order history
            </p>
            <p className="mt-2 text-sm text-[#64766a]">
              Please try again when the order service
              is available.
            </p>
            <Link
              href="/orders"
              className="mt-4 inline-block text-[#176b52] underline"
            >
              Retry
            </Link>
          </div>
        ) : history.orders.length === 0 ? (
          <div className="rounded-2xl border border-[#e1e8e1] bg-white p-10 text-center">
            <h2 className="text-lg font-semibold">
              {page === 1
                ? "No orders yet"
                : "No more orders"}
            </h2>
            <p className="mt-2 text-sm text-[#64766a]">
              Your placed orders will appear here.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block font-semibold text-[#176b52] underline"
            >
              Browse catalogue
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-[#64766a]">
              {history.total} orders
            </p>

            <div className="space-y-3">
              {history.orders.map((order) => (
                <article
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e1e8e1] bg-white p-5"
                >
                  <div>
                    <p className="font-semibold">
                      Order #{order.id}
                    </p>

                    <p className="mt-1 text-xs text-[#64766a]">
                      {new Date(
                        order.created_at * 1000
                      ).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {" · "}
                      {order.status.replaceAll("_", " ")}
                    </p>

                    <p className="mt-2 font-semibold tabular-nums">
                      {money(order.total_paise)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/orders/${order.id}`}
                      className="inline-flex min-h-11 items-center rounded-xl border border-[#c9d9cc] bg-white px-4 text-sm font-semibold text-[#176b52]"
                    >
                      View details
                    </Link>

                    <Link
                      href={`/orders/${order.id}/repeat`}
                      className="inline-flex min-h-11 items-center rounded-xl bg-[#176b52] px-4 text-sm font-semibold text-white hover:bg-[#12543f]"
                    >
                      Repeat order
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <nav
              aria-label="Order history pages"
              className="mt-6 flex items-center justify-between gap-4"
            >
              {page > 1 ? (
                <Link
                  href={`/orders?page=${page - 1}`}
                  className="text-sm font-semibold text-[#176b52] underline"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}

              {page * history.page_size < history.total ? (
                <Link
                  href={`/orders?page=${page + 1}`}
                  className="text-sm font-semibold text-[#176b52] underline"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="p-8">Loading orders...</main>
      }
    >
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}
