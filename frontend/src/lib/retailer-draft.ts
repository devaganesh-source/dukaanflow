
"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type SetStateAction,
} from "react";

type ProductStock = {
  sku: string;
  stock_cases: number;
};

type Quantities = Record<string, number>;

const CHANGE_EVENT = "dukaanflow:draft-changed";
const EMPTY_DRAFT = "{}";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

function restoreQuantities(
  snapshot: string,
  products: ProductStock[]
): Quantities {
  let saved: unknown;

  try {
    saved = JSON.parse(snapshot);
  } catch {
    return {};
  }

  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return {};
  }

  const stored = saved as Record<string, unknown>;
  const restored: Quantities = {};

  for (const product of products) {
    const quantity = stored[product.sku];

    if (
      typeof quantity === "number" &&
      Number.isSafeInteger(quantity) &&
      quantity > 0 &&
      product.stock_cases > 0
    ) {
      restored[product.sku] = Math.min(
        quantity,
        product.stock_cases
      );
    }
  }

  return restored;
}

export function useRetailerDraft(
  retailerId: number,
  products: ProductStock[]
) {
  const key = `dukaanflow:draft:v1:${retailerId}`;

  const getSnapshot = useCallback(
    () => readStorage(key),
    [key]
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_DRAFT
  );

  const storedQuantities = useMemo(
    () => restoreQuantities(snapshot, products),
    [snapshot, products]
  );

  // Fallback when browser storage is unavailable.
  const [memoryDraft, setMemoryDraft] =
    useState<Quantities | null>(null);

  const quantities = memoryDraft ?? storedQuantities;

  const setQuantities = useCallback(
    (action: SetStateAction<Quantities>) => {
      const updated =
        typeof action === "function"
          ? action(quantities)
          : action;

      try {
        localStorage.setItem(key, JSON.stringify(updated));
        setMemoryDraft(null);
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch {
        setMemoryDraft(updated);
      }
    },
    [key, quantities]
  );

  return [quantities, setQuantities] as const;
}
