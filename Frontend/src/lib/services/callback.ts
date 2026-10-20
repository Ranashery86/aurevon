import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWorkflowCallbackUrl,
  N8N_WEBHOOK_AUTH_HEADER,
} from "@/lib/services/config";
import { deductCredits } from "@/lib/credits";
import { getServiceCreditCost } from "@/lib/services/costs";
import type { ServiceInput } from "@/lib/services/types";

export type WorkflowCallbackPayload = {
  request_id: string;
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
};

export type WorkflowCallbackResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// Extract the shared secret from an incoming callback request and compare it
// (n8n sends our N8N_WEBHOOK_AUTH_TOKEN back to prove it's really n8n).
export function authenticateCallback(headers: Headers): {
  authorized: boolean;
  reason?: string;
} {
  const expected = process.env.N8N_WEBHOOK_AUTH_TOKEN;
  const received = headers.get(N8N_WEBHOOK_AUTH_HEADER);

  if (!expected) {
    return { authorized: false, reason: "Webhook secret is not configured." };
  }
  if (!received) {
    return { authorized: false, reason: "Missing webhook auth header." };
  }
  if (received !== expected) {
    return { authorized: false, reason: "Invalid webhook auth token." };
  }
  return { authorized: true };
}

// # of credits to deduct for a completed run.
//
// The amount is derived ONLY from the ORIGINAL request input stored at submit
// time (service_requests.input) via getServiceCreditCost() — it is NEVER
// driven by the shape of the result payload. That keeps deduction correct for
// every service regardless of what its callback result looks like:
//   - lead-generation:    input.leads_count  (1 credit per lead)
//   - ai-content-writing: input.length       (2/4/6)
//   - website-crawler:    input.urls.length  (1 credit per URL, clamped 1–50)
//   - site-health-audit:  input.urls.length × 15 (clamped to 1–10 URLs)
// Fallback: the service's flat services.credit_cost. Returns null ONLY when
// neither source yields a positive amount (which is then logged loudly).
async function getDeductionAmount(
  admin: ReturnType<typeof createAdminClient>,
  input: ServiceInput | null,
  serviceKey: string | null
): Promise<number | null> {
  const storedInput = input ?? {};
  const resolved = serviceKey
    ? (() => {
      console.log(
        `[service-callback][deduction] calling getServiceCreditCost(service_key=${serviceKey}, ` +
          `input=${JSON.stringify(storedInput)})`
      );
      const value = getServiceCreditCost(storedInput, serviceKey);
      console.log(
        `[service-callback][deduction] getServiceCreditCost() returned ${value} ` +
          `for service_key=${serviceKey}, input=${JSON.stringify(storedInput)}`
      );
      return value;
    })()
    : null;

  if (resolved !== null) {
    if (resolved <= 0) {
      console.error(
        `[service-callback][deduction] resolved a non-positive deduction (${resolved}) for ` +
          `${serviceKey} — refusing to deduct.`
      );
      return null;
    }

    console.log(
      `[service-callback][deduction] resolved ${resolved} credit(s) for service_key=${serviceKey} ` +
        `from the ORIGINAL stored input (input=${JSON.stringify(input)}) — ` +
        `result payload shape was NOT consulted.`
    );
    return resolved;
  }

  console.error(
    `[service-callback][deduction] getServiceCreditCost returned null for service_key=` +
      `${serviceKey} (input=${JSON.stringify(input)}) — falling back to ` +
      `services.credit_cost.`
  );

  const { data, error: fallbackError } = await admin
    .from("services")
    .select("credit_cost")
    .eq("key", serviceKey ?? "")
    .maybeSingle();

  if (fallbackError) {
    console.error(
      `[service-callback][deduction] services.credit_cost lookup FAILED for service_key=` +
        `${serviceKey}:`,
      JSON.stringify({
        message: fallbackError.message,
        code: fallbackError.code,
        details: fallbackError.details,
        hint: fallbackError.hint,
      })
    );
  }

  const fallback = data ? Number(data.credit_cost ?? 0) : 0;

  console.log(
    `[service-callback][deduction] fallback services.credit_cost for service_key=` +
      `${serviceKey} = ${fallback}`
  );

  return fallback > 0 ? fallback : null;
}

// Normalize a callback's result into what gets stored in the
// service_requests.output column. Each service posts a different shape, and
// it's stored as-is so the UI can read it back:
//   - lead-generation:     { leads: [...] }
//   - ai-content-writing:  { content: "<text>" }
//   - website-crawler:     { results: [...] }   (detected explicitly below)
//   - site-health-audit:   { results: [...] }   (one entry per audited URL —
//                         each with status "completed"|"failed", plus the
//                         scores/site_level/... for completed sites)
export function buildCallbackOutput(
  status: "completed" | "failed",
  result: unknown,
  error?: string
): unknown {
  if (status === "failed") {
    return { error: error ?? "Workflow failed" };
  }

  // A shared callback payload — match by shape and store untouched.
  if (result && typeof result === "object") {
    const candidate = result as Record<string, unknown>;

    // website-crawler + site-health-audit: n8n posts { results: Array } —
    // keep it untouched so the dashboard can render output.results directly
    // (crawler rows as { url, emails, phones, ... }, audit rows as
    // { url, status, scores, site_level, ... }).
    if (Array.isArray(candidate.results)) {
      return result;
    }
  }

  return result ?? null;
}

// Shared n8n callback handling, used by /api/services/callback for every
// service: look up the request row -> deduct credits on a successful run
// (never on failure) BEFORE marking the request complete. If the deduction
// fails, the request stays 'processing' and the callback returns HTTP 500 so
// n8n sees the failure and can retry — an uncharged run is never delivered as
// 'completed'.
export async function handleWorkflowCallback(
  payload: WorkflowCallbackPayload
): Promise<WorkflowCallbackResult> {
  const admin = createAdminClient();

  const { request_id: requestId, status, result, error } = payload;

  if (status !== "completed" && status !== "failed") {
    return {
      ok: false,
      error: "Status must be 'completed' or 'failed'.",
      status: 400,
    };
  }

  const { data: request, error: fetchError } = await admin
    .from("service_requests")
    .select("id, uuid, service_key, status, input")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { ok: false, error: "Request not found.", status: 404 };
  }

  // Idempotency guard: n8n may retry the callback. A request that is already
  // terminal is never re-processed, so credits are never double-deducted.
  // While a request is 'processing' (the normal state for a first callback or
  // a retry after a failed deduction), every attempt may legitimately deduct.
  if (request.status === "completed" || request.status === "failed") {
    console.warn(
      `[service-callback][deduction] request ${requestId} is already '${request.status}' ` +
        `(service_key=${request.service_key ?? "unknown"}) — skipping (idempotency). ` +
        `No credits deducted this time.`
    );
    return { ok: true };
  }

  const output = buildCallbackOutput(status, result, error);

  // Deduction runs BEFORE the request is marked 'completed'. It is computed
  // purely from the ORIGINAL stored input (service_requests.input) via
  // getServiceCreditCost(service_key, input) and must never depend on the
  // shape of the result payload (leads array, content string, results array,
  // or anything a future service sends).
  if (status === "completed") {
    console.log(
      `[service-callback][deduction] computing deduction for request ${requestId} ` +
        `(status=${status}, service_key=${request.service_key ?? "unknown"}, ` +
        `user=${request.uuid}, input=${JSON.stringify(request.input ?? null)})`
    );

    const charge = await getDeductionAmount(
      admin,
      request.input as ServiceInput | null,
      request.service_key
    );

    console.log(
      `[service-callback][deduction] resolved charge = ${charge} for request ${requestId} ` +
        `(service_key=${request.service_key ?? "unknown"}, ` +
        `input=${JSON.stringify(request.input ?? null)})`
    );

    if (charge === null) {
      console.error(
        `[service-callback][deduction] NO deduction for completed request ${requestId}: ` +
          `service_key=${request.service_key ?? "unknown"}, ` +
          `input=${JSON.stringify(request.input ?? null)} — ` +
          `getServiceCreditCost() returned null AND services.credit_cost is 0/unset. ` +
          `Verify getServiceCreditCost() in src/lib/services/costs.ts has a case that ` +
          `resolves from this input, and that the services row for this key has a ` +
          `positive credit_cost fallback.`
      );
      return {
        ok: false,
        error: `Credit deduction failed: no charge could be resolved for request ${requestId}.`,
        status: 500,
      };
    }

    try {
      await deductCredits(
        request.uuid,
        charge,
        request.service_key ?? undefined,
        "deduction"
      );
      console.log(
        `[service-callback][deduction] SUCCESS: inserted -${charge} credit_transactions row for ` +
          `request ${requestId} (service_key=${request.service_key ?? "unknown"}, ` +
          `user=${request.uuid}). User balance will decrease by ${charge}.`
      );
    } catch (deductError) {
      console.error(
        `[service-callback][deduction] credit_transactions INSERT FAILED for request ${requestId}:`,
        JSON.stringify({
          message: (deductError as { message?: string }).message,
          code: (deductError as { code?: string }).code,
          details: (deductError as { details?: string }).details,
          hint: (deductError as { hint?: string }).hint,
        }),
        `\nIntended row:`,
        JSON.stringify({
          uuid: request.uuid,
          amount: -charge,
          type: "deduction",
          service_key: request.service_key,
        })
      );
      return {
        ok: false,
        error: `Credit deduction failed for request ${requestId}: ` +
          `${(deductError as { message?: string }).message ?? "unknown error"}`,
        status: 500,
      };
    }
  }

  const { error: updateError } = await admin
    .from("service_requests")
    .update({ status, output })
    .eq("id", requestId);

  if (updateError) {
    console.error("[service-callback] status update failed:", updateError.message);
    return { ok: false, error: updateError.message, status: 500 };
  }

  return { ok: true };
}

// Public callback URL/header, kept here so it can be documented and reused.
export const workflowCallbackUrl = getWorkflowCallbackUrl();
export const workflowCallbackHeader = N8N_WEBHOOK_AUTH_HEADER;