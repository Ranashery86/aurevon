"use client";

export type Plan = {
  id: string;
  name: string;
  price: number;
  monthly_credits: number;
};

type PlanCardsProps = {
  plans: Plan[];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  currentPlanId?: string | null;
  isDisabled?: (plan: Plan) => boolean;
};

export function PlanCards({
  plans,
  selectedPlanId,
  onSelect,
  currentPlanId = null,
  isDisabled,
}: PlanCardsProps) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {plans.map((plan) => {
        const active = plan.id === selectedPlanId;
        const isCurrent = currentPlanId !== null && plan.id === currentPlanId;
        const isFree = Number(plan.price) === 0;
        const disabled = isCurrent || (isDisabled?.(plan) ?? false);
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            aria-pressed={active}
            aria-disabled={disabled}
            disabled={disabled}
            className={`rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
              disabled
                ? "cursor-not-allowed border-navy/10 bg-white opacity-60"
                : active
                  ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                  : "border-navy/10 bg-white hover:border-accent/40 hover:bg-mist/40"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="block text-sm font-bold text-navy">
                {plan.name}
              </span>
              {isCurrent && (
                <span className="shrink-0 rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Current
                </span>
              )}
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
  );
}
