import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserCreditBalance } from "@/lib/services/workflow";
import { deductCredits } from "@/lib/credits";
import {
  DOMAIN_MONITOR_CHARGED_ACTION,
  DOMAIN_MONITOR_CHECK_ALL_COOLDOWN_MS,
  DOMAIN_MONITOR_ACTIONS,
  DOMAIN_MONITOR_MAX_NOTIFY_EMAILS,
  DOMAIN_MONITOR_MIN_CREDITS_CHECK,
  DOMAIN_MONITOR_RATE_LIMIT_MAX_REQUESTS,
  DOMAIN_MONITOR_RATE_LIMIT_WINDOW_MS,
  DOMAIN_MONITOR_SERVICE_KEY,
  DOMAIN_MONITOR_SERVICE_NAME,
  DOMAIN_MONITOR_TIMEOUT_MS,
  extractUniqueDomains,
  getDomainLimitForPlan,
  isDomainMonitorAction,
} from "@/lib/services/domain-monitor";

// The Domain Monitor is a request/response tool, not an async workflow: every
// action returns data the page renders immediately, so this route proxies the
// call synchronously instead of using triggerServiceWorkflow() (which fires a
// webhook and bills on a later callback). Billing is handled inline below,
// using the same helpers the async services use: getUserCreditBalance() for the
// balance and deductCredits() for the charge.

type Json = Record<string, unknown>;

type ServiceRow = {
  name: string;
  status: string;
  credit_cost: number;
  webhook_url: string | null;
};

type RateState = { timestamps: number[] };
type CheckAllState = { last: number };

// In-memory per-process abuse protection. This is intentionally simple and
// matches the single-instance deploy model: it bounds a runaway client (or a
// script hammering one account) without adding a database round-trip to every
// request. A multi-instance/serverless deployment would move these two Maps
// into Redis or a rate-limit table.
const rateBuckets = new Map<string, RateState>();
const checkAllTimestamps = new Map<string, CheckAllState>();

function fail(error: string, status: number, code?: string) {
  return Response.json(
    code ? { success: false, code, error } : { success: false, error },
    { status }
  );
}

function withinRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - DOMAIN_MONITOR_RATE_LIMIT_WINDOW_MS;

  const state = rateBuckets.get(userId) ?? { timestamps: [] };
  state.timestamps = state.timestamps.filter((entry) => entry > cutoff);

  if (state.timestamps.length >= DOMAIN_MONITOR_RATE_LIMIT_MAX_REQUESTS) {
    rateBuckets.set(userId, state);
    return false;
  }

  state.timestamps.push(now);
  rateBuckets.set(userId, state);
  return true;
}

function allowCheckAll(userId: string): boolean {
  const now = Date.now();
  const previous = checkAllTimestamps.get(userId)?.last ?? 0;

  if (now - previous < DOMAIN_MONITOR_CHECK_ALL_COOLDOWN_MS) return false;

  checkAllTimestamps.set(userId, { last: now });
  return true;
}

async function readService(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("services")
    .select("name, status, credit_cost, webhook_url")
    .eq("key", DOMAIN_MONITOR_SERVICE_KEY)
    .maybeSingle();

  if (error || !data) return null;
  return data as ServiceRow;
}

async function readPlanName(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("plan_id, plans(name)")
    .eq("uuid", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;

  const plan = (data as { plans?: { name?: string } | null }).plans;
  return plan?.name ?? null;
}

async function readProfileEmail(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("profile")
    .select("email")
    .eq("uuid", userId)
    .maybeSingle();

  if (error || !data) return null;

  const email = (data as { email?: string | null }).email;
  return email && email.trim() ? email.trim() : null;
}

function readNotifyEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const emails: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;

    const email = entry.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;

    seen.add(email);
    emails.push(email);
  }

  return emails;
}

async function callWorkflow(
  webhookUrl: string,
  token: string,
  body: Json
): Promise<{ status: number; data: Json }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOMAIN_MONITOR_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as Json | null;

    return {
      status: response.status,
      data: data ?? { success: false, error: "The workflow returned an unreadable response." },
    };
  } catch (error) {
    // Never surface a stack trace, the webhook URL or the secret to the page.
    const aborted =
      error instanceof Error && error.name === "AbortError";

    console.error(
      `[domain-monitor] workflow call failed (${aborted ? "timeout" : "network"}):`,
      (error as { message?: string }).message ?? error
    );

    return {
      status: aborted ? 504 : 502,
      data: {
        success: false,
        error: aborted
          ? "The domain monitor took too long to respond. Please try again."
          : "The domain monitor could not be reached. Please try again in a moment.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return fail("Please log in", 401);
  }

  // The owner is taken from the verified session only — never from the body.
  const userId = claims.claims.sub as string;

  if (!withinRateLimit(userId)) {
    return fail(
      "Too many requests. Please wait a moment and try again.",
      429
    );
  }

  const payload = (await request.json().catch(() => null)) as Json | null;

  if (!payload || typeof payload !== "object") {
    return fail("Invalid request body.", 400);
  }

  const action = payload.action;

  if (!isDomainMonitorAction(action)) {
    return fail(
      `"action" must be one of: ${DOMAIN_MONITOR_ACTIONS.join(", ")}.`,
      400
    );
  }

  const admin = createAdminClient();
  const service = await readService(admin);

  if (!service || service.status !== "active") {
    return fail("Service unavailable", 503);
  }

  const webhookUrl = service.webhook_url?.trim() ?? "";

  if (!webhookUrl) {
    console.error(
      `[domain-monitor] services row "${DOMAIN_MONITOR_SERVICE_KEY}" has no webhook_url. ` +
        `Set services.webhook_url in Supabase — no redeploy needed. Value is NOT logged.`
    );
    return fail("Service unavailable", 503);
  }

  const token = process.env.DOMAIN_MONITOR_TOKEN;

  if (!token) {
    console.error(
      `[domain-monitor] env var "DOMAIN_MONITOR_TOKEN" is not set. Configure it in ` +
        `Vercel and redeploy. Value is NOT logged.`
    );
    return fail("Service unavailable", 503);
  }

  // The sender address for alert emails is configured once inside the workflow.
  // Users never control it, so the key is stripped from anything they send and
  // from anything the workflow hands back.
  const forward: Json = { ...payload, owner: userId };
  delete forward.from_email;

  if (action === "save_settings") {
    if (Array.isArray(forward.notify_emails)) {
      const emails = readNotifyEmails(forward.notify_emails);

      if (emails.length > DOMAIN_MONITOR_MAX_NOTIFY_EMAILS) {
        return fail(
          `Maximum ${DOMAIN_MONITOR_MAX_NOTIFY_EMAILS} notification emails`,
          400
        );
      }

      forward.notify_emails = emails;
    }
  }

  if (action === "check" && forward.all === true) {
    if (!allowCheckAll(userId)) {
      return fail("Please wait before checking all again", 429);
    }
  }

  if (action === "get_settings") {
    const result = await callWorkflow(webhookUrl, token, forward);
    const incoming = result.data.settings;
    const settings: Json | null =
      incoming && typeof incoming === "object" ? { ...(incoming as Json) } : null;

    if (settings) {
      delete settings.from_email;

      const next = Array.isArray(settings.notify_emails)
        ? (settings.notify_emails as unknown[])
        : [];

      // Pre-fill the account's own address the first time settings are opened,
      // so the user is not staring at an empty recipient list.
      if (next.length === 0) {
        const email = await readProfileEmail(admin, userId);
        if (email) settings.notify_emails = [email];
      }
    }

    return Response.json({ ...result.data, settings }, { status: result.status });
  }

  if (action === "add") {
    return handleAdd({
      admin,
      userId,
      service,
      webhookUrl,
      token,
      forward,
    });
  }

  const result = await callWorkflow(webhookUrl, token, forward);

  // "list" carries the plan cap so the page can render "12 / 25 domains"
  // without a second request.
  if (action === "list") {
    const planName = await readPlanName(admin, userId);
    const balance = await getUserCreditBalance(userId);

    return Response.json(
      {
        ...result.data,
        plan_limit: getDomainLimitForPlan(planName),
        credits: { charged: 0, balance },
      },
      { status: result.status }
    );
  }

  return Response.json(result.data, { status: result.status });
}

async function handleAdd({
  admin,
  userId,
  service,
  webhookUrl,
  token,
  forward,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  service: ServiceRow;
  webhookUrl: string;
  token: string;
  forward: Json;
}) {
  const creditCost = Math.max(0, Number(service.credit_cost ?? 0));
  const requested = extractUniqueDomains({
    bulk_text: forward.bulk_text,
    domains: forward.domains,
  });

  // (a) Plan cap: ask the workflow how many domains the user already tracks.
  // page_size 1 keeps this a metadata-only call.
  const planName = await readPlanName(admin, userId);
  const limit = getDomainLimitForPlan(planName);

  const current = await callWorkflow(webhookUrl, token, {
    action: "list",
    owner: userId,
    page: 1,
    page_size: 1,
  });

  const tracked = Number(
    (current.data.pagination as Json | undefined)?.total_items ?? 0
  );

  if (Number.isFinite(tracked) && tracked + requested.length > limit) {
    return fail(`Your plan allows ${limit} domains`, 403, "domain_limit_reached");
  }

  // (b) Balance gate, re-checked server-side. The button state in the page is
  // never trusted on its own.
  const balance = await getUserCreditBalance(userId);
  const required = Math.max(creditCost, DOMAIN_MONITOR_MIN_CREDITS_CHECK);

  if (balance < required) {
    return fail("Not enough credits", 402, "insufficient_credits");
  }

  // (c) Add. If the workflow fails or adds nothing, nothing is charged.
  const result = await callWorkflow(webhookUrl, token, forward);

  if (result.status >= 400) {
    return Response.json(result.data, { status: result.status });
  }

  const added = Array.isArray(result.data.added)
    ? ((result.data.added as unknown[]) ?? [])
      .map((entry) =>
        typeof entry === "string" ? entry : String((entry as Json)?.domain ?? "")
      )
      .filter(Boolean)
    : [];

  if (added.length === 0) {
    return Response.json(
      { ...result.data, credits: { charged: 0, balance } },
      { status: result.status }
    );
  }

  const charge = creditCost * added.length;

  // (d) Charge exactly for what was added. Dedupes and invalid inputs are free.
  if (charge > 0) {
    try {
      await deductCredits(userId, charge, DOMAIN_MONITOR_SERVICE_KEY, "deduction");
    } catch (error) {
      // (e) The domains exist upstream but we could not bill for them. Undo
      // the add so the user is never given something they did not pay for.
      console.error(
        `[domain-monitor] deduction failed for ${added.length} domain(s):`,
        (error as { message?: string }).message ?? error
      );

      try {
        await callWorkflow(webhookUrl, token, {
          action: "delete",
          owner: userId,
          domains: added,
        });
      } catch (rollbackError) {
        console.error(
          `[domain-monitor] rollback delete failed for ${added.length} domain(s):`,
          (rollbackError as { message?: string }).message ?? rollbackError
        );
      }

      return fail(
        "We could not complete the credit deduction, so the domains were removed again. Please try once more.",
        500
      );
    }
  }

  const newBalance = balance - charge;

  // (f) One row per paid add. Read-only and free actions are not logged.
  const { error: logError } = await admin.from("service_requests").insert({
    uuid: userId,
    service_name: service.name || DOMAIN_MONITOR_SERVICE_NAME,
    service_key: DOMAIN_MONITOR_SERVICE_KEY,
    status: "completed",
    input: { action: DOMAIN_MONITOR_CHARGED_ACTION, domains: added },
    output: result.data,
  });

  if (logError) {
    console.error("[domain-monitor] service_requests insert failed:", logError.message);
  }

  return Response.json(
    {
      ...result.data,
      plan_limit: limit,
      credits: { charged: charge, balance: newBalance },
    },
    { status: result.status }
  );
}
