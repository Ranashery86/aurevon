import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Whether a deduction came from a completed workflow run ("deduction", the
// async callback path) or an immediate synchronous use ("usage").
export type CreditDeductionType = "usage" | "deduction";

export async function deductCredits(
  userId: string,
  amount: number,
  serviceKey?: string,
  type: CreditDeductionType = "usage",
) {
  if (amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_transactions")
    .insert({
      uuid: userId,
      amount: -amount,
      type,
      service_key: serviceKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}