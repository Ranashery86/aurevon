import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("[stripe-webhook] signature verification failed:", error);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only grant the plan + credits when the subscription checkout is actually paid.
    if (session.mode !== "subscription" || session.payment_status !== "paid") {
      return Response.json({ received: true });
    }

    const userId = session.metadata?.user_id;
    const planId = session.metadata?.plan_id;

    if (!userId || !planId) {
      console.error("[stripe-webhook] missing metadata on session", session.id);
      return Response.json({ received: true });
    }

    const admin = createAdminClient();

    // Idempotency: Stripe retries failed webhook deliveries. If we've already
    // granted credits for this Checkout Session, do not grant them again.
    const { data: existingCredit, error: existingCreditError } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("uuid", userId)
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingCreditError) {
      console.error("[stripe-webhook] duplicate check failed:", existingCreditError.message);
      return Response.json({ error: existingCreditError.message }, { status: 500 });
    }

    if (existingCredit) {
      return Response.json({ received: true });
    }

    const { data: plan } = await admin
      .from("plans")
      .select("monthly_credits")
      .eq("id", planId)
      .single();

    if (!plan) {
      console.error("[stripe-webhook] plan not found for", planId);
      return Response.json({ received: true });
    }

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("uuid", userId)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await admin
        .from("subscriptions")
        .update({ plan_id: planId, status: "active", updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[stripe-webhook] subscription update failed:", updateError.message);
        return Response.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await admin.from("subscriptions").insert({
        uuid: userId,
        plan_id: planId,
        status: "active",
      });

      if (insertError) {
        console.error("[stripe-webhook] subscription insert failed:", insertError.message);
        return Response.json({ error: insertError.message }, { status: 500 });
      }
    }

    const { error: creditError } = await admin.from("credit_transactions").insert({
      uuid: userId,
      amount: plan.monthly_credits,
      type: "plan_purchase",
      stripe_session_id: session.id,
    });

    if (creditError) {
      console.error("[stripe-webhook] credit insert failed:", creditError.message);
      return Response.json({ error: creditError.message }, { status: 500 });
    }

    console.log(
      `[stripe-webhook] checkout.session.completed processed: user=${userId}, plan=${planId}, session=${session.id}`
    );
  }

  return Response.json({ received: true });
}