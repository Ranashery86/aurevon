import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TechStackDetectorWorkflow } from "@/components/tech-stack-workflow";
import { muted } from "@/lib/ui";
import {
  MAX_URLS_TECH_STACK,
  TECH_STACK_RATE_PER_URL,
} from "@/lib/services/costs";
import { TECH_STACK_SERVICE_KEY } from "@/lib/services/tech-stack";
import type {
  ServiceField,
  ServiceRequestRow,
} from "@/lib/services/types";

const fields: ServiceField[] = [
  {
    name: "urls",
    label: "Websites",
    required: true,
  },
];

export default async function TechStackDetectorPage() {
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
        .eq("key", TECH_STACK_SERVICE_KEY)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("amount")
        .eq("uuid", userId),
      supabase
        .from("service_requests")
        .select("*")
        .eq("uuid", userId)
        .eq("service_key", TECH_STACK_SERVICE_KEY)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const balance =
    creditRows?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          {service?.name ?? "Tech Stack Detector"}
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Detect the technology stack behind 1&ndash;{MAX_URLS_TECH_STACK}{" "}
          websites ({TECH_STACK_RATE_PER_URL} credits per URL).
        </p>
      </div>

      <TechStackDetectorWorkflow
        serviceKey={TECH_STACK_SERVICE_KEY}
        serviceName={service?.name ?? "Tech Stack Detector"}
        balance={balance}
        fields={fields}
        history={(rows ?? []) as ServiceRequestRow[]}
      />
    </div>
  );
}
