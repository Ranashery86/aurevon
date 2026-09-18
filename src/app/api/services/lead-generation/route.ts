import { createClient } from "@/lib/supabase/server";
import { triggerServiceWorkflow } from "@/lib/services/workflow";

export async function POST(request: Request) {
  const { input } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  const { industry, location, keywords } = (input ?? {}) as Record<string, unknown>;

  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries({ industry, location, keywords })) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      return Response.json(
        { error: `"${key}" is required` },
        { status: 400 }
      );
    }
    cleaned[key] = text;
  }

  const result = await triggerServiceWorkflow({
    userId,
    serviceKey: "lead-generation",
    input: cleaned,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ request_id: result.requestId });
}