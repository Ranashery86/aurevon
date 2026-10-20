import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DomainMonitor } from "@/components/domain-monitor/domain-monitor";
import { DOMAIN_MONITOR_SERVICE_KEY } from "@/lib/services/domain-monitor";

export default async function DomainMonitorPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const userId = claims.claims.sub as string;

  // Same shape as the other service pages: the balance is the sum of this
  // user's credit_transactions, and the cost comes from the services row so the
  // page can never quote a number the route would not charge.
  const [{ data: service }, { data: creditRows }] = await Promise.all([
    supabase
      .from("services")
      .select("name, credit_cost")
      .eq("key", DOMAIN_MONITOR_SERVICE_KEY)
      .maybeSingle(),
    supabase.from("credit_transactions").select("amount").eq("uuid", userId),
  ]);

  const balance =
    creditRows?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? 0;

  return (
    <DomainMonitor
      initialBalance={balance}
      creditCost={Number(service?.credit_cost ?? 1)}
    />
  );
}
