import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWorkflowCallbackUrl,
  N8N_WEBHOOK_AUTH_HEADER,
} from "@/lib/services/config";
import { deductCredits } from "@/lib/credits";

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
    .select("id, uuid, service_key, status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { ok: false, error: "Request not found.", status: 404 };
  }

  // Idempotency guard: n8n may retry the callback. A request that is already
  // terminal is never re-processed, so credits are never double-deducted.
  if (request.status === "completed" || request.status === "failed") {
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
    const creditCost = await getServiceCreditCost(request.service_key);
    if (creditCost !== null && creditCost > 0) {
      try {
        await deductCredits(
          request.uuid,
          creditCost,
          request.service_key ?? undefined,
          "deduction"
        );
      } catch (deductError) {
        // The workflow already finished; a failed deduction (e.g. an un-migrated
        // database that doesn't allow the 'deduction' type yet) must not block
        // the callback from marking the request completed.
        console.error("[service-callback] deduction failed:", deductError);
      }
    }
  }

  return { ok: true };
}

async function getServiceCreditCost(
  serviceKey: string | null
): Promise<number | null> {
  if (!serviceKey) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("services")
    .select("credit_cost")
    .eq("key", serviceKey)
    .maybeSingle();
  return data ? Number(data.credit_cost ?? 0) : null;
}

// Public callback URL/header, kept here so it can be documented and reused.
export const workflowCallbackUrl = getWorkflowCallbackUrl();
export const workflowCallbackHeader = N8N_WEBHOOK_AUTH_HEADER;