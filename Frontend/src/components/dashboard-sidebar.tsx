"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { logoMark } from "@/lib/ui";

type Service = {
  id: string;
  name: string;
  key: string;
};

const fixedLinks = [
  { label: "Dashboard Home", href: "/dashboard" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Credits & Billing", href: "/dashboard/credits" },
  { label: "Settings", href: "/dashboard/settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardSidebar({ services }: { services: Service[] }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-navy/[0.06] bg-white/80 backdrop-blur">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <span className={logoMark}>a</span>
        <Link href="/" className="text-lg font-bold tracking-tight text-navy">
          aurevon
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {fixedLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`block rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
              isActive(pathname, link.href)
                ? "bg-accent text-white shadow-md shadow-accent/30"
                : "text-navy hover:bg-mist"
            }`}
          >
            {link.label}
          </Link>
        ))}

        {services.length > 0 && (
          <>
            <div className="my-3 border-t border-navy/[0.06]" />
            <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              Services
            </p>
            {services.map((service) => {
              const href = `/dashboard/${service.key}`;
              return (
                <Link
                  key={service.id}
                  href={href}
                  className={`block rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isActive(pathname, href)
                      ? "bg-accent text-white shadow-md shadow-accent/30"
                      : "text-navy hover:bg-mist"
                  }`}
                >
                  {service.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-navy/[0.06] p-4">
        <LogoutButton />
      </div>
    </aside>
  );
}