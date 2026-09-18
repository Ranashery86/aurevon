import { site } from "@/lib/site";

// Shared-secret header used in BOTH directions with n8n:
//  1. This app -> n8n trigger webhook (identifies our app to n8n)
//  2. n8n -> this app's /api/services/callback (proves it's really n8n)
// Header name: x-webhook-auth-token
// Header value: exactly the raw value of N8N_WEBHOOK_AUTH_TOKEN (no prefix).
export const N8N_WEBHOOK_AUTH_HEADER = "x-webhook-auth-token";

// Per-service trigger webhook configuration. To add a new service, register
// its service_key here (and its credit_cost in the services table), then
// point the API route at the shared trigger helper.
export const SERVICE_WEBHOOK_CONFIG: Record<
  string,
  { webhookEnvVar: string }
> = {
  "lead-generation": { webhookEnvVar: "N8N_LEAD_GENERATION_WEBHOOK_URL" },
};

export function getServiceWebhookUrl(serviceKey: string): string | undefined {
  const config = SERVICE_WEBHOOK_CONFIG[serviceKey];
  if (!config) return undefined;
  return process.env[config.webhookEnvVar];
}

// Exact URL n8n should call when a workflow finishes. Mirror this on the
// n8n side (HTTP Request node added at the end of the workflow).
export function getWorkflowCallbackUrl(): string {
  return `${site.url}/api/services/callback`;
}