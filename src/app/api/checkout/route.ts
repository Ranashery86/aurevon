import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { site } from "@/lib/site";

export async function POST(request: Request) {
  const { planId } = await request.json().catch(() => ({}));

  if (!planId) {
    return Response.json({ error: "Missing plan_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;
  const admin = createAdminClient();

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  // Stripe expects amounts in the currency's smallest unit (cents for USD).
  const amountCents = Math.round(Number(plan.price) * 100);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return Response.json(
      { error: "The Trial plan is free — no checkout needed" },
      { status: 400 }
    );
  }

  const {
    data: { user },
  } = await admin.auth.admin.getUserById(userId);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: plan.name,
              description: `${plan.monthly_credits} monthly credits`,
            },
            recurring: { interval: "month" },
          },
        },
      ],
      success_url: `${site.url}/dashboard?payment=success`,
      cancel_url: `${site.url}/pricing?payment=cancelled`,
      customer_email: user?.email,
      metadata: {
        user_id: userId,
        plan_id: planId,
      },
    });
  } catch (error) {
    console.error("[checkout] Stripe session creation failed:", error);
    return Response.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  if (!session.url) {
    return Response.json({ error: "Checkout session has no URL" }, { status: 500 });
  }

  return Response.json({ url: session.url });
}