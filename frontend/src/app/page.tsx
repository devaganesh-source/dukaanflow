
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";

import RetailerCatalog, {
  type Product,
} from "@/components/retailer-catalog";
import Loading from "./loading";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type CatalogResponse = {
  products: Product[];
};

function CatalogueUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6">
      <section
        role="alert"
        className="w-full max-w-md rounded-2xl border border-[#e1e8e1] bg-white p-8 text-center"
      >
        <h1 className="text-xl font-semibold">
          Catalogue unavailable
        </h1>

        <p className="mt-3 text-sm text-[#64766a]">
          We couldn&apos;t load your catalogue.
          Please try again.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#176b52] px-5 font-medium text-white"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}


async function CatalogContent() {
  await connection();

  const session = await readSession();


  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return <CatalogueUnavailable />;
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
    // Display the unavailable state below.
  }

  if (status === 401) {
    redirect("/login");
  }

  if (!products) {
    return <CatalogueUnavailable />;
  }


return (
  <RetailerCatalog
    key={session.user.id}
    products={products}
    retailerName={session.user.name}
    retailerId={session.user.id}
  />
);


}

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <CatalogContent />
    </Suspense>
  );
}