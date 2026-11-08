
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import RepeatOrderButton from "@/components/repeat-order-button";
import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type SavedItem = {
  product_sku: string;
  product_name: string;
  paid_cases: number;
};

type SavedOrder = {
  id: number;
  items: SavedItem[];
};

type AvailableProduct = {
  sku: string;
  name: string;
  stock_cases: number;
};

async function RepeatContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  if (!/^[1-9]\d*$/.test(id)) {
    notFound();
  }

  const session = await readSession();

  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return (
      <main className="p-8" role="alert">
        Authentication service unavailable. Try again.
      </main>
    );
  }

  if (session.user.role !== "retailer") {
    redirect("/order-desk");
  }

  const headers = sessionHeaders(session.token);

  let order: SavedOrder | null = null;
  let products: AvailableProduct[] | null = null;
  let orderStatus = 503;
  let catalogueStatus = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/orders/${id}`,
      {
        headers,
        cache: "no-store",
      }
    );

    orderStatus = response.status;

    if (response.ok) {
      order = (await response.json()) as SavedOrder;
    }
  } catch {
    // Show the failure state below.
  }

  if (orderStatus === 401) {
    redirect("/login");
  }

  if (orderStatus === 404) {
    notFound();
  }

  if (order) {
    try {
      const response = await fetch(
        `${BACKEND_ORIGIN}/api/products`,
        {
          headers,
          cache: "no-store",
        }
      );

      catalogueStatus = response.status;

      if (response.ok) {
        const data = (await response.json()) as {
          products?: AvailableProduct[];
        };

        if (Array.isArray(data.products)) {
          products = data.products;
        }
      }
    } catch {
      // Cannot safely repeat without the current catalogue.
    }
  }

  if (catalogueStatus === 401) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/orders"
          className="text-sm font-semibold text-[#176b52] underline"
        >
          ← My orders
        </Link>

        <div className="mt-5 rounded-2xl border border-[#e1e8e1] bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#176b52]">
            Retailer workspace
          </p>

          <h1 className="mt-2 text-2xl font-semibold">
            Repeat order #{id}
          </h1>

          <p className="mt-2 text-sm text-[#64766a]">
            Create a new cart based on an existing order.
            This does not automatically place a purchase.
          </p>

          {!order ? (
            <p
              role="alert"
              className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              The order service is unavailable.
              Please retry.
            </p>
          ) : !products ? (
            <p
              role="alert"
              className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              Current catalogue is unavailable.
              Repeating is disabled until stock can be checked.
            </p>
          ) : (
            <RepeatOrderButton
              retailerId={session.user.id}
              orderId={order.id}
              items={order.items}
              products={products}
            />
          )}
        </div>
      </div>
    </main>
  );
}

export default function RepeatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          Loading previous order...
        </main>
      }
    >
      <RepeatContent params={params} />
    </Suspense>
  );
}
