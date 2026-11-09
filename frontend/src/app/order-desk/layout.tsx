
import OrderDeskNav from "@/components/order-desk-nav";
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

          <OrderDeskNav />
        </div>
      </header>

      {children}
    </>
  );
}
