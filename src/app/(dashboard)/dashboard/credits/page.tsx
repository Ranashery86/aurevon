import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { card, muted } from "@/lib/ui";

export default async function CreditsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const { data: transactions } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("uuid", claims.claims.sub)
    .order("created_at", { ascending: false })
    .limit(50);

  const balance =
    transactions?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          Credits &amp; Billing
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Your credit balance and transaction history.
        </p>
      </div>

      <section className={`${card} max-w-xl p-6`}>
        <p className="text-sm text-slate-500">Available credits</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-navy">
          {balance}
        </p>
        <p className={`mt-2 text-sm ${muted}`}>
          Every service uses credits from this balance. Spending deducts
          credits automatically.
        </p>
      </section>

      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Recent transactions
        </h2>

        {transactions && transactions.length > 0 ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-2">Date</th>
                <th className="pb-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b border-navy/[0.04] last:border-0"
                >
                  <td className="py-3 text-slate-500">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                  <td
                    className={`py-3 font-semibold ${
                      Number(transaction.amount) >= 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {Number(transaction.amount) > 0 ? "+" : ""}
                    {transaction.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={`mt-4 text-sm ${muted}`}>
            No transactions yet. Credits appear here as soon as they&apos;re
            added.
          </p>
        )}
      </section>
    </div>
  );
}