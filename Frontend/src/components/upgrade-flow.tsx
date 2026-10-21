"use client";

import { useMemo, useState } from "react";
import { PlanCards, type Plan } from "@/components/plan-cards";
import { muted } from "@/lib/ui";

type UpgradeFlowProps = {
  plans: Plan[];
  currentPlanId: string | null;
  currentPlanName: string | null;
  email: string;
};

export function UpgradeFlow({
  plans,
  currentPlanId,
  currentPlanName,
  email,
}: UpgradeFlowProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  async function handleContinue() {
    if (!selectedPlan || status === "loading") return;

    setError(null);
    setStatus("loading");

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan.id, flow: "upgrade" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      if (!data.url) {
        setError("Could not start checkout. Please try again.");
        setStatus("idle");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Failed to reach the payment server. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
      {currentPlanName && (
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Your current plan:{" "}
          <span className="text-accent-deep">{currentPlanName}</span>
        </p>
      )}

      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-navy">
        Choose a plan
      </p>

      {plans.length === 0 ? (
        <p className={`mt-3 text-sm ${muted}`}>
          No upgrade plans are available right now.
        </p>
      ) : (
        <PlanCards
          plans={plans}
          selectedPlanId={selectedPlanId}
          onSelect={setSelectedPlanId}
          currentPlanId={currentPlanId}
          isDisabled={(plan) => Number(plan.price) === 0}
        />
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!selectedPlan || status === "loading"}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? (
          <>
            <span
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden
            />
            Taking you to Stripe&hellip;
          </>
        ) : (
          "Continue to payment"
        )}
      </button>

      <p className={`mt-3 text-center text-xs ${muted}`}>
        {selectedPlan
          ? `${selectedPlan.name} — $${Number(selectedPlan.price)}/month for ${selectedPlan.monthly_credits} credits. `
          : "Select a plan to continue. "}
        {email && (
          <>
            Checkout will be created for{" "}
            <strong className="font-semibold text-navy">{email}</strong> — no
            need to enter your details again.
          </>
        )}
      </p>
    </section>
  );
}
