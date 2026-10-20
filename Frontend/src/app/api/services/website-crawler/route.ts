import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";
import {
  CRAWL_MAX_URLS,
  CRAWL_MIN_URLS,
  extractUniqueUrls,
} from "@/lib/services/costs";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  const rawUrls = (input ?? {}).urls;
  if (!Array.isArray(rawUrls)) {
    return Response.json(
      { error: '"urls" must be an array of URLs.' },
      { status: 400 }
    );
  }

  // Re-normalize + dedupe server-side (never trust the client's list or cost):
  // this mirrors the client exactly, so the count charged is the count of
  // unique, normalized URLs actually submitted.
  const urls = extractUniqueUrls(rawUrls);

  if (urls.length < CRAWL_MIN_URLS) {
    return Response.json(
      { error: `At least ${CRAWL_MIN_URLS} URL is required.` },
      { status: 400 }
    );
  }

  if (urls.length > CRAWL_MAX_URLS) {
    return Response.json(
      { error: `No more than ${CRAWL_MAX_URLS} URLs per run. Please trim your list.` },
      { status: 400 }
    );
  }

  // Cost is recomputed from the URL count (1 credit per URL) — a cost value
  // from the client is never trusted.
  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "website-crawler",
    input: { urls },
    creditCostOverride: urls.length,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}