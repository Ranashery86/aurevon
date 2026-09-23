import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";
import {
  getSiteHealthAuditCost,
  normalizeUrl,
} from "@/lib/services/costs";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  // Single target URL, normalized server-side (adds https:// when missing)
  // so the workflow always receives a fetchable URL.
  const url = normalizeUrl((input ?? {}).url);
  if (url === null) {
    return Response.json(
      { error: "A valid website URL is required." },
      { status: 400 }
    );
  }

  // Audit depth is recomputed server-side from max_pages and must be exactly
  // 5, 15, or 30. A client-sent cost is never trusted — only the tier value
  // itself determines the charge (1 credit per page).
  const maxPages = getSiteHealthAuditCost((input ?? {}).max_pages);
  if (maxPages === null) {
    return Response.json(
      { error: '"max_pages" must be exactly 5, 15, or 30.' },
      { status: 400 }
    );
  }

  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "site-health-audit",
    input: { url, max_pages: maxPages },
    creditCostOverride: maxPages,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}