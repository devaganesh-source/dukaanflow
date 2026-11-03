
"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Gift,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

export type Product = {
  sku: string;
  name: string;
  category: string;
  pack: string;
  price_paise: number;
  stock_cases: number;
  scheme: string | null;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);

const categoryColors: Record<string, string> = {
  Snacks: "bg-amber-50 text-amber-700",
  Grocery: "bg-orange-50 text-orange-700",
  "Home Care": "bg-blue-50 text-blue-700",
  Beverages: "bg-emerald-50 text-emerald-700",
};

export default function RetailerCatalog({
  products,
}: {
  products: Product[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [quantities, setQuantities] = useState<
    Record<string, number>
  >({});

  const draftRef = useRef<HTMLElement>(null);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((p) => p.category))],
    [products]
  );

  const filtered = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku.toLowerCase().includes(search.toLowerCase());

    return (
      matchesSearch &&
      (category === "All" || product.category === category)
    );
  });

  function changeQuantity(product: Product, change: number) {
    setQuantities((current) => {
      const previous = current[product.sku] ?? 0;
      const next = Math.max(
        0,
        Math.min(product.stock_cases, previous + change)
      );

      const updated = { ...current };

      if (next === 0) {
        delete updated[product.sku];
      } else {
        updated[product.sku] = next;
      }

      return updated;
    });
  }

  const draftItems = products.filter(
    (product) => (quantities[product.sku] ?? 0) > 0
  );

  const totalCases = draftItems.reduce(
    (sum, product) => sum + quantities[product.sku],
    0
  );

  const subtotalPaise = draftItems.reduce(
    (sum, product) =>
      sum + product.price_paise * quantities[product.sku],
    0
  );

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#112b25]">
      <header className="border-b border-[#e1e8e1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#176b52] text-white">
              <PackageCheck size={22} />
            </div>

            <div>
              <p className="text-lg font-bold tracking-tight">
                DukaanFlow
              </p>
              <p className="text-xs text-[#64766a]">
                Retailer workspace
              </p>
            </div>
          </div>

          <div className="rounded-full bg-[#edf5ef] px-3 py-2 text-xs font-medium text-[#176b52]">
            Demo retailer
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
      <section className="mb-6 overflow-hidden rounded-2xl bg-[#173e30] p-5 text-white sm:p-6">
          <div className="max-w-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#b8d9c5]">
              Your everyday ordering workspace
            </p>

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Restock, without the back-and-forth.
            </h1>

            <p className="mt-3 max-w-md text-sm leading-6 text-[#c9dfd2]">
              Browse your products, check availability
              and build an order draft in seconds.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs text-[#e4f2e9]">
              <Sparkles size={15} />
              AI message ordering is coming next
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight">
                Product catalogue
              </h2>
              <p className="mt-1 text-sm text-[#64766a]">
                Explore products, prices and available stock.
              </p>
            </div>

            <div className="relative mb-4">
              <label htmlFor="product-search" className="sr-only">
                Search products
              </label>

              <Search
                 size={19}
                 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#748379]"
              />

              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or SKU..."
                className="h-12 w-full rounded-xl border border-[#dce5dc] bg-white pl-12 pr-4 text-sm outline-none transition focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"
              />
            </div>

            <div
              className="mb-6 flex gap-2 overflow-x-auto pb-2"
              aria-label="Product categories"
            >
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                    category === item
                      ? "bg-[#176b52] text-white"
                      : "border border-[#e1e8e1] bg-white text-[#52675a] hover:border-[#176b52]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium">
                {filtered.length} products
              </p>
              <p className="text-xs text-[#64766a]">
                Prices per case
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-[#e1e8e1] bg-white px-6 py-14 text-center">
                <Package
                  size={36}
                  className="mx-auto mb-4 text-[#899b8e]"
                />
                <h3 className="font-semibold">
                  No matching products
                </h3>
                <p className="mt-2 text-sm text-[#64766a]">
                  Try another product name or category.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategory("All");
                  }}
                  className="mt-5 text-sm font-semibold text-[#176b52] underline underline-offset-4"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((product) => {
                  const quantity = quantities[product.sku] ?? 0;
                  const available = product.stock_cases > 0;

                  return (
                    <article
                      key={product.sku}
                      className="flex flex-col rounded-2xl border border-[#e1e8e1] bg-white p-4 transition-colors hover:border-[#b7cfc0]"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div
                          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl ${
                            categoryColors[product.category] ??
                            "bg-slate-50 text-slate-600"
                          }`}
                        >
                          <Package size={34} strokeWidth={1.5} />
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            available
                              ? "bg-[#ebf5ed] text-[#176b52]"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {available
                            ? `${product.stock_cases} cases left`
                            : "Out of stock"}
                        </span>
                      </div>

                      <div className="flex-1">
                        <p className="mb-1 text-xs font-medium text-[#718076]">
                          {product.category}
                        </p>

                        <h3 className="text-base font-semibold">
                          {product.name}
                        </h3>

                        <p className="mt-1 text-xs text-[#718076]">
                          {product.pack} · {product.sku}
                        </p>

                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            {money(product.price_paise)}
                          </span>
                          <span className="text-xs text-[#718076]">
                            / case
                          </span>
                        </div>

                        {product.scheme && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#eef7ee] p-2.5 text-xs font-medium text-[#176b52]">
                            <Gift size={15} className="shrink-0" />
                            <span>{product.scheme}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-5">
                        {quantity === 0 ? (
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => changeQuantity(product, 1)}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] text-sm font-semibold text-white transition hover:bg-[#12543f] disabled:bg-[#e7eae7] disabled:text-[#9ca8a0]"
                          >
                            <Plus size={17} />
                            {available
                              ? "Add to draft"
                              : "Unavailable"}
                          </button>
                        ) : (
                          <div className="flex h-11 items-center justify-between rounded-xl border border-[#c6ddce] bg-[#f1f8f2] p-1">
                            <button
                              type="button"
                              aria-label={`Remove one case of ${product.name}`}
                              onClick={() =>
                                changeQuantity(product, -1)
                              }
                              className="flex h-9 w-10 items-center justify-center rounded-lg bg-white text-[#176b52] hover:bg-[#e1eee3]"
                            >
                              <Minus size={17} />
                            </button>

                            <span className="text-sm font-semibold tabular-nums">
                              {quantity} cases
                            </span>

                            <button
                              type="button"
                              aria-label={`Add one case of ${product.name}`}
                              disabled={quantity >= product.stock_cases}
                              onClick={() =>
                                changeQuantity(product, 1)
                              }
                              className="flex h-9 w-10 items-center justify-center rounded-lg bg-[#176b52] text-white hover:bg-[#12543f] disabled:opacity-40"
                            >
                              <Plus size={17} />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside
            id="order-draft"
            ref={draftRef}
            className="self-start rounded-2xl border border-[#e1e8e1] bg-white p-5 lg:sticky lg:top-6"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#edf5ef] p-3 text-[#176b52]">
                <ShoppingCart size={21} />
              </div>

              <div>
                <h2 className="font-semibold">Order draft</h2>
                <p className="text-xs text-[#64766a]">
                  {totalCases} cases selected
                </p>
              </div>
            </div>

            {draftItems.length === 0 ? (
              <div className="py-12 text-center">
                <Package
                  size={34}
                  className="mx-auto text-[#a5b4a8]"
                />
                <p className="mt-4 text-sm font-medium">
                  Your draft is empty
                </p>
                <p className="mt-2 text-xs leading-5 text-[#718076]">
                  Add products from the catalogue to
                  start building your order.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 space-y-4">
                  {draftItems.map((product) => (
                    <div
                      key={product.sku}
                      className="flex items-start justify-between gap-3 border-b border-[#edf0ec] pb-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-[#718076]">
                          {quantities[product.sku]} cases
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {money(
                          product.price_paise *
                            quantities[product.sku]
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-sm text-[#64766a]">
                    Merchandise subtotal
                  </span>

                  <span className="text-xl font-semibold tabular-nums">
                    {money(subtotalPaise)}
                  </span>
                </div>

                <p className="mt-3 rounded-lg bg-[#f3f6f2] p-3 text-xs leading-5 text-[#64766a]">
                  Draft preview only. Scheme discounts,
                  taxes and final checkout validation
                  will be added in the ordering milestone.
                </p>
              </>
            )}

            <div className="mt-5 flex items-center gap-2 border-t border-[#edf0ec] pt-4 text-xs text-[#718076]">
              <ArrowRight size={15} />
              Checkout is the next feature.
            </div>
          </aside>
        </div>
      </main>

      {totalCases > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-20 lg:hidden">
          <button
            type="button"
            onClick={() =>
              draftRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-[#176b52] px-5 text-sm font-semibold text-white shadow-lg"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={19} />
              Review {totalCases} cases
            </span>
            <span>{money(subtotalPaise)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
