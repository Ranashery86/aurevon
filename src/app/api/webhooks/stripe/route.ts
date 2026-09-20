import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Log the full Supabase error object (never just error.message) so a failing
// DB step like a constraint mismatch is visible in the runtime logs instead of
// being silently swallowed.
function logSupabaseError(
  step: string,
  sessionId: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null
) {
  console.error(
    `[stripe-webhook][${step}] FAILED for session ${sessionId}:`,
    JSON.stringify({
      message: error?.message ?? null,
      code: error?.code ?? null,
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    })
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const endpoint = process.env.STRIPE_WEBHOOK_SECRET;

  console.log(
    `[stripe-webhook] received POST event (signature present=${!!signature}, ` +
      `STRIPE_WEBHOOK_SECRET configured=${!!endpoint})`
  );

  if (!signature || !endpoint) {
    return Response.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpoint);
  } catch (error) {
    console.error("[stripe-webhook] signature verification failed:", error);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[stripe-webhook] received event: type=${event.type}, id=${event.id}`);

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Only grant the plan + credits when the subscription checkout is actually
  // paid. Anything else is not an error — retrying the same event would not
  // change the outcome — so log it loudly and acknowledge with 200.
  if (session.mode !== "subscription" || session.payment_status !== "paid") {
    console.log(
      `[stripe-webhook] ignoring session ${session.id}: mode=${session.mode}, ` +
        `payment_status=${session.payment_status} — only paid subscription checkouts grant credits. ` +
        `If this was an async/off-session payment, credits will also arrive via ` +
        `checkout.session.async_payment_succeeded (not handled here yet).`
    );
    return Response.json({ received: true });
  }

  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;

  console.log(
    `[stripe-webhook] extracting metadata for session ${session.id}: ` +
      `user_id=${userId ? `"${userId}"` : "MISSING"}, ` +
      `plan_id=${planId ? `"${planId}"` : "MISSING"}, ` +
      `full metadata=${JSON.stringify(session.metadata ?? {})}, ` +
      `customer_email=${session.customer_email ?? "n/a"}`
  );

  if (!userId || !planId) {
    console.error(
      `[stripe-webhook] missing metadata on session ${session.id} — returning 500 so ` +
        `Stripe shows Failed and retries. metadata=${JSON.stringify(session.metadata)}`
    );
    return Response.json({ error: "Missing user_id/plan_id in session metadata" }, { status: 500 });
  }

  const admin = createAdminClient();

  try {
    // Idempotency: Stripe retries failed webhook deliveries. If we've already
    // granted credits for this Checkout Session, do not grant them again.
    const { data: existingCredit, error: existingCreditError } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("uuid", userId)
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingCreditError) {
      logSupabaseError("duplicate-check", session.id, existingCreditError);
      return Response.json({ error: existingCreditError.message }, { status: 500 });
    }

    if (existingCredit) {
      console.log(
        `[stripe-webhook] session ${session.id} already has credit row id=${existingCredit.id} — idempotent skip (200).`
      );
      return Response.json({ received: true });
    }

    // Resolve the purchased plan and its monthly credit allowance.
    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id, name, monthly_credits")
      .eq("id", planId)
      .maybeSingle();

    if (planError) {
      logSupabaseError("plan-lookup", session.id, planError);
      return Response.json({ error: planError.message }, { status: 500 });
    }

    if (!plan) {
      console.error(
        `[stripe-webhook] plan "${planId}" not found for session ${session.id} — returning 500 ` +
          `so Stripe shows Failed and retries.`
      );
      return Response.json({ error: `Plan ${planId} not found` }, { status: 500 });
    }

    console.log(
      `[stripe-webhook] plan resolved for session ${session.id}: id=${plan.id}, ` +
        `name=${plan.name}, monthly_credits=${plan.monthly_credits}`
    );

    // Subscription upsert: update the user's active subscription if one exists,
    // otherwise insert a new one.
    const { data: existing, error: existingError } = await admin
      .from("subscription")
      .select("id, plan_id")
      .eq("uuid", userId)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      logSupabaseError("subscription-lookup", session.id, existingError);
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      console.log(
        `[stripe-webhook] session ${session.id}: updating existing subscription ` +
          `${existing.id} (old plan_id=${existing.plan_id}) -> plan_id=${planId}`
      );
      const { data: updateData, error: updateError } = await admin
        .from("subscription")
        .update({ plan_id: planId, status: "active", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id");

      if (updateError) {
        logSupabaseError("subscription-update", session.id, updateError);
        return Response.json({ error: updateError.message }, { status: 500 });
      }

      console.log(
        `[stripe-webhook] subscription updated for session ${session.id}: ${JSON.stringify(updateData)}`
      );
    } else {
      const insertPayload = { uuid: userId, plan_id: planId, status: "active" };
      console.log(
        `[stripe-webhook] session ${session.id}: inserting new subscription: ${JSON.stringify(insertPayload)}`
      );
      const { data: insertData, error: insertError } = await admin
        .from("subscription")
        .insert(insertPayload)
        .select("id");

      if (insertError) {
        logSupabaseError("subscription-insert", session.id, insertError);
        return Response.json({ error: insertError.message }, { status: 500 });
      }

      console.log(
        `[stripe-webhook] subscription inserted for session ${session.id}: ${JSON.stringify(insertData)}`
      );
    }

    // Grant the plan's monthly credits.
    const creditPayload = {
      uuid: userId,
      amount: plan.monthly_credits,
      type: "plan_purchase",
      stripe_session_id: session.id,
    };
    console.log(
      `[stripe-webhook] session ${session.id}: inserting credit_transactions row: ${JSON.stringify(creditPayload)}`
    );
    const { data: creditData, error: creditError } = await admin
      .from("credit_transactions")
      .insert(creditPayload)
      .select("id");

    if (creditError) {
      logSupabaseError("credit-insert", session.id, creditError);
      return Response.json({ error: creditError.message }, { status: 500 });
    }

    console.log(
      `[stripe-webhook] checkout.session.completed PROCESSED: user=${userId}, plan=${planId}, ` +
        `credits=${plan.monthly_credits}, session=${session.id}, credit_row=${JSON.stringify(creditData)}`
    );
  } catch (error) {
    console.error(
      `[stripe-webhook] unexpected error processing session ${session.id}:`,
      error
    );
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}