import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiContentWorkflow } from "@/components/ai-content-workflow";
import { muted } from "@/lib/ui";
import {
  AI_CONTENT_TYPES,
  AI_CONTENT_TONES,
  AI_CONTENT_LENGTHS,
} from "@/lib/services/costs";
import type {
  ServiceField,
  ServiceRequestRow,
} from "@/lib/services/types";

const SERVICE_KEY = "ai-content-writing";

const fields: ServiceField[] = [
  {
    name: "topic",
    label: "Topic",
    control: "textarea",
    placeholder: "e.g. 5 benefits of using AI for small business marketing",
    required: true,
  },
  {
    name: "content_type",
    label: "Content Type",
    control: "select",
    defaultValue: AI_CONTENT_TYPES[0],
    required: true,
  },
  {
    name: "tone",
    label: "Tone",
    control: "select",
    defaultValue: AI_CONTENT_TONES[0],
    required: true,
  },
  {
    name: "length",
    label: "Length",
    control: "select",
    defaultValue: AI_CONTENT_LENGTHS[1],
    required: true,
  },
];

export default async function AiContentWritingPage() {
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

  const costHint = Object.entries({
    Short: 2,
    Medium: 4,
    Long: 6,
  })
    .map(([length, cost]) => `${length} = ${cost}`)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          {service?.name ?? "AI Content Writing"}
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Generate blogs, social posts and ads in seconds. ({costHint})
        </p>
      </div>

      <AiContentWorkflow
        serviceKey={SERVICE_KEY}
        serviceName={service?.name ?? "AI Content Writing"}
        balance={balance}
        fields={fields}
        history={(rows ?? []) as ServiceRequestRow[]}
      />
    </div>
  );
}