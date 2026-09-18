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

// ── Website Crawler ──────────────────────────────────────────────
// One URL = one credit; every copy of this logic (client live cost, trigger
// route re-validation, callback deduction) reads from these helpers so the
// charge can never drift from the quoted amount.

export const CRAWL_MIN_URLS = 1;
export const CRAWL_MAX_URLS = 50;

// A cell/line "looks like a URL or domain" when it contains a dot and no
// whitespace. This is the same heuristic used for spreadsheet cells — a
// value alone on a line (e.g. "example.com") always passes.
export function looksLikeUrlOrDomain(value: string): boolean {
  return value.includes(".") && !/\s/.test(value);
}

// Normalize a single candidate into a usable URL, or null when it isn't one.
// Missing protocol gets the https:// prefix; dedupe on the normalized value
// (done by extractUniqueUrls) so "example.com" and "https://example.com"
// collapse to one URL.
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  if (!trimmed || !looksLikeUrlOrDomain(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Normalize + dedupe a list of raw candidates into the final URL list.
// One source of truth shared by the client form and the trigger route.
export function extractUniqueUrls(raw: unknown[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const normalized = normalizeUrl(entry);
    if (normalized !== null && !seen.has(normalized)) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

// Credit cost for a crawl run = number of URLs submitted, clamped to the
// allowed 1–50 range. Returns null when the input isn't a valid URL list
// (caller falls back to services.credit_cost). Also tolerates the urls value
// arriving as a JSON-encoded string (defense in depth — the trigger stores a
// real array, but a future storage layer change must not null out the charge).
export function getWebsiteCrawlerCost(urls: unknown): number | null {
  let list = urls;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const count = list.length;
  if (count < CRAWL_MIN_URLS || count > CRAWL_MAX_URLS) return null;
  return count;
}

// Resolve the credit cost of a run from a service's input. Used by the
// callback to deduct the exact same amount that was quoted at submit time:
//   - lead-generation: 1 credit per requested lead (input.leads_count)
//   - ai-content-writing: 2/4/6 credits from input.length
//   - website-crawler: 1 credit per URL (input.urls), clamped to 1–50
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
    case "website-crawler":
      return getWebsiteCrawlerCost(input.urls);
    default:
      return null;
  }
}