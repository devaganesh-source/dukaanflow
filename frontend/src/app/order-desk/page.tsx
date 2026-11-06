
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  PackageCheck,
  Store,
  Users,
} from "lucide-react";

import LogoutButton from "@/components/logout-button";
import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

import { connection } from "next/server";

type Retailer = {
  id: number;
  name: string;
};

type RetailersResponse = {
  retailers: Retailer[];
};

function WorkspaceUnavailable() {
  return (
    <main
      role="alert"
      className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6 text-center"
    >
      <div>
        <h1 className="text-xl font-semibold">
          Workspace unavailable
        </h1>
        <p className="mt-3 text-sm text-[#64766a]">
          Could not load the order desk. Please try again.
        </p>
      </div>
    </main>
  );
}

async function OrderDeskContent() {
  await connection();

  const session = await readSession();

  if (session.status === "guest") {
    redirect("/login");
  }

  if (session.status === "unavailable") {
    return <WorkspaceUnavailable />;
  }

  if (session.user.role !== "order_desk") {
    redirect("/");
  }

  let retailers: Retailer[] | null = null;
  let status = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/retailers`,
      {
        headers: sessionHeaders(session.token),
        cache: "no-store",
      }
    );

    status = response.status;

    if (response.ok) {
      const data =
        (await response.json()) as RetailersResponse;

      if (Array.isArray(data.retailers)) {
        retailers = data.retailers;
      }
    }
  } catch {
    // Display the unavailable state below.
  }

  if (status === 401) {
    redirect("/login");
  }

  if (!retailers) {
    return <WorkspaceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#112b25]">
      <header className="border-b border-[#e1e8e1] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#176b52] p-2.5 text-white">
              <PackageCheck size={22} />
            </div>

            <div>
              <p className="font-semibold">DukaanFlow</p>
              <p className="text-xs text-[#64766a]">
                Order desk
              </p>
            </div>
          </div>

          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <p className="text-sm text-[#64766a]">
            Welcome, {session.user.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Order desk
          </h1>
          <p className="mt-3 text-sm text-[#64766a]">
            Manage authorized retailer operations.
          </p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e1e8e1] bg-white p-6">
            <div className="mb-4 inline-flex rounded-xl bg-[#edf5ef] p-3 text-[#176b52]">
              <Users size={22} />
            </div>

            <p className="text-sm text-[#64766a]">
              Active retailer accounts
            </p>

            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {retailers.length}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e1e8e1] bg-white p-6">
            <div className="mb-4 inline-flex rounded-xl bg-[#edf5ef] p-3 text-[#176b52]">
              <ClipboardList size={22} />
            </div>

            <p className="text-sm font-semibold">
              Order processing
            </p>

            <p className="mt-2 text-sm leading-6 text-[#64766a]">
              The order queue and Tally export will be
              available after checkout integration.
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[#e1e8e1] bg-white">
          <div className="border-b border-[#e1e8e1] p-5">
            <div className="flex items-center gap-3">
              <Store size={20} className="text-[#176b52]" />
              <div>
                <h2 className="font-semibold">
                  Retailer accounts
                </h2>
                <p className="mt-1 text-xs text-[#64766a]">
                  Active accounts available to the order desk
                </p>
              </div>
            </div>
          </div>

          {retailers.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">
                No retailer accounts available
              </p>
              <p className="mt-2 text-sm text-[#64766a]">
                Accounts will appear here when added.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf0ec]">
              {retailers.map((retailer) => (
                <div
                  key={retailer.id}
                  className="flex items-center justify-between gap-3 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[#f1f6f1] p-2 text-[#176b52]">
                      <Store size={18} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold">
                        {retailer.name}
                      </p>
                      <p className="mt-1 text-xs text-[#718076]">
                        Retailer ID: {retailer.id}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-[#edf5ef] px-3 py-1 text-xs font-medium text-[#176b52]">
                    Active
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function OrderDeskPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[#64766a]">
          Loading order desk...
        </div>
      }
    >
      <OrderDeskContent />
    </Suspense>
  );
}
