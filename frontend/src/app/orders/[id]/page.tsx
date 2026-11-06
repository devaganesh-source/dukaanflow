
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type SavedItem = {
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

type SavedOrder = {
  id: number;
  retailer_id: number;
  status: string;
  created_at: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  items: SavedItem[];
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

function Unavailable() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] p-8">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">
          Order details unavailable
        </h1>

        <p className="mt-3 text-sm text-[#64766a]">
          The order service could not be reached.
          Please retry before attempting another order.
        </p>

        <Link
          href="/"
          className="mt-5 inline-block text-[#176b52] underline"
        >
          Return to catalogue
        </Link>
      </div>
    </main>
  );
}


async function OrderContent({
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
    return <Unavailable />;
  }

  if (session.user.role === "order_desk") {
    redirect("/order-desk");
  }

  let order: SavedOrder | null = null;
  let status = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/orders/${id}`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    status = response.status;

    if (response.ok) {
      order = (await response.json()) as SavedOrder;
    }
  } catch {
    // Handled below.
  }

  if (status === 401) {
    redirect("/login");
  }

  if (status === 404) {
    notFound();
  }

  if (!order) {
    return <Unavailable />;
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-[#e1e8e1] bg-white p-6 sm:p-9">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#edf5ef] text-2xl text-[#176b52]">
            ✓
          </div>

          <h1 className="mt-5 text-3xl font-semibold">
            Order placed
          </h1>

          <p className="mt-3 text-sm text-[#64766a]">
            Your order has been saved successfully.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-4 rounded-xl bg-[#f5f8f4] p-5">
            <div>
              <p className="text-xs text-[#64766a]">
                Order number
              </p>
              <p className="mt-1 font-semibold">
                #{order.id}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#64766a]">
                Status
              </p>
              <p className="mt-1 font-semibold capitalize">
                {order.status.replaceAll("_", " ")}
              </p>
            </div>

            <div className="col-span-2">
              <p className="text-xs text-[#64766a]">
                Placed on
              </p>
              <p className="mt-1 text-sm font-medium">
                {new Date(
                  order.created_at * 1000
                ).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>

          <h2 className="mt-8 text-lg font-semibold">
            Order items
          </h2>

          <div className="mt-4 divide-y divide-[#edf0ec]">
            {order.items.map((item) => (
              <div
                key={item.product_sku}
                className="py-5"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-medium">
                      {item.product_name}
                    </h3>

                    <p className="mt-1 text-xs text-[#64766a]">
                      {item.pack} · {item.product_sku}
                    </p>

                    <p className="mt-2 text-sm">
                      {item.paid_cases} paid cases
                    </p>

                    {item.free_cases > 0 && (
                      <p className="mt-1 text-sm font-medium text-[#176b52]">
                        +{item.free_cases} free cases
                      </p>
                    )}

                    <p className="mt-1 text-xs text-[#64766a]">
                      {item.total_cases} cases to fulfill
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold">
                      {money(item.total_paise)}
                    </p>

                    <p className="mt-1 text-xs text-[#64766a]">
                      {money(item.unit_price_paise)}
                      /case
                    </p>
                  </div>
                </div>

                {item.discount_paise > 0 && (
                  <p className="mt-3 text-sm font-medium text-[#176b52]">
                    Scheme discount: −
                    {money(item.discount_paise)}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3 border-t border-[#e1e8e1] pt-6 text-sm">
            <div className="flex justify-between">
              <span className="text-[#64766a]">
                Subtotal
              </span>
              <span>
                {money(order.subtotal_paise)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#64766a]">
                Scheme discounts
              </span>
              <span className="font-medium text-[#176b52]">
                −{money(order.discount_paise)}
              </span>
            </div>

            <div className="flex justify-between border-t border-[#edf0ec] pt-4">
              <span className="font-semibold">
                Order total (excl. GST)
              </span>

              <span className="text-xl font-semibold">
                {money(order.total_paise)}
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#64766a]">
            GST is not calculated or added by the
            current demo checkout. No online payment
            has been collected.
          </p>

          <Link
            href="/"
            className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#176b52] px-5 font-semibold text-white"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    </main>
  );
}


export default function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f8f4] p-6">
          Loading order...
        </main>
      }
    >
      <OrderContent params={params} />
    </Suspense>
  );
}
