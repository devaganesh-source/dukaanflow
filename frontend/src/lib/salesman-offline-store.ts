// Device-local drafts and catalogue snapshots. Never store auth tokens here.
// Data is not encrypted: use only on a trusted device until offline PIN protection is added.

export type SalesmanProduct = {
  sku: string;
  name: string;
  category: string;
  pack: string;
  price_paise: number;
  stock_cases: number;
  scheme: string | null;
};

export type SalesmanShop = {
  id: number;
  name: string;
  products: SalesmanProduct[];
};

export type SalesmanSnapshot = {
  salesmanId: number;
  fetchedAt: number;
  shops: SalesmanShop[];
};

export type SalesmanDraft = {
  id: string;
  salesmanId: number;
  retailerId: number;
  retailerName: string;
  createdAt: number;
  items: { sku: string; quantity_cases: number }[];
};

const DB_NAME = "dukaanflow-salesman-offline";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("snapshots")) {
        db.createObjectStore("snapshots", { keyPath: "salesmanId" });
      }

      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", { keyPath: "id" });
        drafts.createIndex("bySalesman", "salesmanId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline database unavailable"));
    request.onblocked = () => reject(new Error("Close other DukaanFlow tabs and retry"));
  });
}

function waitFor<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage failed"));
  });
}

function waitForCommit(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage aborted"));
  });
}

export async function getOfflineSnapshot(salesmanId: number): Promise<SalesmanSnapshot | null> {
  const db = await openDatabase();
  try {
    const request = db.transaction("snapshots", "readonly").objectStore("snapshots").get(salesmanId);
    const value = await waitFor<SalesmanSnapshot | undefined>(request);
    return value ?? null;
  } finally {
    db.close();
  }
}

export async function prepareOfflineSnapshot(snapshot: SalesmanSnapshot): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction("snapshots", "readwrite");
    const completion = waitForCommit(tx);
    tx.objectStore("snapshots").put(snapshot);
    await completion;
  } finally {
    db.close();
  }
}

export async function listOfflineDrafts(salesmanId: number): Promise<SalesmanDraft[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").index("bySalesman").getAll(salesmanId);
    const drafts = await waitFor<SalesmanDraft[]>(request);
    return drafts.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function saveOfflineDraft(draft: SalesmanDraft): Promise<void> {
  if (draft.items.length === 0 || draft.items.length > 50) {
    throw new Error("Draft must have between 1 and 50 items");
  }

  const skus = draft.items.map((item) => item.sku);
  if (
    new Set(skus).size !== skus.length ||
    draft.items.some((item) => !Number.isInteger(item.quantity_cases) || item.quantity_cases < 1 || item.quantity_cases > 1000)
  ) {
    throw new Error("Draft quantities must be whole cases between 1 and 1000");
  }

  const db = await openDatabase();
  try {
    const tx = db.transaction("drafts", "readwrite");
    const completion = waitForCommit(tx);
    tx.objectStore("drafts").put(draft);
    await completion;
  } finally {
    db.close();
  }
}

export async function removeOfflineDraft(salesmanId: number, id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const completion = waitForCommit(tx);
    const draft = await waitFor<SalesmanDraft | undefined>(store.get(id));
    if (draft && draft.salesmanId === salesmanId) store.delete(id);
    await completion;
  } finally {
    db.close();
  }
}

export async function clearOfflineSalesmanData(salesmanId: number): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(["snapshots", "drafts"], "readwrite");
    const completion = waitForCommit(tx);
    tx.objectStore("snapshots").delete(salesmanId);

    const cursorRequest = tx.objectStore("drafts").index("bySalesman").openKeyCursor(salesmanId);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        tx.objectStore("drafts").delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    await completion;
  } finally {
    db.close();
  }
}
