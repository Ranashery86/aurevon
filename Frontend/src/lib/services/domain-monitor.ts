// Single source of truth for every Domain Monitor number: the service key, the
// action allowlist, per-plan domain caps, the "check all" cooldown, the abuse
// limit and the notification-email cap. Edit these here — nothing else in the
// codebase hard-codes them.
//
// The webhook URL is NOT here: it lives in the services table
// (services.webhook_url for key = domain-monitor) and is read per request, so
// repointing the service is a pure Supabase data change.

export const DOMAIN_MONITOR_SERVICE_KEY = "domain-monitor";

export const DOMAIN_MONITOR_SERVICE_NAME = "Domain Monitor";

// The browser may only ask for these actions. Anything else is rejected with a
// 400 before the request ever reaches the workflow.
export const DOMAIN_MONITOR_ACTIONS = [
  "add",
  "list",
  "details",
  "check",
  "update",
  "delete",
  "alerts",
  "ack_alert",
  "get_settings",
  "save_settings",
  "export_csv",
] as const;

export type DomainMonitorAction = (typeof DOMAIN_MONITOR_ACTIONS)[number];

// Only "add" costs credits, and only for the domains that were really added.
export const DOMAIN_MONITOR_CHARGED_ACTION: DomainMonitorAction = "add";

// How many domains a user may track at once, by plan name. An unknown or
// missing plan falls back to the Trial cap.
export const DOMAIN_MONITOR_PLAN_LIMITS: Record<string, number> = {
  Trial: 15,
  Starter: 50,
  Pro: 150,
  Business: 500,
};

export const DOMAIN_MONITOR_FALLBACK_PLAN = "Trial";

// Minimum balance required to be allowed to attempt an "add": at least one
// credit, or the service's own credit_cost when that is higher.
export const DOMAIN_MONITOR_MIN_CREDITS_CHECK = 1;

// "check" with all:true may be run at most once per this window, per user.
// Single-domain re-checks are free and unlimited.
export const DOMAIN_MONITOR_CHECK_ALL_COOLDOWN_MS = 10 * 60 * 1000;
export const DOMAIN_MONITOR_CHECK_ALL_COOLDOWN_SECONDS = 600;

// Abuse protection for the whole route, per user.
export const DOMAIN_MONITOR_RATE_LIMIT_MAX_REQUESTS = 60;
export const DOMAIN_MONITOR_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Cap on the notification-email list a user may store.
export const DOMAIN_MONITOR_MAX_NOTIFY_EMAILS = 30;

// Timeout for a single workflow call.
export const DOMAIN_MONITOR_TIMEOUT_MS = 30_000;

export function isDomainMonitorAction(value: unknown): value is DomainMonitorAction {
  return (
    typeof value === "string" &&
    (DOMAIN_MONITOR_ACTIONS as readonly string[]).includes(value)
  );
}

export function getDomainLimitForPlan(planName: string | null | undefined): number {
  const key = String(planName ?? "").trim().toLowerCase();

  for (const [name, limit] of Object.entries(DOMAIN_MONITOR_PLAN_LIMITS)) {
    if (name.toLowerCase() === key) return limit;
  }

  return (
    DOMAIN_MONITOR_PLAN_LIMITS[DOMAIN_MONITOR_FALLBACK_PLAN] ??
    DOMAIN_MONITOR_PLAN_LIMITS.Trial
  );
}

// Split a free-text domain list the same way the page's live counter does:
// on whitespace, commas and semicolons. Entries are lower-cased and de-duped so
// the plan-limit check counts unique domains only.
export function extractUniqueDomains(input: {
  bulk_text?: unknown;
  domains?: unknown;
}): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  const add = (value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number") return;

    const trimmed = String(value).trim().toLowerCase();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;

    seen.add(trimmed);
    collected.push(trimmed);
  };

  if (Array.isArray(input.domains)) {
    for (const entry of input.domains) add(entry);
  } else if (typeof input.bulk_text === "string") {
    for (const entry of input.bulk_text.split(/[\s,;]+/)) add(entry);
  }

  return collected;
}
