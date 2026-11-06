
"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import type { Product } from "@/components/retailer-catalog";
import { useRetailerDraft } from "@/lib/retailer-draft";

type Props = {
  retailerId: number;
  products: Product[];
};

type SavedAttempt = {
  fingerprint: string;
  key: string;
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

function errorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  return "Unable to place your order. Please try again.";
}

export default function CheckoutReview({
  retailerId,
  products,
}: Props) {
  const [quantities, setQuantities] = useRetailerDraft(
    retailerId,
    products
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const selected = products
    .filter((product) => (quantities[product.sku] ?? 0) > 0)
    .map((product) => ({
      product,
      quantity: quantities[product.sku],
    }));

  const totalPaidCases = selected.reduce(
    (sum, line) => sum + line.quantity,
    0
  );

  const subtotalPaise = selected.reduce(
    (sum, line) =>
      sum + line.quantity * line.product.price_paise,
    0
  );

  function changeQuantity(
    product: Product,
    difference: number
  ) {
    setError("");

    setQuantities((current) => {
      const updated = { ...current };

      const next = Math.max(
        0,
        Math.min(
          product.stock_cases,
          (current[product.sku] ?? 0) + difference
        )
      );

      if (next === 0) {
        delete updated[product.sku];
      } else {
        updated[product.sku] = next;
      }

      return updated;
    });
  }

  async function placeOrder() {
    if (submittingRef.current || selected.length === 0) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    const items = selected
      .map(({ product, quantity }) => ({
        sku: product.sku,
        quantity_cases: quantity,
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku));

    const fingerprint = JSON.stringify(items);

    const storageKey =
      `dukaanflow:checkout-attempt:v1:${retailerId}`;

    try {
      let attempt: SavedAttempt | null = null;

      const saved = sessionStorage.getItem(storageKey);

      if (saved) {
        try {
          attempt = JSON.parse(saved) as SavedAttempt;
        } catch {
          attempt = null;
        }
      }

      // Reuse the key when retrying an identical cart.
      // A changed cart receives a new request key.
      if (
        !attempt ||
        attempt.fingerprint !== fingerprint ||
        typeof attempt.key !== "string"
      ) {
        attempt = {
          fingerprint,
          key: `order-${crypto.randomUUID()}`,
        };

        sessionStorage.setItem(
          storageKey,
          JSON.stringify(attempt)
        );
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          idempotency_key: attempt.key,
          items,
        }),
      });

      const result: unknown = await response
        .json()
        .catch(() => null);

      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(errorMessage(result));
      }

      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "number" ||
        !Number.isSafeInteger(result.id) ||
        result.id <= 0
      ) {
        throw new Error(
          "Order response was invalid. Retry with the same cart."
        );
      }

      // Clear the local draft only after confirmation.
      setQuantities({});
      sessionStorage.removeItem(storageKey);

      window.location.replace(`/orders/${result.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to place order."
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#176b52]"
        >
          ← Back to catalogue
        </Link>

        <div className="mt-4 mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#176b52]">
            DukaanFlow · Retailer ordering
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Review your order
          </h1>

          <p className="mt-2 text-sm text-[#64766a]">
            Check your cases before submitting.
            Final schemes and stock are verified by
            the distributor&apos;s server.
          </p>
        </div>

        {selected.length === 0 ? (
          <section className="rounded-2xl border border-[#e1e8e1] bg-white p-8 text-center">
            <h2 className="text-lg font-semibold">
              Your cart is empty
            </h2>

            <p className="mt-2 text-sm text-[#64766a]">
              Add products from the catalogue to
              prepare your order.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#176b52] px-6 font-medium text-white"
            >
              Browse products
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="space-y-3">
              {selected.map(({ product, quantity }) => (
                <article
                  key={product.sku}
                  className="rounded-2xl border border-[#e1e8e1] bg-white p-5"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <p className="text-xs text-[#64766a]">
                        {product.category} · {product.sku}
                      </p>

                      <h2 className="mt-1 font-semibold">
                        {product.name}
                      </h2>

                      <p className="mt-1 text-sm text-[#64766a]">
                        {product.pack}
                      </p>

                      {product.scheme && (
                        <p className="mt-3 inline-block rounded-lg bg-[#edf5ef] px-3 py-2 text-xs font-medium text-[#176b52]">
                          Available scheme: {product.scheme}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">
                        {money(product.price_paise)}
                      </p>

                      <p className="text-xs text-[#64766a]">
                        Per case · excl. GST
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0ec] pt-4">
                    <div className="flex items-center overflow-hidden rounded-xl border border-[#dce5dc]">
                      <button
                        type="button"
                        aria-label={`Remove one case of ${product.name}`}
                        disabled={submitting}
                        onClick={() =>
                          changeQuantity(product, -1)
                        }
                        className="min-h-12 min-w-12 font-semibold disabled:opacity-40"
                      >
                        −
                      </button>

                      <span className="min-w-12 text-center text-sm font-semibold">
                        {quantity}
                      </span>

                      <button
                        type="button"
                        aria-label={`Add one case of ${product.name}`}
                        disabled={
                          submitting ||
                          quantity >= product.stock_cases
                        }
                        onClick={() =>
                          changeQuantity(product, 1)
                        }
                        className="min-h-12 min-w-12 font-semibold disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-[#64766a]">
                        Before scheme discount
                      </p>

                      <p className="font-semibold">
                        {money(
                          product.price_paise * quantity
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="self-start rounded-2xl border border-[#e1e8e1] bg-white p-6 lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold">
                Order summary
              </h2>

              <div className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#64766a]">
                    Products
                  </span>
                  <span>{selected.length}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#64766a]">
                    Paid cases
                  </span>
                  <span>{totalPaidCases}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#64766a]">
                    Subtotal before schemes
                  </span>
                  <span className="font-medium">
                    {money(subtotalPaise)}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-[#f3f7f2] p-4 text-xs leading-5 text-[#536b5c]">
                Free cases and scheme discounts are
                calculated by the server when you place
                the order. The amount shown above is
                not the final discounted total.
              </div>

              <p className="mt-4 text-xs leading-5 text-[#64766a]">
                GST is excluded and is not calculated
                separately in this demo.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() => void placeOrder()}
                disabled={submitting}
                className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#176b52] px-5 font-semibold text-white hover:bg-[#12543f] disabled:opacity-60"
              >
                {submitting
                  ? "Placing order..."
                  : "Confirm and place order"}
              </button>

              <p className="mt-3 text-center text-xs leading-5 text-[#64766a]">
                No online payment is collected.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
