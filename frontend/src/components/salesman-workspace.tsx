"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import LogoutButton from "./logout-button";

import {
  clearOfflineSalesmanData,
  getOfflineSnapshot,
  listOfflineDrafts,
  prepareOfflineSnapshot,
  removeOfflineDraft,
  saveOfflineDraft,
  type SalesmanDraft,
  type SalesmanSnapshot,
} from "@/lib/salesman-offline-store";

type Props = {
  salesmanId: number;
  salesmanName: string;
  liveSnapshot: SalesmanSnapshot | null;
};

type ServerOrder = {
  id: number;
  retailer_id: number;
  status: string;
  total_paise: number;
  items: { product_sku: string; paid_cases: number; free_cases: number }[];
};

type SyncReceipt = {
  orderId: number;
  retailerName: string;
  status: string;
  totalPaise: number;
  freeCases: number;
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

function errorMessage(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "detail" in value &&
    typeof value.detail === "string"
  ) {
    return value.detail;
  }
  return fallback;
}

function isExpectedReceipt(value: unknown, draft: SalesmanDraft): value is ServerOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<ServerOrder>;
  if (
    !Number.isSafeInteger(order.id) ||
    (order.id ?? 0) <= 0 ||
    order.retailer_id !== draft.retailerId ||
    typeof order.status !== "string" ||
    !Number.isSafeInteger(order.total_paise) ||
    !Array.isArray(order.items)
  ) return false;

  const actual = new Map<string, number>();
  for (const item of order.items) {
    if (
      !item ||
      typeof item.product_sku !== "string" ||
      !Number.isSafeInteger(item.paid_cases) ||
      actual.has(item.product_sku) ||
      !Number.isSafeInteger(item.free_cases) ||
      item.free_cases < 0
    ) return false;
    actual.set(item.product_sku, item.paid_cases);
  }
  return (
    actual.size === draft.items.length &&
    draft.items.every((item) => actual.get(item.sku) === item.quantity_cases)
  );
}

export default function SalesmanWorkspace({
  salesmanId,
  salesmanName,
  liveSnapshot,
}: Props) {
  const [online, setOnline] = useState(true);
  const [snapshot, setSnapshot] = useState<SalesmanSnapshot | null>(liveSnapshot);
  const [prepared, setPrepared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<SalesmanDraft[]>([]);
  const [working, setWorking] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SyncReceipt | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refreshNetwork = () => setOnline(navigator.onLine);
    refreshNetwork();
    window.addEventListener("online", refreshNetwork);
    window.addEventListener("offline", refreshNetwork);

    async function loadLocal() {
      try {
        const [saved, pending] = await Promise.all([
          getOfflineSnapshot(salesmanId),
          listOfflineDrafts(salesmanId),
        ]);
        if (!active) return;
        if (saved) {
          setPrepared(true);
          if (!liveSnapshot) setSnapshot(saved);
        }
        setDrafts(pending);
      } catch {
        if (active) {
          setError("Offline storage is unavailable. Enable browser storage and reload.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadLocal();
    return () => {
      active = false;
      window.removeEventListener("online", refreshNetwork);
      window.removeEventListener("offline", refreshNetwork);
    };
  }, [salesmanId, liveSnapshot]);

  const currentShop = useMemo(
    () => snapshot?.shops.find((shop) => shop.id === selectedShop) ?? null,
    [snapshot, selectedShop]
  );

  function chooseShop(value: number) {
    setSelectedShop(value || null);
    setQuantities({});
    setFeedback("");
    setError("");
  }

  async function prepare() {
    if (!liveSnapshot) {
      setError("Live catalogue unavailable. Reconnect before preparing your device.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      await prepareOfflineSnapshot(liveSnapshot);
      setSnapshot(liveSnapshot);
      setPrepared(true);
      setFeedback("Catalogue saved on this device for offline visits.");
    } catch {
      setError("Could not save catalogue locally. Check storage permissions.");
    } finally {
      setWorking(false);
    }
  }

  async function saveDraft() {
    if (!currentShop) return;
    const items = currentShop.products.flatMap((product) => {
      const raw = quantities[product.sku]?.trim() ?? "";
      if (!raw) return [];
      return [{ sku: product.sku, quantity_cases: Number(raw) }];
    });
    if (
      !items.length ||
      items.length > 50 ||
      items.some(
        (item) =>
          !Number.isSafeInteger(item.quantity_cases) ||
          item.quantity_cases < 1 ||
          item.quantity_cases > 1000
      )
    ) {
      setError("Select 1–50 products. Quantities must be whole paid cases from 1 to 1000.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const draft: SalesmanDraft = {
        id: crypto.randomUUID(),
        salesmanId,
        retailerId: currentShop.id,
        retailerName: currentShop.name,
        createdAt: Date.now(),
        items,
      };
      await saveOfflineDraft(draft);
      setDrafts(await listOfflineDrafts(salesmanId));
      setQuantities({});
      setFeedback(`Local draft saved for ${currentShop.name}. No order was submitted.`);
    } catch {
      setError("Could not save draft. Check available device storage.");
    } finally {
      setWorking(false);
    }
  }

  async function syncDraft(draft: SalesmanDraft) {
    if (working || syncingId) return;
    if (!navigator.onLine) {
      setError("You're offline. Reconnect before syncing; the draft is safe on this device.");
      return;
    }

    const confirmed = window.confirm(
      `Sync ${draft.items.length} product line(s) for ${draft.retailerName}? ` +
        "The server will recheck assignment, stock, current prices and schemes, " +
        "reserve stock if accepted, and place the order ON HOLD for distributor review."
    );
    if (!confirmed) return;

    setWorking(true);
    setSyncingId(draft.id);
    setReceipt(null);
    setError("");
    setFeedback("");

    try {
      const response = await fetch("/api/salesman/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          draft_id: draft.id, // Never generate a new ID on retry.
          retailer_id: draft.retailerId,
          items: draft.items,
        }),
      });

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("Unknown server response. Keep this draft and retry using the same ID.");
      }

      if (!response.ok) {
        const detail = errorMessage(data, "Sync rejected by the server.");
        if (response.status === 401) {
          throw new Error("Session expired. Sign in while connected, then retry this saved draft.");
        }
        if (response.status === 409) {
          throw new Error(`${detail} Draft retained. Resolve stock or cart conflict before retrying.`);
        }
        throw new Error(`${detail} Draft retained for a safe retry.`);
      }

      if (!isExpectedReceipt(data, draft)) {
        throw new Error("Server confirmation did not match this draft. Draft kept for investigation.");
      }

      const confirmedReceipt: SyncReceipt = {
        orderId: data.id,
        retailerName: draft.retailerName,
        status: data.status,
        totalPaise: data.total_paise,
        freeCases: data.items.reduce((total, line) => total + line.free_cases, 0),
      };
      setReceipt(confirmedReceipt);

      // Only delete a local draft AFTER a verified server confirmation.
      // If deletion fails, retrying its same UUID is idempotent.
      try {
        await removeOfflineDraft(salesmanId, draft.id);
        setDrafts(await listOfflineDrafts(salesmanId));
        setFeedback(`Order #${data.id} accepted. Local draft removed after confirmation.`);
      } catch {
        setError(
          `Order #${data.id} was confirmed by the server, but local cleanup failed. ` +
            "Keep the same draft and retry later; it will not create another order."
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Sync status unknown. Your draft remains available for retry."
      );
    } finally {
      setWorking(false);
      setSyncingId(null);
    }
  }

  async function removeDraft(id: string) {
    if (!window.confirm("Delete this local draft? It may not have reached the server.")) return;
    setWorking(true);
    setError("");
    try {
      await removeOfflineDraft(salesmanId, id);
      setDrafts(await listOfflineDrafts(salesmanId));
      setFeedback("Device draft deleted.");
    } catch {
      setError("Could not delete the local draft.");
    } finally {
      setWorking(false);
    }
  }

  async function clearDeviceData() {
    if (!window.confirm("Permanently erase this salesman's saved catalogue and ALL local drafts?")) return;
    setWorking(true);
    setError("");
    try {
      await clearOfflineSalesmanData(salesmanId);
      setPrepared(false);
      setDrafts([]);
      setSelectedShop(null);
      setQuantities({});
      setFeedback("Device-local data cleared.");
      if (!liveSnapshot) setSnapshot(null);
    } catch {
      setError("Could not clear local data.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-7 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#176b52]">DUKAANFLOW / FIELD SALES</p>
            <h1 className="mt-1 text-3xl font-semibold">Salesman visits</h1>
            <p className="mt-2 text-sm text-[#64766a]">
              {salesmanName} · Capture visit orders, then sync when connected
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              role="status"
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
            >
              {online ? <Wifi size={17} /> : <WifiOff size={17} />}
              {online ? "Browser online" : "Browser offline"}
            </span>
            <LogoutButton />
          </div>
        </header>

        <section className="rounded-2xl border border-[#dce5dd] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">1. Prepare for store visits</h2>
          <p className="mt-2 text-sm leading-6 text-[#64766a]">
            Save your assigned shops and catalogue before going offline.
            Prices and stock are checked again when you sync.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={working || !liveSnapshot} onClick={() => void prepare()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176b52] px-4 text-sm font-semibold text-white disabled:opacity-50">
              <Download size={18} /> Save for offline visits
            </button>
            <span role="status" className="text-sm text-[#64766a]">
              {prepared
                ? "Ready for offline drafting"
                : snapshot
                  ? "Live catalogue loaded — not saved offline"
                  : "No catalogue saved on this device"}
            </span>
          </div>
          {snapshot && (
            <p className="mt-3 text-xs text-[#64766a]">
              Catalogue updated: {new Date(snapshot.fetchedAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })} · {snapshot.shops.length} assigned shops
            </p>
          )}
          <p className="mt-2 text-xs text-amber-800">
            Offline data is currently unencrypted. Use a trusted device and clear data before sharing it.
          </p>
        </section>

        <section className="rounded-2xl border border-[#dce5dd] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">2. Record an order during a visit</h2>
          <p className="mt-2 text-sm text-[#64766a]">
            Choose a shop and enter paid cases. You can save drafts without a connection while this page stays open.
          </p>
          <label htmlFor="visit-shop" className="mt-5 block text-sm font-semibold">Assigned retailer</label>
          <select id="visit-shop" className="mt-2 min-h-12 w-full rounded-xl border border-[#ceddcf] bg-white px-3" value={selectedShop ?? ""} onChange={(event) => chooseShop(Number(event.target.value))} disabled={working || !snapshot || loading}>
            <option value="">Select a shop</option>
            {(snapshot?.shops ?? []).map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </select>
          {!snapshot && (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              No catalogue available. Load this page online and save an offline snapshot first.
            </p>
          )}
          {currentShop && (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-[#64766a]">
                Enter paid cases only. Free promotional cases and prices will be recalculated during sync.
              </p>
              {currentShop.products.map((product) => (
                <div key={product.sku} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e9e2] p-3">
                  <div>
                    <p className="text-sm font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs text-[#64766a]">{product.pack} · {product.sku}</p>
                    <p className="mt-1 text-xs text-[#64766a]">
                      Snapshot price: {money(product.price_paise)} · Snapshot stock: {product.stock_cases} cases
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`qty-${product.sku}`} className="block text-xs font-medium">Paid cases</label>
                    <input id={`qty-${product.sku}`} type="number" min="0" max="1000" step="1" inputMode="numeric" value={quantities[product.sku] ?? ""} onChange={(event) => setQuantities((previous) => ({ ...previous, [product.sku]: event.target.value }))} className="mt-1 h-11 w-24 rounded-lg border border-[#ceddcf] px-3 text-right" disabled={working} placeholder="0" />
                  </div>
                </div>
              ))}
              <button type="button" disabled={working || loading} onClick={() => void saveDraft()} className="min-h-12 w-full rounded-xl bg-[#176b52] px-5 font-semibold text-white disabled:opacity-50">
                Save offline draft
              </button>
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>
        )}
        {feedback && (
          <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-[#176b52]">{feedback}</p>
        )}
        {receipt && (
          <section aria-live="polite" className="rounded-2xl border border-[#bcdcc6] bg-[#eff8f0] p-5">
            <div className="flex items-center gap-2 font-semibold text-[#176b52]">
              <CheckCircle2 size={20} /> Server order #{receipt.orderId} confirmed
            </div>
            <p className="mt-2 text-sm">
              {receipt.retailerName} · Status: <strong>{receipt.status.replaceAll("_", " ")}</strong>
              {" · "}Total: {money(receipt.totalPaise)} · {receipt.freeCases} free cases
            </p>
            <p className="mt-2 text-xs text-[#64766a]">
              Salesman orders require distributor review. No direct export or dispatch is implied.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-[#dce5dd] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-[#176b52]" />
            <h2 className="text-lg font-semibold">3. Pending device drafts ({drafts.length})</h2>
          </div>
          <p className="mt-2 text-sm text-[#64766a]">
            Sync when connected. Unsuccessful attempts keep your draft;
            confirmed orders go on hold for distributor review.
          </p>

          {loading ? (
            <p className="mt-4 text-sm">Loading saved drafts...</p>
          ) : drafts.length === 0 ? (
            <p className="mt-4 text-sm text-[#64766a]">
              No drafts waiting to sync. Select a retailer above to record a visit order.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {drafts.map((draft) => (
                <li key={draft.id} className="rounded-xl border border-[#e2e9e2] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{draft.retailerName}</p>
                      <p className="mt-1 text-xs text-[#64766a]">
                        {new Date(draft.createdAt).toLocaleString("en-IN")} · {draft.items.length} products
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={working || loading || !online}
                        onClick={() => void syncDraft(draft)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#176b52] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw size={15} className={syncingId === draft.id ? "animate-spin" : ""} />
                        {syncingId === draft.id ? "Syncing..." : "Sync draft"}
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void removeDraft(draft.id)}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={15} /> Delete draft
                      </button>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {draft.items.map((item) => (
                      <li key={item.sku}>{item.sku}: {item.quantity_cases} paid cases</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button type="button" disabled={working} onClick={() => void clearDeviceData()} className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 disabled:opacity-50">
          Clear offline data
        </button>
      </div>
    </main>
  );
}
