"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/lib/site";
import { logoMark } from "@/lib/ui";

const links = [
  { label: "Services", href: "/services" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function PublicNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => pathname === href;

  const linkClass = (href: string) =>
    `relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-accent after:transition-transform after:duration-300 hover:after:scale-x-100 ${
      isActive(href)
        ? "font-semibold text-navy after:scale-x-100"
        : "text-slate-600 hover:text-navy"
    }`;

  return (
    <header className="nav-anim sticky top-4 z-20 px-4">
      <div className="mx-auto w-full max-w-6xl">
        <nav
          className={`flex items-center justify-between gap-4 rounded-full py-3 pl-5 pr-3 ring-1 ring-navy/[0.06] backdrop-blur transition-all duration-300 ${
            scrolled
              ? "bg-white/90 shadow-[0_20px_40px_-20px_rgba(15,42,74,0.3)]"
              : "bg-white/60 shadow-[0_12px_28px_-20px_rgba(15,42,74,0.18)]"
          }`}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <span className={logoMark}>a</span>
            <span className="text-lg font-bold tracking-tight text-navy">
              {site.name}
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-2 text-sm font-semibold md:flex">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-navy transition-colors hover:bg-mist"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-accent px-5 py-2 text-white shadow-md shadow-accent/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-deep"
            >
              Sign up
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            className="group flex size-10 flex-col items-center justify-center gap-1.5 rounded-full ring-1 ring-navy/[0.08] md:hidden"
          >
            <span
              className={`h-0.5 w-5 rounded-full bg-navy transition-all duration-300 ${
                menuOpen ? "translate-y-1 rotate-45" : ""
              }`}
            />
            <span
              className={`h-0.5 w-5 rounded-full bg-navy transition-all duration-300 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`h-0.5 w-5 rounded-full bg-navy transition-all duration-300 ${
                menuOpen ? "-translate-y-1 -rotate-45" : ""
              }`}
            />
          </button>
        </nav>

        <div
          className={`overflow-hidden transition-all duration-300 md:hidden ${
            menuOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="rounded-3xl bg-white/95 p-4 shadow-[0_20px_40px_-20px_rgba(15,42,74,0.3)] ring-1 ring-navy/[0.06] backdrop-blur">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? "bg-accent/10 font-semibold text-accent-deep"
                      : "text-navy hover:bg-mist"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-navy/[0.06] pt-3 text-sm font-semibold">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-white px-4 py-2.5 text-center text-navy ring-1 ring-navy/10"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-accent px-4 py-2.5 text-center text-white shadow-md shadow-accent/30"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}