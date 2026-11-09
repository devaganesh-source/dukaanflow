
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Store, Users, Clock3 } from "lucide-react";

import LogoutButton from "@/components/logout-button";
import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type Retailer = {
  id: number;
  name: string;
};

type InactiveRetailer = {
  id: number;
  name: string;
  last_order_at: number | null;
  days_since_last_order: number | null;
};

type ActivityResponse = {
  as_of: number;
  threshold_days: number;
  total_active_retailers: number;
  inactive_count: number;
  retailers: InactiveRetailer[];
};

function Unavailable() {
  return (
    <main
      role="alert"
      className="min-h-screen bg-[#f7f8f4] p-8 text-center"
    >
      <h1 className="text-xl font-semibold">
        Order desk unavailable
      </h1>

      <p className="mt-3 text-sm text-[#64766a]">
        Please retry when the backend is available.
      </p>
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
    return <Unavailable />;
  }

  if (session.user.role !== "order_desk") {
    redirect("/");
  }

  const headers = sessionHeaders(session.token);

  let retailers: Retailer[] | null = null;
  let activity: ActivityResponse | null = null;
  let retailerStatus = 503;
  let activityStatus = 503;

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/retailers`,
      {
        headers,
        cache: "no-store",
      }
    );

    retailerStatus = response.status;

    if (response.ok) {
      const data = (await response.json()) as {
        retailers?: Retailer[];
      };

      if (Array.isArray(data.retailers)) {
        retailers = data.retailers;
      }
    }
  } catch {
    // Show an unavailable state below.
  }

  try {
    const response = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/inactive-retailers`,
      {
        headers,
        cache: "no-store",
      }
    );

    activityStatus = response.status;

    if (response.ok) {
      const data =
        (await response.json()) as ActivityResponse;

      if (Array.isArray(data.retailers)) {
        activity = data;
      }
    }
  } catch {
    // Keep order desk usable if activity data fails.
  }

  if (
    retailerStatus === 401 ||
    activityStatus === 401
  ) {
    redirect("/login");
  }

  if (!retailers) {
    return <Unavailable />;
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#17372c] sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#64766a]">
              Welcome, {session.user.name}
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Retailer activity
            </h1>

            <p className="mt-2 text-sm text-[#64766a]">
              Identify shops that may need a follow-up
              order visit.
            </p>
          </div>

          <LogoutButton />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e1e8e1] bg-white p-5">
            <Users
              size={22}
              className="text-[#176b52]"
            />

            <p className="mt-4 text-sm text-[#64766a]">
              Active retailer accounts
            </p>

            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {retailers.length}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-5">
            <Clock3
              size={22}
              className="text-amber-700"
            />

            <p className="mt-4 text-sm text-[#64766a]">
              No order in 14 days
            </p>

            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {activity
                ? activity.inactive_count
                : "—"}
            </p>
          </div>

        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-[#e1e8e1] bg-white">
          <div className="border-b border-[#e1e8e1] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Clock3
                size={22}
                className="text-amber-700"
              />

              <div>
                <h2 className="text-lg font-semibold">
                  Retailers needing follow-up
                </h2>

                <p className="mt-1 text-sm text-[#64766a]">
                  No order in the last 14 days, or no previous order.
                </p>
              </div>
            </div>
          </div>

          {!activity ? (
            <div
              role="status"
              className="p-7 text-sm text-[#64766a]"
            >
              Activity data could not be loaded.
              Other order-desk actions remain available.
            </div>
          ) : activity.retailers.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-semibold">
                All active retailers have ordered recently
              </p>

              <p className="mt-2 text-sm text-[#64766a]">
                No inactive retailers are currently recorded.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf0ec]">
              {activity.retailers.map((retailer) => (
                <article
                  key={retailer.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#f1f6f1] p-3 text-[#176b52]">
                      <Store size={19} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold">
                        {retailer.name}
                      </p>

                      <p className="mt-1 text-xs text-[#64766a]">
                        {retailer.last_order_at === null
                          ? "No orders recorded"
                          : `Last ordered ${new Date(
                              retailer.last_order_at * 1000
                            ).toLocaleDateString(
                              "en-IN",
                              {
                                timeZone: "Asia/Kolkata",
                                dateStyle: "medium",
                              }
                            )}`}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {retailer.days_since_last_order === null
                      ? "Never ordered"
                      : `${retailer.days_since_last_order} days ago`}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-[#e1e8e1] bg-white">
          <div className="border-b border-[#e1e8e1] p-5 sm:px-6">
            <h2 className="font-semibold">
              Retailer accounts
            </h2>

            <p className="mt-1 text-sm text-[#64766a]">
              Registered active shops in this demo.
            </p>
          </div>

          {retailers.length === 0 ? (
            <p className="p-7 text-sm text-[#64766a]">
              No active retailer accounts.
            </p>
          ) : (
            <div className="divide-y divide-[#edf0ec]">
              {retailers.map((retailer) => (
                <div
                  key={retailer.id}
                  className="flex justify-between gap-3 px-5 py-4 sm:px-6"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {retailer.name}
                    </p>

                    <p className="mt-1 text-xs text-[#64766a]">
                      Retailer ID: {retailer.id}
                    </p>
                  </div>

                  <span className="text-xs font-medium text-[#176b52]">
                    Active
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function OrderDeskPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          Loading order desk...
        </main>
      }
    >
      <OrderDeskContent />
    </Suspense>
  );
}
