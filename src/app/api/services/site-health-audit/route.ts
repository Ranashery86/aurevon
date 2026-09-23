import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";
import {
  SITE_AUDIT_MIN_URLS,
  SITE_AUDIT_MAX_URLS,
  extractUniqueUrls,
  getSiteHealthAuditCost,
} from "@/lib/services/costs";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  // Target URLs are re-derived server-side: each entry is normalized
  // (adds https:// when missing) and the list is de-duplicated, so the
  // workflow always receives fetchable, distinct URLs.
  const rawUrls = (input ?? {}).urls;
  if (!Array.isArray(rawUrls)) {
    return Response.json(
      { error: '"urls" must be provided as an array of website URLs.' },
      { status: 400 }
    );
  }

  const urls = extractUniqueUrls(rawUrls);

  if (urls.length < SITE_AUDIT_MIN_URLS) {
    return Response.json(
      { error: `At least ${SITE_AUDIT_MIN_URLS} website URL is required.` },
      { status: 400 }
    );
  }

  if (urls.length > SITE_AUDIT_MAX_URLS) {
    return Response.json(
      {
        error: `No more than ${SITE_AUDIT_MAX_URLS} websites can be audited in a single run (${urls.length} provided).`,
      },
      { status: 400 }
    );
  }

  // Cost is recomputed server-side from the URL count (15 credits per URL).
  // A client-sent cost is never trusted — only the validated URL list
  // itself determines the charge.
  const cost = getSiteHealthAuditCost(urls);
  if (cost === null) {
    return Response.json(
      { error: "Invalid URL list provided." },
      { status: 400 }
    );
  }

  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "site-health-audit",
    input: { urls },
    creditCostOverride: cost,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}