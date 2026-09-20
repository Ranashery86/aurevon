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

  // Option A: Checkout is created with mode: "payment" (one-time charge). Grant
  // the plan + credits only when that one-time checkout is actually paid.
  // Anything else is not an error — retrying the same event would not change
  // the outcome — so log it loudly and acknowledge with 200. Option B (true
  // recurring subscriptions with automatic renewal-credit top-ups) would
  // change this guard to mode: "subscription" and add an
  // invoice.payment_succeeded handler for monthly renewal credits — not built.
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    console.log(
      `[stripe-webhook] ignoring session ${session.id}: mode=${session.mode}, ` +
        `payment_status=${session.payment_status} — only paid one-time checkouts grant credits.`
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
    // Resolve the purchased plan first — its monthly_credits is needed for the
    // idempotency check and the credit grant.
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

    // Idempotency: Stripe retries failed webhook deliveries, so make sure a
    // duplicate delivery can never grant the same plan twice.
    //
    // NOTE: the live credit_transactions table does NOT have the
    // stripe_session_id column that schema.sql declares — that migration was
    // never applied to the database — so we cannot dedupe by the Stripe Checkout
    // Session id. Instead we dedupe by (user, type='plan_purchase', amount) so a
    // retry of the same purchase is skipped. Consequence: purchasing the SAME
    // plan twice for more credits is currently blocked by this guard. To restore
    // strict per-session idempotency (allowing same-plan re-purchases), apply the
    // missing migration in the Supabase SQL Editor:
    //   alter table public.credit_transactions
    //     add column if not exists stripe_session_id text;
    const { data: existingCredit, error: existingCreditError } = await admin
      .from("credit_transactions")
      .select("id, created_at")
      .eq("uuid", userId)
      .eq("type", "plan_purchase")
      .eq("amount", plan.monthly_credits)
      .maybeSingle();

    if (existingCreditError) {
      logSupabaseError("duplicate-check", session.id, existingCreditError);
      return Response.json({ error: existingCreditError.message }, { status: 500 });
    }

    if (existingCredit) {
      console.log(
        `[stripe-webhook] session ${session.id}: user ${userId} already has a ` +
          `${plan.monthly_credits}-credit plan_purchase row (id=${existingCredit.id}, ` +
          `created_at=${existingCredit.created_at}) — idempotent skip (200).`
      );
      return Response.json({ received: true });
    }

    // Subscription upsert: update the user's active subscription if one exists,
    // otherwise insert a new one. Live table is "subscriptions" (plural).
    const { data: existing, error: existingError } = await admin
      .from("subscriptions")
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
        .from("subscriptions")
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
        .from("subscriptions")
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

    // Grant the plan's credits. No stripe_session_id: the live table does not
    // have that column yet (see idempotency note above).
    const creditPayload = {
      uuid: userId,
      amount: plan.monthly_credits,
      type: "plan_purchase",
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