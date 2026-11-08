
"use client";

import { useRouter } from "next/navigation";
import { Repeat2 } from "lucide-react";

import { useRetailerDraft } from "@/lib/retailer-draft";

type SavedItem = {
  product_sku: string;
  product_name: string;
  paid_cases: number;
};

type AvailableProduct = {
  sku: string;
  name: string;
  stock_cases: number;
};

type Props = {
  retailerId: number;
  orderId: number;
  items: SavedItem[];
  products: AvailableProduct[];
};

export default function RepeatOrderButton({
  retailerId,
  orderId,
  items,
  products,
}: Props) {
  const router = useRouter();

  const [quantities, setQuantities] = useRetailerDraft(
    retailerId,
    products
  );

  const availableBySku = new Map(
    products.map((product) => [product.sku, product])
  );

  const repeated: Record<string, number> = {};
  const warnings: string[] = [];

  for (const item of items) {
    const product = availableBySku.get(item.product_sku);

    if (!product || product.stock_cases < 1) {
      warnings.push(
        `${item.product_name}: currently unavailable`
      );
      continue;
    }

    const cases = Math.min(
      item.paid_cases,
      product.stock_cases
    );

    if (cases < item.paid_cases) {
      warnings.push(
        `${item.product_name}: reduced from ${item.paid_cases} to ${cases} paid cases due to stock`
      );
    }

    if (cases > 0) {
      repeated[item.product_sku] = cases;
    }
  }

  const lineCount = Object.keys(repeated).length;

  const totalCases = Object.values(repeated).reduce(
    (sum, count) => sum + count,
    0
  );

  function repeatOrder() {
    if (!lineCount) return;

    const hasExistingDraft = Object.values(
      quantities
    ).some((count) => count > 0);

    const confirmed = window.confirm(
      hasExistingDraft
        ? `Replace your current cart with ${totalCases} paid cases from order #${orderId}? Prices, schemes and stock will be rechecked at checkout.`
        : `Create a new cart with ${totalCases} paid cases from order #${orderId}? Prices, schemes and stock will be rechecked at checkout.`
    );

    if (!confirmed) return;

    // Never reuse previous free goods, historical prices
    // or the previous order's idempotency key.
    setQuantities(repeated);

    router.push("/#order-draft");
  }

  return (
    <section className="mt-8 rounded-2xl border border-[#d3e5d6] bg-[#f4faf5] p-5">
      <div className="flex items-center gap-2 text-[#176b52]">
        <Repeat2 size={20} />
        <h2 className="text-lg font-semibold">
          Repeat this order
        </h2>
      </div>

      <p className="mt-2 text-sm leading-6 text-[#53685b]">
        Start a new cart using the paid quantities from
        this order. Promotional free cases are not copied.
        Current prices, stock and schemes are checked
        again at checkout.
      </p>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Changes from the original order
          </p>

          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>

          <p className="mt-2">
            Review these changes before confirming.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={lineCount === 0}
        onClick={repeatOrder}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-5 font-semibold text-white hover:bg-[#12543f] disabled:cursor-not-allowed disabled:bg-[#b3beb5]"
      >
        <Repeat2 size={18} />

        {lineCount === 0
          ? "No items available to repeat"
          : `Create new cart · ${totalCases} cases`}
      </button>

      <p className="mt-3 text-xs text-[#64766a]">
        Repeating an order replaces your current draft
        after confirmation; it never submits an order
        automatically.
      </p>
    </section>
  );
}
