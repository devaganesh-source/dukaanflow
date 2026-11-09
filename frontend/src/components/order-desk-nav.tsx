"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pages = [
  { href: "/order-desk", label: "Retailers" },
  { href: "/order-desk/orders", label: "Orders" },
  { href: "/order-desk/loading-list", label: "Van loading" },
] as const;

export default function OrderDeskNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Distributor navigation" className="min-w-0 max-w-full overflow-x-auto">
      <div className="flex w-max items-center gap-1 rounded-xl bg-[#f3f7f2] p-1">
        {pages.map(({ href, label }) => {
          const active = href === "/order-desk"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b52] focus-visible:ring-offset-2 ${
                active
                  ? "bg-[#176b52] text-white"
                  : "text-[#176b52] hover:bg-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
