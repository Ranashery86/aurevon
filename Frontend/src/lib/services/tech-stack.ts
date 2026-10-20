// Tech Stack Detector — data contract + payload normalisation.
//
// This module is the single source of truth for the shape n8n must POST to
// /api/services/callback for this service. The callback stores the payload
// untouched (buildCallbackOutput() passes any { results: [...] } straight
// through), so this file is what turns that untrusted JSON into something the
// dashboard can render without crashing on a missing key or a bad value.
//
// The service key uses hyphens, matching the existing convention in the
// services table (website-crawler, lead-generation, ai-content-writing,
// site-health-audit). It drives the dashboard route
// (/dashboard/tech-stack-detector), the trigger route
// (/api/services/tech-stack-detector), the services table row, and the
// credit_transactions.service_key written on deduction — so it is defined
// once here and imported everywhere rather than re-typed as a literal.

export const TECH_STACK_SERVICE_KEY = "tech-stack-detector";

// Fixed display order for the results accordion. Detection may arrive in any
// order (or omit a category entirely) — the UI always renders all 12 rows in
// this order so the user sees full category coverage, not just the hits.
export const TECH_STACK_CATEGORIES = [
  "CMS",
  "JS Framework",
  "Hosting/CDN",
  "Analytics",
  "Tag Manager",
  "E-commerce",
  "Payment",
  "Marketing Automation",
  "Chat Widgets",
  "Fonts",
  "Security/WAF",
  "Server/Infra",
] as const;

export type TechStackCategory = (typeof TECH_STACK_CATEGORIES)[number];

export const TECH_STACK_CONFIDENCE_LEVELS = [
  "High",
  "Medium",
  "Low",
] as const;

export type TechStackConfidence = (typeof TECH_STACK_CONFIDENCE_LEVELS)[number];

export type DetectedTechnology = {
  name: string;
  confidence: TechStackConfidence;
  evidence: string[];
};

export type TechStackDetected = Partial<
  Record<TechStackCategory, DetectedTechnology[]>
>;

export type TechStackSiteStatus = "completed" | "failed";

export type TechStackSiteResult = {
  url: string;
  status: TechStackSiteStatus;
  detected: TechStackDetected;
  total_technologies_found: number;
  categories_scanned: number;
};

// What n8n POSTs back on completion.
export type TechStackCallbackPayload = {
  request_id: string;
  service: typeof TECH_STACK_SERVICE_KEY;
  results: TechStackSiteResult[];
};

// What lands in service_requests.output once the callback is accepted, and
// what the dashboard reads back (the shared { results: Array } envelope).
export type TechStackOutput = {
  results: TechStackSiteResult[];
};

// ── Normalisation ────────────────────────────────────────────────
// Everything below coerces an arbitrary JSON value into the contract types.
// Rules: never throw, never invent a detection, and drop anything malformed.

function toConfidence(value: unknown): TechStackConfidence | null {
  const text = String(value ?? "").trim().toLowerCase();
  const match = TECH_STACK_CONFIDENCE_LEVELS.find(
    (level) => level.toLowerCase() === text
  );
  return match ?? null;
}

function toEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    if (entry == null) continue;
    const text = String(entry).trim();
    if (text) items.push(text);
  }
  return items;
}

function toTechnologies(value: unknown): DetectedTechnology[] {
  if (!Array.isArray(value)) return [];
  const technologies: DetectedTechnology[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    // A detection without a name, or whose confidence isn't one of the three
    // known levels, isn't trustworthy enough to show — skip it rather than
    // render a blank or mis-badged row.
    const confidence = toConfidence(row.confidence);
    if (!name || !confidence) continue;
    technologies.push({ name, confidence, evidence: toEvidence(row.evidence) });
  }
  return technologies;
}

// Only the 12 known categories are kept. A category key n8n invents later
// (or a typo) is dropped so it can't leak into the fixed-order accordion.
function toDetected(value: unknown): TechStackDetected {
  const detected: TechStackDetected = {};
  if (!value || typeof value !== "object") return detected;

  const source = value as Record<string, unknown>;
  for (const category of TECH_STACK_CATEGORIES) {
    const technologies = toTechnologies(source[category]);
    // Store every scanned category (including empty ones) so a category with
    // zero detections is distinguishable from one n8n never reported.
    detected[category] = technologies;
  }
  return detected;
}

function toCount(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
}

function toSiteResult(value: unknown): TechStackSiteResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  const url = String(row.url ?? "").trim();
  if (!url) return null;

  // Only "failed" is treated as a failure: it means the site was unreachable,
  // which the UI renders as its own message rather than a zero-result block.
  const status: TechStackSiteStatus =
    String(row.status ?? "").trim().toLowerCase() === "failed"
      ? "failed"
      : "completed";

  const detected = toDetected(row.detected);

  // The declared totals are authoritative when present, but fall back to what
  // we can actually count so a partial payload still renders a sane header.
  const counted = Object.values(detected).reduce(
    (sum, list) => sum + (list?.length ?? 0),
    0
  );
  const countedCategories = Object.values(detected).filter(
    (list) => (list?.length ?? 0) > 0
  ).length;

  return {
    url,
    status,
    detected,
    total_technologies_found: toCount(row.total_technologies_found, counted),
    categories_scanned: toCount(row.categories_scanned, countedCategories),
  };
}

// Pull the per-URL results array out of a stored service_requests.output.
// Returns [] for anything that isn't the expected envelope so the caller can
// fall back to its empty state.
export function parseTechStackResults(output: unknown): TechStackSiteResult[] {
  if (!output || typeof output !== "object") return [];
  const results = (output as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .map(toSiteResult)
    .filter((row): row is TechStackSiteResult => row !== null);
}

// Detections for one category, always an array (possibly empty) so a
// zero-detection category renders as a grayed, collapsed row.
export function detectionsFor(
  site: TechStackSiteResult,
  category: TechStackCategory
): DetectedTechnology[] {
  return site.detected[category] ?? [];
}
