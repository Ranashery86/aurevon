import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWorkflowCallbackUrl,
  N8N_WEBHOOK_AUTH_HEADER,
} from "@/lib/services/config";
import { deductCredits } from "@/lib/credits";
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
// Priority: the requested quantity in the stored input (1 unit = 1 credit,
// e.g. leads_count for Lead Generation). Fallback: the service's flat
// services.credit_cost. Returns null if neither is usable.
async function getDeductionAmount(
  admin: ReturnType<typeof createAdminClient>,
  input: ServiceInput | null,
  serviceKey: string | null
): Promise<number | null> {
  const leadsCount = input?.leads_count;
  if (leadsCount !== undefined && leadsCount !== null) {
    const amount = Number(leadsCount);
    if (Number.isFinite(amount) && amount > 0) {
      return Math.round(amount);
    }
    console.error(
      `[service-callback] stored input.leads_count was invalid (${JSON.stringify(
        leadsCount
      )}) — falling back to services.credit_cost.`
    );
  }

  if (!serviceKey) return null;
  const { data } = await admin
    .from("services")
    .select("credit_cost")
    .eq("key", serviceKey)
    .maybeSingle();
  const fallback = data ? Number(data.credit_cost ?? 0) : 0;
  return fallback > 0 ? fallback : null;
}

// Shared n8n callback handling, used by /api/services/callback for every
// service: look up the request row -> update status/output -> deduct credits
// only on a successful run (never on failure).
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
  if (request.status === "completed" || request.status === "failed") {
    console.warn(
      `[service-callback] request ${requestId} is already '${request.status}' — ` +
        `skipping (idempotency). No credits deducted this time.`
    );
    return { ok: true };
  }

  const output =
    status === "completed" ? (result ?? null) : { error: error ?? "Workflow failed" };

  const { error: updateError } = await admin
    .from("service_requests")
    .update({ status, output })
    .eq("id", requestId);

  if (updateError) {
    console.error("[service-callback] update failed:", updateError.message);
    return { ok: false, error: updateError.message, status: 500 };
  }

  if (status === "completed") {
    const charge = await getDeductionAmount(
      admin,
      request.input as ServiceInput | null,
      request.service_key
    );

    if (charge === null) {
      console.error(
        `[service-callback] request ${requestId} completed but no valid deduction ` +
          `amount was found (input has no leads_count and services.credit_cost is ` +
          `unset) — NO credits were deducted.`
      );
      return { ok: true };
    }

    console.log(
      `[service-callback] deducting ${charge} credit(s) for completed request ` +
        `${requestId} (service=${request.service_key ?? "unknown"}, ` +
        `user=${request.uuid})`
    );

    try {
      await deductCredits(
        request.uuid,
        charge,
        request.service_key ?? undefined,
        "deduction"
      );
      console.log(
        `[service-callback] deduction succeeded: -${charge} credits for request ${requestId}`
      );
    } catch (deductError) {
      // The workflow already finished; a failed deduction (e.g. an un-migrated
      // database that doesn't allow the 'deduction' type yet) must not block
      // the callback from marking the request completed.
      console.error(
        `[service-callback] credit_transactions INSERT FAILED for request ${requestId}:`,
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
    }
  }

  return { ok: true };
}

// Public callback URL/header, kept here so it can be documented and reused.
export const workflowCallbackUrl = getWorkflowCallbackUrl();
export const workflowCallbackHeader = N8N_WEBHOOK_AUTH_HEADER;