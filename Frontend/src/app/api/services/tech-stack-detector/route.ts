import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";
import {
  MAX_URLS_TECH_STACK,
  TECH_STACK_MIN_URLS,
  extractUniqueUrls,
  getTechStackCost,
} from "@/lib/services/costs";
import { TECH_STACK_SERVICE_KEY } from "@/lib/services/tech-stack";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  // Target URLs are re-derived server-side: each entry is normalized (adds
  // https:// when missing) and the list is de-duplicated, so the workflow
  // always receives fetchable, distinct URLs.
  const rawUrls = (input ?? {}).urls;
  if (!Array.isArray(rawUrls)) {
    return Response.json(
      { error: '"urls" must be provided as an array of website URLs.' },
      { status: 400 }
    );
  }

  const urls = extractUniqueUrls(rawUrls);

  if (urls.length < TECH_STACK_MIN_URLS) {
    return Response.json(
      { error: `At least ${TECH_STACK_MIN_URLS} website URL is required.` },
      { status: 400 }
    );
  }

  if (urls.length > MAX_URLS_TECH_STACK) {
    return Response.json(
      {
        error: `No more than ${MAX_URLS_TECH_STACK} websites can be scanned in a single run (${urls.length} provided).`,
      },
      { status: 400 }
    );
  }

  // Cost is recomputed server-side from the URL count
  // (30 credits per URL). A client-sent cost is never trusted — only the
  // validated URL list itself determines the charge. This same amount is what
  // the shared callback deducts once the workflow completes.
  const cost = getTechStackCost(urls);
  if (cost === null) {
    return Response.json(
      { error: "Invalid URL list provided." },
      { status: 400 }
    );
  }

  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: TECH_STACK_SERVICE_KEY,
    input: { urls },
    creditCostOverride: cost,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}
