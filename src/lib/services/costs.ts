import type { ServiceInput } from "@/lib/services/types";

// AI Content Writing pricing — the live credit cost is derived from the
// selected Length. Both the trigger route (balance check) and the shared
// callback (deduction on completion) read from this single source of truth
// so the charged amount can never drift from the quoted amount.
export const AI_CONTENT_TYPES = ["Blog Post", "Social Media Post", "Ad Copy"] as const;
export const AI_CONTENT_TONES = ["Professional", "Casual", "Friendly", "Persuasive"] as const;
export const AI_CONTENT_LENGTHS = ["Short", "Medium", "Long"] as const;

export const AI_CONTENT_COST_BY_LENGTH: Record<
  (typeof AI_CONTENT_LENGTHS)[number],
  number
> = {
  Short: 2,
  Medium: 4,
  Long: 6,
};

// Case-insensitive; returns null for unknown/unusable lengths.
export function getAiContentWritingCost(length: unknown): number | null {
  const key = String(length ?? "").trim().toLowerCase();
  const match = AI_CONTENT_LENGTHS.find((option) => option.toLowerCase() === key);
  return match ? AI_CONTENT_COST_BY_LENGTH[match] : null;
}

// Case-insensitive lookup against an allowed list, preserving the canonical
// casing of the match (used to validate/clean submit payloads).
export function matchChoice<T extends readonly string[]>(
  value: unknown,
  allowed: T
): (typeof allowed)[number] | null {
  const key = String(value ?? "").trim().toLowerCase();
  return allowed.find((option) => option.toLowerCase() === key) ?? null;
}

// Resolve the credit cost of a run from a service's input. Used by the
// callback to deduct the exact same amount that was quoted at submit time:
//   - lead-generation: 1 credit per requested lead (input.leads_count)
//   - ai-content-writing: 2/4/6 credits from input.length
// Returns null when the cost cannot be derived (caller falls back to the
// services.credit_cost column).
export function getServiceCreditCost(input: ServiceInput, serviceKey: string): number | null {
  switch (serviceKey) {
    case "lead-generation": {
      const count = Number(input.leads_count);
      return Number.isFinite(count) && count > 0 ? Math.round(count) : null;
    }
    case "ai-content-writing":
      return getAiContentWritingCost(input.length);
    default:
      return null;
  }
}