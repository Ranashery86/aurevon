import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  N8N_WEBHOOK_AUTH_HEADER,
  SERVICE_WEBHOOK_CONFIG,
} from "@/lib/services/config";
import type { ServiceInput } from "@/lib/services/types";

export type TriggerServiceWorkflowResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; status: number };

// Credit cost for a service, straight from the services table.
export async function getServiceCreditCost(
  serviceKey: string
): Promise<number | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("services")
    .select("credit_cost")
    .eq("key", serviceKey)
    .maybeSingle();

  if (error || !data) return null;
  return Number(data.credit_cost ?? 0);
}

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
// Steps: fetch credit_cost -> re-check balance server-side -> insert a
// service_requests row (status 'processing') -> fire the n8n webhook
// asynchronously -> return the row id immediately.
export async function triggerServiceWorkflow(opts: {
  userId: string;
  serviceKey: string;
  input: ServiceInput;
}): Promise<TriggerServiceWorkflowResult> {
  const { userId, serviceKey, input } = opts;
  const admin = createAdminClient();

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("name, credit_cost")
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

  const creditCost = Number(service.credit_cost ?? 0);
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

  const webhookConfig = SERVICE_WEBHOOK_CONFIG[serviceKey];
  const webhookEnvVar = webhookConfig?.webhookEnvVar;
  const webhookEnvValue = webhookEnvVar ? process.env[webhookEnvVar] : undefined;
  const webhookUrl = webhookEnvValue && webhookEnvValue.trim() ? webhookEnvValue : undefined;

  if (!webhookUrl) {
    console.error(
      `[service-workflow] webhook not configured for ${serviceKey}: ` +
        `looked for env var "${webhookEnvVar ?? "(no entry in SERVICE_WEBHOOK_CONFIG)"}", ` +
        `process.env returned ${webhookEnvValue === undefined ? "undefined" : webhookEnvValue === "" ? "an empty string" : "a value"}. ` +
        `(Configure it in Vercel and redeploy — value is NOT logged.)`
    );
    await markRequestFailed(admin, request.id, "Webhook not configured");
    return {
      ok: false,
      error: "This service is not configured yet.",
      status: 500,
    };
  }

  const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { [N8N_WEBHOOK_AUTH_HEADER]: authToken } : {}),
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