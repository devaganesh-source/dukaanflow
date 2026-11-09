import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import SalesmanWorkspace from "@/components/salesman-workspace";
import type { SalesmanShop, SalesmanSnapshot } from "@/lib/salesman-offline-store";
import { BACKEND_ORIGIN, sessionHeaders } from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type AssignedShopsResponse = { shops: { id: number; name: string }[] };
type CatalogueResponse = {
  products: SalesmanShop["products"];
};

async function loadSnapshot(token: string, salesmanId: number): Promise<SalesmanSnapshot | null> {
  const headers = sessionHeaders(token);

  try {
    const shopsResponse = await fetch(`${BACKEND_ORIGIN}/api/salesman/retailers`, {
      headers,
      cache: "no-store",
    });

    if (!shopsResponse.ok) return null;
    const data = (await shopsResponse.json()) as AssignedShopsResponse;
    if (!Array.isArray(data.shops)) return null;

    const shops = await Promise.all(
      data.shops.map(async (shop): Promise<SalesmanShop> => {
        const response = await fetch(
          `${BACKEND_ORIGIN}/api/salesman/retailers/${shop.id}/catalogue`,
          { headers, cache: "no-store" }
        );
        if (!response.ok) throw new Error("Catalogue unavailable");
        const catalogue = (await response.json()) as CatalogueResponse;
        if (!Array.isArray(catalogue.products)) throw new Error("Invalid catalogue");
        return { id: shop.id, name: shop.name, products: catalogue.products };
      })
    );

    return { salesmanId, fetchedAt: Date.now(), shops };
  } catch {
    return null;
  }
}

async function SalesmanContent() {
  await connection();
  const session = await readSession();

  if (session.status === "guest") redirect("/login");
  if (session.status === "unavailable") {
    return <main role="alert" className="p-8">Authentication unavailable. Reconnect and retry.</main>;
  }
  if (session.user.role !== "salesman") redirect("/");

  const snapshot = await loadSnapshot(session.token, session.user.id);

  return (
    <SalesmanWorkspace
      salesmanId={session.user.id}
      salesmanName={session.user.name}
      liveSnapshot={snapshot}
    />
  );
}

export default function SalesmanPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading salesman workspace...</main>}>
      <SalesmanContent />
    </Suspense>
  );
}
