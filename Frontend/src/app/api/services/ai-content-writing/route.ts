import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";
import {
  AI_CONTENT_TYPES,
  AI_CONTENT_TONES,
  AI_CONTENT_LENGTHS,
  getAiContentWritingCost,
  matchChoice,
} from "@/lib/services/costs";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  const { topic, content_type, tone, length } = (input ?? {}) as Record<
    string,
    unknown
  >;

  const topicText = typeof topic === "string" ? topic.trim() : "";
  if (!topicText) {
    return Response.json({ error: '"topic" is required' }, { status: 400 });
  }

  const contentType =
    matchChoice(content_type, AI_CONTENT_TYPES) ?? "";
  if (!contentType) {
    return Response.json(
      { error: '"content_type" must be one of: ' + AI_CONTENT_TYPES.join(", ") },
      { status: 400 }
    );
  }

  const toneChoice = matchChoice(tone, AI_CONTENT_TONES) ?? "";
  if (!toneChoice) {
    return Response.json(
      { error: '"tone" must be one of: ' + AI_CONTENT_TONES.join(", ") },
      { status: 400 }
    );
  }

  const lengthChoice = matchChoice(length, AI_CONTENT_LENGTHS) ?? "";
  if (!lengthChoice) {
    return Response.json(
      { error: '"length" must be one of: ' + AI_CONTENT_LENGTHS.join(", ") },
      { status: 400 }
    );
  }

  // Cost is recomputed server-side from the selected length (Short=2 /
  // Medium=4 / Long=6). A cost value from the client is never trusted — the
  // submitted "length" is the only thing that determines the charge.
  const cost = getAiContentWritingCost(lengthChoice);
  if (cost === null) {
    return Response.json({ error: "Invalid length selection." }, { status: 400 });
  }

  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "ai-content-writing",
    input: {
      topic: topicText,
      content_type: contentType,
      tone: toneChoice,
      length: lengthChoice,
    },
    creditCostOverride: cost,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}