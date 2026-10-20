import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";

const MAX_LEADS = 100;
const MIN_LEADS = 1;

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  const { industry, location, leads_count } = (input ?? {}) as Record<
    string,
    unknown
  >;

  const industryText = typeof industry === "string" ? industry.trim() : "";
  if (!industryText) {
    return Response.json({ error: '"industry" is required' }, { status: 400 });
  }

  const locationText = typeof location === "string" ? location.trim() : "";
  if (!locationText) {
    return Response.json({ error: '"location" is required' }, { status: 400 });
  }

  const leadsCount = Number(leads_count);
  if (
    !Number.isFinite(leadsCount) ||
    !Number.isInteger(leadsCount) ||
    leadsCount < MIN_LEADS ||
    leadsCount > MAX_LEADS
  ) {
    return Response.json(
      {
        error: `"leads_count" must be a whole number between ${MIN_LEADS} and ${MAX_LEADS}`,
      },
      { status: 400 }
    );
  }

  // Never trust the client-side check alone: the server re-validates the
  // dynamic cost (1 lead = 1 credit) and the balance inside the trigger.
  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "lead-generation",
    input: { industry: industryText, location: locationText, leads_count: leadsCount },
    creditCostOverride: leadsCount,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}