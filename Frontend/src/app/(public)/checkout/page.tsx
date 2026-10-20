"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoMark, muted } from "@/lib/ui";

export default function CheckoutPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planId = params.get("plan");

    if (!planId) {
      router.replace("/pricing");
      return;
    }

    let cancelled = false;

    async function createCheckout() {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setError(data.error || "Something went wrong.");
          return;
        }

        if (data.url) {
          window.location.href = data.url;
        } else {
          setError("Could not start checkout. Please try again.");
        }
      } catch {
        if (!cancelled) {
          setError("Failed to reach the payment server. Please try again.");
        }
      }
    }

    createCheckout();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl bg-white/90 p-10 text-center shadow-[0_24px_48px_-24px_rgba(15,42,74,0.2)] ring-1 ring-navy/[0.05] backdrop-blur">
        <span className={logoMark}>a</span>

        {error ? (
          <>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
              Checkout error
            </h1>
            <p className={`mt-3 text-sm leading-relaxed ${muted}`}>{error}</p>
            <Link
              href="/pricing"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep"
            >
              Back to Pricing
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
              Preparing your checkout
            </h1>
            <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
              Taking you to Stripe&rsquo;s secure payment page&hellip;
            </p>
            <div
              className="mx-auto mt-8 size-8 animate-spin rounded-full border-2 border-accent/20 border-t-accent"
              aria-hidden
            />
          </>
        )}
      </div>
    </div>
  );
}