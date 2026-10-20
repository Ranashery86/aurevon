"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { logoMark, muted } from "@/lib/ui";

type Plan = {
  id: string;
  name: string;
  price: number;
  monthly_credits: number;
};

function queryPlanId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("plan");
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [preSelectedPlanId] = useState<string | null>(() => queryPlanId());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    preSelectedPlanId
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price, monthly_credits")
        .order("price");

      if (cancelled) return;

      if (error) {
        setPlansError(error.message);
        return;
      }

      setPlans(data ?? []);
      // Default to the free Trial plan unless a plan was passed in the URL.
      setSelectedPlanId((current) => {
        if (current) return current;
        const trial = (data ?? []).find(
          (plan: Plan) => Number(plan.price) === 0
        );
        return trial ? trial.id : null;
      });
    }

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );
  const isPaidSelection = Boolean(
    selectedPlan && Number(selectedPlan.price) > 0
  );
  const plansReady = plans.length > 0 || plansError !== null;

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone, plan_id: selectedPlanId },
      },
    });

    if (error) {
      setError(error.message);
      setStatus("idle");
      return;
    }

    // Paid plan selected → send the user to Stripe Checkout. The plan and
    // credits are only granted after Stripe confirms the payment via webhook.
    if (isPaidSelection) {
      if (!data.session) {
        setStatus("success");
        return;
      }
      router.replace(
        `/checkout?plan=${encodeURIComponent(selectedPlanId as string)}`
      );
      return;
    }

    // Trial plan (or no plan selected) → initialize the free trial.
    if (!data.session) {
      setStatus("success");
      return;
    }

    try {
      const res = await fetch("/api/subscription/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlanId ?? null }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        console.error("[signup] trial init failed:", error);
      }
    } catch (err) {
      console.error("[signup] subscription init failed:", err);
    }

    router.replace("/dashboard");
  }

  const inputClasses =
    "w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50";

  if (status === "success") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-3xl bg-white/90 p-10 text-center shadow-[0_24px_48px_-24px_rgba(15,42,74,0.2)] ring-1 ring-navy/[0.05] backdrop-blur">
          <span className={logoMark}>a</span>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
            Check your email
          </h1>
          {isPaidSelection ? (
            <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
              We sent a confirmation link to <strong>{email}</strong>. Confirm
              your account, log in, and then complete your{" "}
              <strong>{selectedPlan?.name}</strong> checkout to activate your
              plan and credits.
            </p>
          ) : (
            <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
              We sent a confirmation link to <strong>{email}</strong>. Confirm
              your account, then log in to start using {site.name}.
            </p>
          )}
          <Link
            href="/login"
            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep"
          >
            Log in
          </Link>
          {isPaidSelection && selectedPlanId && (
            <p className="mt-4">
              <Link
                href={`/checkout?plan=${encodeURIComponent(selectedPlanId)}`}
                className="text-sm font-semibold text-accent-deep hover:text-navy"
              >
                I&apos;ve confirmed my email — go to checkout
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl bg-white/90 p-10 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.2)] ring-1 ring-navy/[0.05] backdrop-blur">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className={logoMark}>a</span>
            <span className="text-lg font-bold tracking-tight text-navy">
              {site.name}
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
            Create your account
          </h1>
          <p className={`mt-2 text-sm ${muted}`}>
            {preSelectedPlanId
              ? "Almost there — finish your details below."
              : "Choose a plan, then add your details below."}
          </p>
        </div>

        {/* Plan selection step */}
        {preSelectedPlanId ? (
          <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl bg-accent/10 px-4 py-3 ring-1 ring-accent/20">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-navy">
                Selected plan
              </p>
              <p className="mt-0.5 text-sm font-bold text-navy">
                {selectedPlan ? (
                  <>
                    {selectedPlan.name} —{" "}
                    {Number(selectedPlan.price) === 0
                      ? "Free"
                      : `$${Number(selectedPlan.price)}/month`}
                  </>
                ) : (
                  "Loading…"
                )}
              </p>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist"
            >
              Change
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-wider text-navy">
              Choose a plan
            </p>

            {plansError ? (
              <p className="mt-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                Couldn&apos;t load plans ({plansError}). Creating a free Trial
                account instead.
              </p>
            ) : plans.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">Loading plans…</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {plans.map((plan) => {
                  const active = plan.id === selectedPlanId;
                  const isFree = Number(plan.price) === 0;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      aria-pressed={active}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
                        active
                          ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                          : "border-navy/10 bg-white hover:border-accent/40 hover:bg-mist/40"
                      }`}
                    >
                      <span className="block text-sm font-bold text-navy">
                        {plan.name}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-navy/80">
                        {isFree ? "Free" : `$${Number(plan.price)}/month`}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {plan.monthly_credits} credits / month
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSignup} className="mt-8 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={status === "loading"}
              placeholder="Your name"
              className={inputClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === "loading"}
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={status === "loading"}
              autoComplete="tel"
              placeholder="+92 300 1234567"
              className={inputClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={status === "loading"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={inputClasses}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !plansReady}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Creating account…" : "Create account"}
          </button>

          {isPaidSelection && (
            <p className={`text-center text-xs ${muted}`}>
              {selectedPlan?.name} costs ${Number(selectedPlan?.price)}/month.
              You&apos;ll pay securely via Stripe after creating your account.
            </p>
          )}
        </form>

        <p className={`mt-6 text-center text-sm ${muted}`}>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent-deep hover:text-navy">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}