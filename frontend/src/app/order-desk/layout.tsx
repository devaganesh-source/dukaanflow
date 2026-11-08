
import Link from "next/link";
import type { ReactNode } from "react";

export default function OrderDeskLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-[#e1e8e1] bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-base font-bold text-[#17372c]">
              DukaanFlow
            </p>

            <p className="text-xs text-[#64766a]">
              Distributor workspace
            </p>
          </div>

          <nav
            aria-label="Order desk navigation"
            className="flex items-center gap-2"
          >
            <Link
              href="/order-desk"
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-[#176b52] hover:bg-[#edf5ef]"
            >
              Retailers
            </Link>

            <Link
              href="/order-desk/loading-list"
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-[#176b52] hover:bg-[#edf5ef]"
            >
              Van loading
            </Link>

            <Link
              href="/order-desk/orders"
              className="inline-flex min-h-11 items-center rounded-xl bg-[#176b52] px-4 text-sm font-semibold text-white hover:bg-[#12543f]"
            >
              Orders
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </>
  );
}
