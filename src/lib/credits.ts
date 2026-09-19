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
  const payload = {
    uuid: userId,
    amount: -amount,
    type,
    service_key: serviceKey ?? null,
  };
  console.log(
    `[credits][deduct] inserting into credit_transactions: ${JSON.stringify(payload)}`
  );

  const { data, error } = await admin
    .from("credit_transactions")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error(
      `[credits][deduct] credit_transactions INSERT returned an ERROR:`,
      JSON.stringify({
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }),
      `\nPayload was: ${JSON.stringify(payload)}`
    );
    throw error;
  }

  console.log(
    `[credits][deduct] credit_transactions INSERT succeeded — response data: ${JSON.stringify(data)}`
  );

  return data;
}