
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import type { Product } from "@/components/retailer-catalog";
import CheckoutReview from "@/components/checkout-review";
import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type CatalogResponse = {
  products: Product[];
};

async function CheckoutContent() {
  await connection();

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

  let products: Product[] | null = null;
  let status = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/products`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    status = response.status;

    if (response.ok) {
      const data =
        (await response.json()) as CatalogResponse;

      if (Array.isArray(data.products)) {
        products = data.products;
      }
    }
  } catch {
    // The error state is displayed below.
  }

  if (status === 401) {
    redirect("/login");
  }

  if (!products) {
    return <Unavailable />;
  }

  return (
    <CheckoutReview
      key={session.user.id}
      retailerId={session.user.id}
      products={products}
    />
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center">
        <h1 className="text-xl font-semibold">
          Checkout unavailable
        </h1>

        <p className="mt-3 text-sm text-[#64766a]">
          We couldn&apos;t load the latest catalogue.
        </p>

        <Link
          href="/checkout"
          className="mt-6 inline-block text-[#176b52] underline"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f8f4] p-6">
          Loading checkout...
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
