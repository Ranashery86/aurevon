import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { planId } = await request.json().catch(() => ({}));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;
  const admin = createAdminClient();

  // When no plan is provided, fall back to the free Trial plan.
  let targetPlanId = planId;

  if (!targetPlanId) {
    const { data: trialPlan, error: trialError } = await admin
      .from("plans")
      .select("id")
      .eq("price", 0)
      .limit(1)
      .maybeSingle();

    if (trialError || !trialPlan) {
      return Response.json({ error: "No valid free plan found" }, { status: 500 });
    }

    targetPlanId = trialPlan.id;
  }

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("*")
    .eq("id", targetPlanId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  if (Number(plan.price) !== 0) {
    return Response.json(
      { error: "Only free (Trial) plans can be initialized this way" },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("subscription")
    .select("id")
    .eq("uuid", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    // Trigger already assigned the trial on signup — nothing to do.
    return Response.json({ success: true, alreadyActive: true });
  }

  const { error: subError } = await admin.from("subscription").insert({
    uuid: userId,
    plan_id: targetPlanId,
    status: "active",
  });

  if (subError) {
    console.error("[subscription/init] insert failed:", subError.message);
    return Response.json({ error: subError.message }, { status: 500 });
  }

  const { error: creditError } = await admin.from("credit_transactions").insert({
    uuid: userId,
    amount: plan.monthly_credits,
    type: "plan_purchase",
  });

  if (creditError) {
    console.error("[subscription/init] credit insert failed:", creditError.message);
    return Response.json({ error: creditError.message }, { status: 500 });
  }

  return Response.json({ success: true, plan_id: targetPlanId });
}