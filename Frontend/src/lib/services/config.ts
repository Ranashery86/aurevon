import { site } from "@/lib/site";

// Shared-secret header used in BOTH directions with n8n:
//  1. This app -> n8n trigger webhook (identifies our app to n8n)
//  2. n8n -> this app's /api/services/callback (proves it's really n8n)
// Header name: x-webhook-auth-token
// Header value: exactly the raw value of N8N_WEBHOOK_AUTH_TOKEN (no prefix).
//
// N8N_WEBHOOK_AUTH_TOKEN is a secret and lives ONLY in the environment
// (Vercel env vars) — it is never stored in the database.
export const N8N_WEBHOOK_AUTH_HEADER = "x-webhook-auth-token";

// Per-service n8n trigger webhook URLs are NOT environment variables. They
// are stored in the services table (services.webhook_url, per service_key),
// so repointing a service at a different workflow is a pure Supabase data
// change — no code change or redeploy required.
//
// To add a new service: insert/update its row in `services` with the
// service_key, credit_cost, and webhook_url, then create a thin API route
// that calls triggerServiceWorkflow().

// Exact URL n8n should call when a workflow finishes. Mirror this on the
// n8n side (HTTP Request node added at the end of the workflow).
export function getWorkflowCallbackUrl(): string {
  return `${site.url}/api/services/callback`;
}