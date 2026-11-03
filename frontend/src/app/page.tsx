
import { Suspense } from "react";
import RetailerCatalog, {
  type Product,
} from "@/components/retailer-catalog";
import Loading from "./loading";
import Link from "next/link";

type CatalogResponse = {
  products: Product[];
};

async function getProducts(): Promise<Product[] | null> {
  const apiOrigin =
    process.env.API_ORIGIN || "http://127.0.0.1:8000";

  try {
    const response = await fetch(
      `${apiOrigin.replace(/\/$/, "")}/api/products`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as CatalogResponse;
    return data.products;
  } catch {
    return null;
  }
}

function CatalogueError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6">
      <section
        role="alert"
        className="w-full max-w-md rounded-2xl border border-[#e1e8e1] bg-white p-8 text-center"
      >
        <h1 className="text-xl font-semibold text-[#112b25]">
          Catalogue unavailable
        </h1>

        <p className="mt-3 text-sm text-[#64766a]">
          We couldn&apos;t load the products. Please check that
          the backend is running and try again.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#176b52] px-5 font-medium text-white"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}

async function CatalogContent() {
  const products = await getProducts();

  if (!products) {
    return <CatalogueError />;
  }

  return <RetailerCatalog products={products} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <CatalogContent />
    </Suspense>
  );
}
