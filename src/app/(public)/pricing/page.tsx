import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Pricing",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const params = await searchParams;
  const paymentCancelled = params.payment === "cancelled";

  const supabase = await createClient();

  // QUERY 1: select("id, name, price, monthly_credits") from "plans", ordered by price
  // QUERY 2: select("id, name") from "services", filtered by eq("status", "active")
  // Client context: SSR Server Component -> createServerClient (anon key, RLS applied)
  console.log("[pricing] Running queries on plans + services tables...");
  const [plansResult, servicesResult] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price, monthly_credits")
      .order("price"),
    supabase.from("services").select("id, name").eq("status", "active"),
  ]);

  const serializedError = (error: { message: string; code: string; details: string } | null) =>
    error
      ? {
          message: error.message,
          code: error.code,
          details: error.details,
        }
      : null;

  console.log(
    "[pricing] Query result:",
    JSON.stringify({
      plans: { data: plansResult.data, error: serializedError(plansResult.error) },
      services: {
        data: servicesResult.data,
        error: serializedError(servicesResult.error),
      },
    })
  );

  const plans = plansResult.data ?? [];
  const planError = plansResult.error;
  const serviceRows = servicesResult.data ?? [];
  const servicesError = servicesResult.error;

  if (planError) {
    console.error(
      "[pricing] Failed to load plans:",
      planError.message,
      planError.code,
      planError.details
    );
  }
  if (servicesError) {
    console.error(
      "[pricing] Failed to load services:",
      servicesError.message,
      servicesError.code,
      servicesError.details
    );
  }

  if (plans.length === 0 && !planError) {
    console.error(
      "[pricing] plans returned 0 rows with NO error — RLS is likely blocking the anon role (check SELECT policy on public.plans)"
    );
  }
  if (serviceRows.length === 0 && !servicesError) {
    console.error(
      "[pricing] services returned 0 rows with NO error — RLS is likely blocking the anon role (check SELECT policy on public.services)"
    );
  }

  const serviceNames = [...new Set(serviceRows.map((service) => service.name))];
  const includedFallback = ["Website Crawler", "Lead Generation", "AI Content Writing"];
  const included = serviceNames.length > 0 ? serviceNames : includedFallback;

  const proIndex = plans.findIndex((plan) =>
    String(plan.name).toLowerCase().includes("pro")
  );
  const featuredIndex =
    proIndex >= 0 ? proIndex : Math.floor((plans.length - 1) / 2);

  const hasError = Boolean(planError || servicesError);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-2xl text-center" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-500">
          Every paid plan includes monthly credits that work across all our
          services. Start free, upgrade when you&apos;re ready.
        </p>
      </div>

      {/* Trial banner */}
      <div className="mx-auto mt-12 max-w-2xl" data-reveal>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/70 px-6 py-5 ring-1 ring-navy/[0.06] backdrop-blur">
          <div>
            <h2 className="text-base font-bold text-navy">Free Trial</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              $0 — starting credits on signup. Try every tool risk-free.
            </p>
          </div>
          <Link href="/signup" className={btnPrimary}>
            Start Free
          </Link>
        </div>
      </div>

      {/* Payment cancelled banner */}
      {paymentCancelled && (
        <div
          className="mx-auto mt-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl bg-amber-50 px-6 py-4 ring-1 ring-amber-200"
          data-reveal
        >
          <p className="text-sm font-semibold text-amber-800">
            Payment was cancelled — you can try again anytime.
          </p>
          <Link
            href="/pricing"
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
          >
            ×
          </Link>
        </div>
      )}

      {/* Error banner */}
      {hasError && (
        <div
          className="mx-auto mt-8 max-w-3xl rounded-2xl bg-accent/10 px-6 py-4 text-center ring-1 ring-accent/20"
          data-reveal
        >
          <p className="text-sm font-semibold text-accent-deep">
            We couldn&apos;t load the latest plans right now.
          </p>
          {planError && (
            <p className="mt-1 text-sm text-accent-deep">
              Plans error: {planError.message}
              {planError.code ? ` (${planError.code})` : ""}
              {planError.details ? ` — ${planError.details}` : ""}
            </p>
          )}
          {servicesError && (
            <p className="mt-1 text-sm text-accent-deep">
              Services error: {servicesError.message}
              {servicesError.code ? ` (${servicesError.code})` : ""}
              {servicesError.details ? ` — ${servicesError.details}` : ""}
            </p>
          )}
        </div>
      )}

      {/* Paid plans */}
      {plans.length > 0 ? (
        <div
          className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3"
          data-reveal
        >
          {plans.map((plan, index) => {
            const featured = index === featuredIndex;
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-3xl p-8 ${
                  featured
                    ? "bg-gradient-to-br from-accent to-accent-deep text-white shadow-[0_32px_64px_-24px_rgba(255,107,91,0.55)]"
                    : `${card} text-navy`
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">{plan.name}</h2>
                  {featured && (
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                      Most Popular
                    </span>
                  )}
                </div>

                <p className="mt-5 text-4xl font-bold">
                  ${Number(plan.price)}
                  <span
                    className={`ml-1 text-base font-normal ${
                      featured ? "text-white/70" : "text-slate-400"
                    }`}
                  >
                    /month
                  </span>
                </p>
                <p
                  className={`mt-1.5 text-sm ${
                    featured ? "text-white/80" : "text-slate-500"
                  }`}
                >
                  {plan.monthly_credits} monthly credits included
                </p>

                <ul
                  className={`mt-8 space-y-3 text-sm ${
                    featured ? "text-white/90" : "text-slate-600"
                  }`}
                >
                  {included.map((name) => (
                    <li key={name} className="flex items-center gap-2.5">
                      <span
                        className={`flex size-5 items-center justify-center rounded-full text-xs font-bold ${
                          featured ? "bg-white/20 text-white" : "bg-accent/10 text-accent-deep"
                        }`}
                      >
                        ✓
                      </span>
                      {name}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <Link
                    href={`/signup?plan=${plan.id}`}
                    className={`block w-full rounded-full px-6 py-3 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                      featured
                        ? "bg-white text-accent-deep hover:bg-mist"
                        : "bg-navy text-white hover:bg-navy-deep"
                    }`}
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-auto mt-10 max-w-xl rounded-3xl bg-white/70 p-10 text-center ring-1 ring-navy/[0.06]" data-reveal>
          <h2 className="text-xl font-bold text-navy">No data found</h2>
          <p className="mt-2 text-sm text-slate-500">
            The plans table returned no rows. Check the database (RLS
            policies must allow the anon role to read public.plans) and that
            the table is seeded.
          </p>
          <Link href="/signup" className={`${btnPrimary} mt-6`}>
            Start Free
          </Link>
        </div>
      )}

      <div
        className="mx-auto mt-16 max-w-4xl rounded-3xl bg-white/70 p-8 text-center ring-1 ring-navy/[0.06]"
        data-reveal
      >
        <h2 className="text-2xl font-bold tracking-tight text-navy">
          See what you get with each plan
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-slate-500">
          Not sure what to build first? Browse our services to see how your
          monthly credits can be used.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/services" className={btnPrimary}>
            Explore Services
          </Link>
          <Link href="/contact" className={btnSecondary}>
            Ask Us Anything
          </Link>
        </div>
      </div>
    </div>
  );
}