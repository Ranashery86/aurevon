import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UpgradeFlow } from "@/components/upgrade-flow";
import type { Plan } from "@/components/plan-cards";

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { cancelled } = await searchParams;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const userId = claims.claims.sub as string;

  const [plansResult, subResult, authResult] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price, monthly_credits")
      .order("price"),
    supabase
      .from("subscriptions")
      .select("plan_id, plans(id, name, price, monthly_credits)")
      .eq("uuid", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const plans = (plansResult.data ?? []) as Plan[];
  const plansError = plansResult.error;
  const currentPlan = (subResult.data?.plans ?? null) as Plan | null;
  const email = authResult.data.user?.email ?? "";

  // Trial is not an upgrade target once the user is on a paid plan.
  const currentIsPaid = currentPlan ? Number(currentPlan.price) > 0 : false;
  const visiblePlans = plans.filter(
    (plan) => !(currentIsPaid && Number(plan.price) === 0)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          Upgrade plan
        </h1>
        <p className="mt-1 text-slate-500">
          Choose a plan and pay securely via Stripe. Your details stay on file
          — nothing to re-enter.
        </p>
      </div>

      {cancelled === "1" && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-amber-50 px-6 py-4 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Payment cancelled — no charge was made and your plan is unchanged.
            You can try again anytime.
          </p>
          <Link
            href="/dashboard/upgrade"
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
          >
            ×
          </Link>
        </div>
      )}

      {plansError ? (
        <div className="rounded-2xl bg-red-50 px-6 py-4 ring-1 ring-red-100">
          <p className="text-sm font-semibold text-red-600">
            Couldn&apos;t load plans ({plansError.message}). Please try again
            later.
          </p>
        </div>
      ) : (
        <UpgradeFlow
          plans={visiblePlans}
          currentPlanId={currentPlan?.id ?? null}
          currentPlanName={currentPlan?.name ?? null}
          email={email}
        />
      )}
    </div>
  );
}
