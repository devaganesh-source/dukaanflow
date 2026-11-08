"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";

import type { Product } from "./retailer-catalog";
import MediaOrderCapture from "./media-order-capture";

type Candidate = {
  sku: string;
  name: string;
  pack: string;
  stock_cases: number;
  match_score: number;
};

type ParsedLine = {
  original_text: string;
  product_text: string;
  quantity_cases: number | null;
  status: "matched" | "needs_review";
  issue: string | null;
  message: string | null;
  selected_sku: string | null;
  candidates: Candidate[];
};

type ParseResult = {
  lines: ParsedLine[];
  has_unresolved_lines: boolean;
  confirmation_required: boolean;
  parser_source: "rules" | "gemini" | "fallback";
};

type ReviewRow = {
  sku: string;
  quantity: string;
  skip: boolean;
};

type Props = {
  retailerId: number;
  products: Product[];
  quantities: Record<string, number>;
  setQuantities: Dispatch<
    SetStateAction<Record<string, number>>
  >;
};

const sourceLabels = {
  rules: "Catalogue parser",
  gemini: "Gemini-assisted suggestions",
  fallback: "Catalogue parser (AI unavailable)",
};

function getErrorMessage(data: unknown): string {
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  return "Unable to analyze this order message.";
}

export default function TextOrderReview({
  retailerId,
  products,
  quantities,
  setQuantities,
}: Props) {
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ParseResult | null>(
    null
  );
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [casesConfirmed, setCasesConfirmed] = useState(false);

  // Each retailer has their own saved text order.
  const storageKey = `dukaanflow:text-order:${retailerId}`;

  // Restore the saved message after a page refresh.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);

        if (saved !== null) {
          // Do not overwrite text typed before restoration.
          setMessage((current) => current || saved);
        }
      } catch {
        // The text-order assistant still works if
        // browser storage is unavailable.
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  const productsBySku = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.sku,
          product,
        ])
      ),
    [products]
  );

  function saveMessage(value: string) {
    setMessage(value);

    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // Continue without persistence if storage fails.
    }
  }

  function clearSavedMessage() {
    setMessage("");

    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Clearing browser storage is best effort.
    }
  }

  function resetReview() {
    setResult(null);
    setRows([]);
    setError("");
    setNotice("");
    setCasesConfirmed(false);
  }

  function updateRow(
    index: number,
    change: Partial<ReviewRow>
  ) {
    setRows((previous) =>
      previous.map((row, currentIndex) =>
        currentIndex === index
          ? { ...row, ...change }
          : row
      )
    );

    setError("");
    setNotice("");
  }

  async function analyze(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy || mediaBusy) return;

    resetReview();

    if (!message.trim()) {
      setError("Enter an order message first.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        "/api/text-orders/parse",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: message,
          }),
        }
      );

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("lines" in data) ||
        !Array.isArray(data.lines)
      ) {
        throw new Error("Invalid parser response.");
      }

      const parsed = data as ParseResult;

      setResult(parsed);

      setRows(
        parsed.lines.map((line) => ({
          sku: line.selected_sku ?? "",
          quantity:
            line.quantity_cases?.toString() ?? "",
          skip: false,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to analyze the order."
      );
    } finally {
      setBusy(false);
    }
  }

  function addToCart() {
    if (!result) return;

    setError("");
    setNotice("");

    const additions = new Map<string, number>();

    let includedLines = 0;

    // Validate every included line before changing the cart.
    for (
      let index = 0;
      index < result.lines.length;
      index++
    ) {
      const line = result.lines[index];
      const row = rows[index];

      if (!row) {
        setError(
          "Review data is incomplete. Analyze the order again."
        );
        return;
      }

      if (row.skip) continue;

      if (line.issue === "multiple_quantities") {
        setError(
          `Line ${index + 1}: Split products with multiple quantities into separate lines and analyze again, or skip this line.`
        );
        return;
      }

      const product = productsBySku.get(row.sku);

      if (!product) {
        setError(
          `Line ${index + 1}: Select a catalogue product.`
        );
        return;
      }

      const quantity = Number(row.quantity);

      if (
        !row.quantity.trim() ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 999
      ) {
        setError(
          `Line ${index + 1}: Enter 1–999 whole cases.`
        );
        return;
      }

      additions.set(
        product.sku,
        (additions.get(product.sku) ?? 0) + quantity
      );

      includedLines++;
    }

    if (includedLines === 0) {
      setError(
        "Select at least one line to add to the cart."
      );
      return;
    }

    // Unrecognized quantities require manual confirmation.
    const needsManualUnitConfirmation =
      result.lines.some(
        (line, index) =>
          line.quantity_cases === null &&
          !rows[index]?.skip
      );

    if (
      needsManualUnitConfirmation &&
      !casesConfirmed
    ) {
      setError(
        "Confirm that you checked the manually entered quantities in cases."
      );
      return;
    }

    // Validate combined quantities including existing cart.
    for (const [sku, quantity] of additions) {
      const product = productsBySku.get(sku);

      if (!product) {
        setError(`Product ${sku} is unavailable.`);
        return;
      }

      const inCart = quantities[sku] ?? 0;
      const total = inCart + quantity;

      if (total > product.stock_cases) {
        setError(
          `${product.name}: ${total} cases requested including your cart, but only ${product.stock_cases} cases are currently listed in stock.`
        );
        return;
      }
    }

    // Update the existing retailer draft.
    setQuantities((previous) => {
      const updated = { ...previous };

      for (const [sku, quantity] of additions) {
        updated[sku] =
          (updated[sku] ?? 0) + quantity;
      }

      return updated;
    });

    const totalCases = Array.from(
      additions.values()
    ).reduce(
      (total, quantity) => total + quantity,
      0
    );

    // Clear saved text only after successful confirmation.
    clearSavedMessage();

    setResult(null);
    setRows([]);
    setCasesConfirmed(false);

    setNotice(
      `Added ${totalCases} cases across ${additions.size} products to your existing cart. Review your cart before checkout.`
    );
  }

  const manualQuantityRequired =
    result?.lines.some(
      (line, index) =>
        line.quantity_cases === null &&
        !rows[index]?.skip
    ) ?? false;

  return (
    <section
      aria-labelledby="text-order-title"
      className="overflow-hidden rounded-2xl border border-[#dbe6dd] bg-white shadow-sm"
    >
      {/* Header */}
      <div className="border-b border-[#e8efe8] bg-[#f7faf6] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#176b52]">
              Faster ordering
            </p>

            <h2
              id="text-order-title"
              className="mt-1 text-xl font-semibold text-[#17372c]"
            >
              Order by message
            </h2>
          </div>

          <span className="rounded-full border border-[#d4e3d7] bg-white px-3 py-1 text-xs font-medium text-[#176b52]">
            AI-assisted
          </span>
        </div>

        <p className="mt-3 text-sm leading-6 text-[#64766a]">
          Type products and quantities in English or
          Hinglish. Review every match before adding
          anything to your cart.
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Message Input */}
        <form
          onSubmit={(event) => void analyze(event)}
          className="space-y-3"
        >
          <label
            htmlFor="text-order-message"
            className="block text-sm font-semibold text-[#17372c]"
          >
            Your order message
          </label>

          <div className="overflow-hidden rounded-2xl border border-[#d7e3d8] bg-white transition focus-within:border-[#176b52] focus-within:ring-2 focus-within:ring-[#176b52]/15">
            <textarea
              id="text-order-message"
              rows={3}
              maxLength={2000}
              disabled={busy || mediaBusy}
              value={message}
              onChange={(event) => {
                saveMessage(event.target.value);
                resetReview();
              }}
              placeholder="Type your order in English or Hinglish?"
              className="block w-full resize-y bg-transparent px-4 py-3 text-sm text-[#17372c] outline-none"
            />
            <div className="flex flex-wrap items-start justify-between gap-2 border-t border-[#e8efe8] px-2 py-2 sm:items-center">
              <MediaOrderCapture
                disabled={busy}
                onBusyChange={setMediaBusy}
                onTranscript={(transcript) => {
                  if (message.trim() && !window.confirm(
                    "Replace your current message with extracted text?"
                  )) return false;

                  saveMessage(transcript);
                  resetReview();
                  setNotice("Check extracted text and quantities, then select Analyze order.");
                  return true;
                }}
              />

              <button
                type="submit"
                disabled={busy || mediaBusy || !message.trim() || products.length === 0}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#176b52] px-4 text-sm font-semibold text-white transition hover:bg-[#10543e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Analyzing?" : "Analyze order"}
              </button>
            </div>
          </div>

          <p className="text-xs leading-5 text-[#64766a]">
            Type, attach a handwritten photo or record a Hindi voice note.
            Media is sent to Google Gemini for transcription, then
            returned as editable text. Check quantities before analyzing;
            nothing is ordered automatically. Up to 15 order lines.
          </p>
        </form>

        {/* Error */}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Success */}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-[#cce2d1] bg-[#eef7ef] p-4 text-sm text-[#176b52]"
          >
            {notice}
          </p>
        )}

        {/* Review Results */}
        {result && (
          <div className="space-y-5 border-t border-[#e8efe8] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#17372c]">
                  Review extracted items
                </h3>

                <p className="mt-1 text-sm text-[#64766a]">
                  {result.lines.length} lines detected.
                  Choose the correct products and cases.
                </p>
              </div>

              <span className="rounded-full bg-[#eef4ef] px-3 py-1.5 text-xs font-medium text-[#386f50]">
                {sourceLabels[result.parser_source] ??
                  "Catalogue parser"}
              </span>
            </div>

            {result.lines.map((line, index) => {
              const row = rows[index];

              if (!row) return null;

              const selectedProduct =
                productsBySku.get(row.sku);

              return (
                <article
                  key={index}
                  className={`rounded-xl border p-4 sm:p-5 ${
                    row.skip
                      ? "border-[#e4e8e4] bg-[#f8f9f8] opacity-70"
                      : "border-[#dfe9e0] bg-white"
                  }`}
                >
                  {/* Original Text and Status */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#64766a]">
                        Line {index + 1}
                      </p>

                      <p className="mt-2 text-sm font-medium text-[#17372c]">
                        “{line.original_text}”
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        line.status === "matched"
                          ? "bg-[#e9f5ec] text-[#176b52]"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {line.status === "matched"
                        ? "Auto-matched"
                        : "Needs review"}
                    </span>
                  </div>

                  {/* Warning */}
                  {line.message && (
                    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      {line.message}
                    </p>
                  )}

                  {/* Suggested Products */}
                  {line.candidates.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-[#64766a]">
                        Suggested matches
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {line.candidates.map(
                          (candidate) => (
                            <button
                              key={candidate.sku}
                              type="button"
                              disabled={row.skip}
                              onClick={() =>
                                updateRow(index, {
                                  sku: candidate.sku,
                                })
                              }
                              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                                row.sku === candidate.sku
                                  ? "border-[#176b52] bg-[#eef7ef] text-[#176b52]"
                                  : "border-[#dce5dc] bg-white text-[#405748] hover:border-[#176b52]"
                              }`}
                            >
                              <span className="block font-medium">
                                {candidate.name} ·{" "}
                                {candidate.pack}
                              </span>

                              <span className="mt-1 block opacity-75">
                                {candidate.sku} ·{" "}
                                {candidate.match_score}%
                                match score
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Product and Quantity */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
                    <div>
                      <label
                        htmlFor={`text-order-sku-${index}`}
                        className="mb-2 block text-xs font-semibold text-[#64766a]"
                      >
                        Catalogue product
                      </label>

                      <select
                        id={`text-order-sku-${index}`}
                        value={row.sku}
                        disabled={row.skip}
                        onChange={(event) =>
                          updateRow(index, {
                            sku: event.target.value,
                          })
                        }
                        className="min-h-11 w-full rounded-xl border border-[#d7e3d8] bg-white px-3 text-sm text-[#17372c]"
                      >
                        <option value="">
                          Select a product
                        </option>

                        {products.map((product) => (
                          <option
                            key={product.sku}
                            value={product.sku}
                          >
                            {product.name} —{" "}
                            {product.pack} ({product.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`text-order-quantity-${index}`}
                        className="mb-2 block text-xs font-semibold text-[#64766a]"
                      >
                        Quantity (cases)
                      </label>

                      <input
                        id={`text-order-quantity-${index}`}
                        type="number"
                        min="1"
                        max="999"
                        step="1"
                        value={row.quantity}
                        disabled={row.skip}
                        onChange={(event) =>
                          updateRow(index, {
                            quantity: event.target.value,
                          })
                        }
                        placeholder="Cases"
                        className="min-h-11 w-full rounded-xl border border-[#d7e3d8] bg-white px-3 text-sm text-[#17372c]"
                      />
                    </div>
                  </div>

                  {/* Stock Information */}
                  {selectedProduct && !row.skip && (
                    <p className="mt-3 text-xs text-[#64766a]">
                      Selected SKU:{" "}
                      <span className="font-medium text-[#17372c]">
                        {selectedProduct.sku}
                      </span>
                      {" · "}
                      Listed stock:{" "}
                      {selectedProduct.stock_cases} cases
                      {" · "}
                      Already in cart:{" "}
                      {quantities[selectedProduct.sku] ??
                        0}{" "}
                      cases
                    </p>
                  )}

                  {/* Skip Line */}
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-[#64766a]">
                    <input
                      type="checkbox"
                      checked={row.skip}
                      onChange={(event) =>
                        updateRow(index, {
                          skip: event.target.checked,
                        })
                      }
                      className="size-4 accent-[#176b52]"
                    />
                    Skip this line
                  </label>
                </article>
              );
            })}

            {/* Manual Case Confirmation */}
            {manualQuantityRequired && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={casesConfirmed}
                  onChange={(event) =>
                    setCasesConfirmed(
                      event.target.checked
                    )
                  }
                  className="mt-1 size-4 accent-[#176b52]"
                />

                <span>
                  I checked the manually entered
                  quantities and confirm they are
                  <strong> cases</strong>, not
                  individual packets or pieces.
                </span>
              </label>
            )}

            {/* Final Confirmation */}
            <div className="rounded-xl bg-[#f7faf6] p-4">
              <p className="text-sm font-semibold text-[#17372c]">
                Confirmation required
              </p>

              <p className="mt-2 text-xs leading-5 text-[#64766a]">
                Nothing has been added yet. Correct any
                uncertain matches or skip them.
                Identical SKUs will be combined.
                Final prices, promotions and stock are
                verified again during checkout.
              </p>

              <button
                type="button"
                onClick={addToCart}
                className="mt-4 min-h-12 w-full rounded-xl bg-[#176b52] px-5 font-semibold text-white transition hover:bg-[#10543e]"
              >
                Confirm reviewed items and add to cart
              </button>
            </div>

            <p className="text-xs text-[#64766a]">
              Match scores indicate text similarity,
              not calibrated AI confidence.
              You control the final product selection.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}