import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { N8N_WEBHOOK_AUTH_HEADER } from "@/lib/services/config";
import type { ServiceInput } from "@/lib/services/types";

export type TriggerServiceWorkflowResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; status: number };

// Current credit balance, computed the same way as the dashboard
// (sum of credit_transactions.amount for the user).
export async function getUserCreditBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("uuid", userId);

  if (error) return 0;
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

// Shared "trigger a service workflow" pipeline. Used by every service API
// route so the next two services only need a thin route + a config entry.
// The webhook URL is read from the services table (webhook_url column), so
// pointing a service at a different n8n endpoint is a pure data change.
//
// Credit cost: a service may override the flat services.credit_cost with a
// per-request dynamic cost (e.g. Lead Generation charges 1 credit per lead;
// the route passes creditCostOverride = leads_count). The override is also
// what the callback uses to deduct.
//
// Steps: fetch service row (name, credit_cost, webhook_url) -> validate the
// URL + auth secret -> re-check balance server-side -> insert a
// service_requests row (status 'processing') -> fire the n8n webhook
// asynchronously -> return the row id immediately.
export async function triggerServiceWorkflow(opts: {
  userId: string;
  serviceKey: string;
  input: ServiceInput;
  creditCostOverride?: number;
}): Promise<TriggerServiceWorkflowResult> {
  const { userId, serviceKey, input, creditCostOverride } = opts;
  const admin = createAdminClient();

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("name, credit_cost, webhook_url")
    .eq("key", serviceKey)
    .maybeSingle();

  if (serviceError || !service) {
    console.error(
      `[service-workflow] service lookup failed: searched services.key = "${serviceKey}", ` +
        `rows returned = ${service ? 1 : 0}, error = ${serviceError?.message ?? "none"}`
    );
    return {
      ok: false,
      error: "Service not found or not configured.",
      status: 500,
    };
  }

  // Cost for this run: explicit per-request override (e.g. number of leads),
  // otherwise the flat services.credit_cost.
  const creditCost = creditCostOverride ?? Number(service.credit_cost ?? 0);
  const webhookUrl = service.webhook_url ? service.webhook_url.trim() : "";

  // A service row exists but has no webhook_url in the database. This is a
  // data/setup problem, not a missing secret — keep the messages distinct.
  if (!webhookUrl) {
    console.error(
      `[service-workflow] service "${serviceKey}" exists but has no webhook_url ` +
        `in the services table. Add one via Supabase (services.webhook_url) — ` +
        `no redeploy needed. Value is NOT logged, only its presence.`
    );
    return {
      ok: false,
      error: "This service exists but is missing its webhook URL. Please contact support.",
      status: 500,
    };
  }

  // N8N_WEBHOOK_AUTH_TOKEN is a secret and intentionally stays out of the
  // database. Refuse to fire the webhook without it rather than silently
  // sending an unauthenticated request.
  const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
  if (!authToken) {
    console.error(
      `[service-workflow] env var "N8N_WEBHOOK_AUTH_TOKEN" is not set for service ` +
        `"${serviceKey}" (process.env returned undefined/empty). Configure it in ` +
        `Vercel and redeploy. Value is NOT logged.`
    );
    return {
      ok: false,
      error: "Service authentication is not configured. Please contact support.",
      status: 500,
    };
  }

  const balance = await getUserCreditBalance(userId);

  // Never trust the frontend-disabled button alone — re-check server-side.
  if (balance < creditCost) {
    return {
      ok: false,
      error: "Not enough credits — please upgrade your plan.",
      status: 402,
    };
  }

  const { data: request, error: insertError } = await admin
    .from("service_requests")
    .insert({
      uuid: userId,
      service_name: service.name,
      service_key: serviceKey,
      status: "processing",
      input,
    })
    .select("id")
    .single();

  if (insertError || !request) {
    console.error(
      `[service-workflow] insert failed for ${serviceKey}:`,
      JSON.stringify({
        message: insertError?.message,
        code: insertError?.code,
        details: insertError?.details,
        hint: insertError?.hint,
      }),
      `\nPayload was:`,
      JSON.stringify({
        uuid: userId,
        service_name: service.name,
        service_key: serviceKey,
        status: "processing",
        input,
      })
    );
    return { ok: false, error: "Could not create the request.", status: 500 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        [N8N_WEBHOOK_AUTH_HEADER]: authToken,
      },
      body: JSON.stringify({
        request_id: request.id,
        user_id: userId,
        input,
      }),
    });

    if (!response.ok) {
      console.error(
        `[service-workflow] n8n returned ${response.status} for ${serviceKey}`
      );
      await markRequestFailed(
        admin,
        request.id,
        `Workflow trigger failed (${response.status})`
      );
      return {
        ok: false,
        error: "Workflow could not be started. Try again later.",
        status: 502,
      };
    }
  } catch (error) {
    console.error(
      `[service-workflow] n8n request failed for ${serviceKey}:`,
      error
    );
    await markRequestFailed(admin, request.id, "Workflow trigger failed");
    return {
      ok: false,
      error: "Workflow could not be started. Try again later.",
      status: 502,
    };
  } finally {
    clearTimeout(timeout);
  }

  return { ok: true, requestId: request.id };
}

async function markRequestFailed(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  message: string
) {
  await admin
    .from("service_requests")
    .update({ status: "failed", output: { error: message } })
    .eq("id", requestId);
}