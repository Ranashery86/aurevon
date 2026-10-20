import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WebsiteCrawlerWorkflow } from "@/components/website-crawler-workflow";
import { muted } from "@/lib/ui";
import type {
  ServiceField,
  ServiceRequestRow,
} from "@/lib/services/types";

const SERVICE_KEY = "website-crawler";

const fields: ServiceField[] = [
  {
    name: "urls",
    label: "Websites",
  },
];

export default async function WebsiteCrawlerPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const userId = claims.claims.sub as string;

  const [{ data: service }, { data: creditRows }, { data: rows }] =
    await Promise.all([
      supabase
        .from("services")
        .select("name")
        .eq("key", SERVICE_KEY)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("amount")
        .eq("uuid", userId),
      supabase
        .from("service_requests")
        .select("*")
        .eq("uuid", userId)
        .eq("service_key", SERVICE_KEY)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const balance =
    creditRows?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          {service?.name ?? "Website Crawler"}
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Crawl one or many websites and extract their contact details and
          social links (1 credit per URL).
        </p>
      </div>

      <WebsiteCrawlerWorkflow
        serviceKey={SERVICE_KEY}
        serviceName={service?.name ?? "Website Crawler"}
        balance={balance}
        fields={fields}
        history={(rows ?? []) as ServiceRequestRow[]}
      />
    </div>
  );
}