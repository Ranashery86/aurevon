import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServiceWorkflow } from "@/components/service-workflow";
import { muted } from "@/lib/ui";
import type {
  ServiceColumn,
  ServiceField,
  ServiceRequestRow,
} from "@/lib/services/types";

const SERVICE_KEY = "lead-generation";

const fields: ServiceField[] = [
  {
    name: "industry",
    label: "Industry",
    placeholder: "e.g. SaaS, dental clinics, logistics",
    required: true,
  },
  {
    name: "location",
    label: "Location",
    placeholder: "e.g. United States, London, remote",
    required: true,
  },
  {
    name: "keywords",
    label: "Keywords",
    placeholder: "e.g. marketing director, decision maker",
    required: true,
  },
];

const columns: ServiceColumn[] = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "contact_info", label: "Contact info" },
  { key: "source", label: "Source" },
];

export default async function LeadGenerationPage() {
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
        .select("name, credit_cost")
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
          {service?.name ?? "Lead Generation"}
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Find and organize qualified leads for your target market, ready to
          export.
        </p>
      </div>

      <ServiceWorkflow
        serviceKey={SERVICE_KEY}
        serviceName={service?.name ?? "Lead Generation"}
        creditCost={Number(service?.credit_cost ?? 0)}
        balance={balance}
        fields={fields}
        columns={columns}
        history={(rows ?? []) as ServiceRequestRow[]}
      />
    </div>
  );
}