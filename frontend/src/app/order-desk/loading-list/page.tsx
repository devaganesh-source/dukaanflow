
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import LoadingListBuilder from "@/components/loading-list-builder";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";

import type {
  DashboardResponse,
  DeskOrder,
} from "@/lib/order-desk-orders";

import { readSession } from "@/lib/server-session";

async function LoadingListContent() {
  await connection();

  const session = await readSession();

  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return (
      <p role="alert">
        Authentication is unavailable. Please retry.
      </p>
    );
  }

  if (session.user.role !== "order_desk") {
    redirect("/");
  }

  // Existing desk API filters by one order status.
  // Retrieve the newest 50 orders from each eligible status.
  const statuses = ["submitted", "exported"] as const;

  let results: DeskOrder[][] | null = null;
  let statusCode = 503;

  try {
    const responses = await Promise.all(
      statuses.map((status) => {
        const query = new URLSearchParams({
          status,
          page: "1",
          page_size: "50",
        });

        return fetch(
          `${BACKEND_ORIGIN}/api/order-desk/orders?${query}`,
          {
            headers: sessionHeaders(session.token),
            cache: "no-store",
          }
        );
      })
    );

    if (
      responses.some(
        (response) => response.status === 401
      )
    ) {
      statusCode = 401;
    } else if (
      responses.some(
        (response) => response.status === 403
      )
    ) {
      statusCode = 403;
    } else if (
      responses.every((response) => response.ok)
    ) {
      const data = (await Promise.all(
        responses.map((response) => response.json())
      )) as DashboardResponse[];

      results = data.map((page) => page.orders);
    }
  } catch {
    // Do not show a stale list when the backend is down.
  }

  if (statusCode === 401) {
    redirect("/login");
  }

  if (statusCode === 403) {
    redirect("/");
  }

  if (!results) {
    return (
      <section
        role="alert"
        className="rounded-2xl border bg-white p-6"
      >
        <h2 className="text-lg font-semibold">
          Orders unavailable
        </h2>

        <p className="mt-2 text-sm text-[#64766a]">
          Reconnect to the backend and refresh this page.
        </p>
      </section>
    );
  }

  const orders = results
    .flat()
    .sort(
      (a, b) =>
        b.created_at - a.created_at || b.id - a.id
    );

  return <LoadingListBuilder orders={orders} />;
}

export default function LoadingListPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 print:hidden">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#176b52]">
            Distributor operations
          </p>

          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">
                Van loading list
              </h1>

              <p className="mt-2 text-sm text-[#64766a]">
                Pick eligible orders and print their
                consolidated case quantities.
              </p>
            </div>

            <Link
              href="/order-desk/orders"
              className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-[#176b52]"
            >
              Back to orders
            </Link>
          </div>
        </div>

        <Suspense
          fallback={
            <p>Loading eligible orders...</p>
          }
        >
          <LoadingListContent />
        </Suspense>
      </div>
    </main>
  );
}
