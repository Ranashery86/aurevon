import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActivationPoller } from "@/components/activation-poller";
import { UsageBarChart } from "@/components/usage-bar-chart";
import { CreditsDonut } from "@/components/credits-donut";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const paymentSuccess = payment === "success";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const userId = claims.claims.sub as string;

  const [{ data: recentRequests }, { data: services }, { data: sub }, { data: creditRows }] =
    await Promise.all([
      supabase
        .from("service_requests")
        .select("*")
        .eq("uuid", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("services")
        .select("id, name, key, status")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("subscriptions")
        .select("id, status, plan_id, plans(id, name, monthly_credits)")
        .eq("uuid", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("amount, service_key")
        .eq("uuid", userId),
    ]);

  const plan = sub?.plans as { name: string; monthly_credits: number } | undefined;
  const totalCredits = plan?.monthly_credits ?? 0;
  const rows = creditRows ?? [];
  const balance = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const usedCredits = rows.reduce(
    (sum, row) => sum + (Number(row.amount) < 0 ? Math.abs(Number(row.amount)) : 0),
    0
  );
  const remainingCredits = balance;

  const isTrialOrNoPlan = !plan || String(plan.name).toLowerCase().includes("trial");
  const showUpgradePrompt = isTrialOrNoPlan && remainingCredits <= 0;

  const paymentPending = paymentSuccess && !sub;

  const progressPercent =
    totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;

  const serviceNameByKey = new Map((services ?? []).map((s) => [s.key, s.name]));
  const usedByService = new Map<string, number>();
  let otherUsed = 0;
  for (const row of rows) {
    const amount = Number(row.amount ?? 0);
    if (amount >= 0) continue;
    const key = row.service_key;
    const amountUsed = Math.abs(amount);
    if (key) {
      const name = serviceNameByKey.get(key) ?? key;
      usedByService.set(name, (usedByService.get(name) ?? 0) + amountUsed);
    } else {
      otherUsed += amountUsed;
    }
  }
  const usageChartData = (services ?? []).map((service) => ({
    name: service.name,
    used: usedByService.get(service.name) ?? 0,
  }));
  if (otherUsed > 0) {
    usageChartData.push({ name: "Other", used: otherUsed });
  }
  const donutRemaining = Math.max(0, totalCredits - usedCredits);

  return (
    <div className="space-y-6">
      {paymentPending ? (
        <ActivationPoller message="Payment received! Activating your plan and credits" />
      ) : paymentSuccess ? (
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 rounded-2xl bg-emerald-50 px-6 py-4 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-800">
            Payment successful — your plan and credits have been activated.
          </p>
          <Link
            href="/dashboard"
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
          >
            ×
          </Link>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          Dashboard
        </h1>
        <p className="mt-1 text-slate-500">
          Welcome back. Here&apos;s an overview of your usage.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
              Current plan
            </h2>
            <p className="mt-2 text-2xl font-bold tracking-tight text-navy">
              {plan?.name ?? "No plan"}
            </p>
          </div>
          {showUpgradePrompt && (
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep"
            >
              Upgrade your plan
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-mist/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Credits this cycle
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-navy">
              {totalCredits}
            </p>
          </div>
          <div className="rounded-xl bg-mist/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Credits used
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-accent-deep">
              {usedCredits}
            </p>
          </div>
          <div className="rounded-xl bg-mist/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Credits remaining
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-navy">
              {remainingCredits}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Used {progressPercent}% of this cycle&apos;s credits</span>
            <span>
              {usedCredits} / {totalCredits}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-navy">
          Quick access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/dashboard/profile",
              label: "Profile",
              desc: "Your name, email, and phone",
            },
            {
              href: "/dashboard/credits",
              label: "Credits & Billing",
              desc: "Balance and transaction history",
            },
            {
              href: "/dashboard/settings",
              label: "Settings",
              desc: "Update email or password",
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl bg-mist/40 p-5 ring-1 ring-navy/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:bg-mist hover:shadow-md"
            >
              <h3 className="font-bold text-navy group-hover:text-accent-deep">
                {link.label}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{link.desc}</p>
            </Link>
          ))}

          {services?.map((service) => (
            <Link
              key={service.id}
              href={`/dashboard/${service.key}`}
              className="group rounded-xl bg-mist/40 p-5 ring-1 ring-navy/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:bg-mist hover:shadow-md"
            >
              <h3 className="font-bold text-navy group-hover:text-accent-deep">
                {service.name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">Open the tool</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-navy">
          Usage chart
        </h2>
        <UsageBarChart data={usageChartData} />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-navy">
          Service usage breakdown
        </h2>
        <CreditsDonut
          used={usedCredits}
          remaining={donutRemaining}
          total={totalCredits}
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-navy">
          Recent activity
        </h2>
        {recentRequests && recentRequests.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-2">Date</th>
                <th className="pb-2">Service</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRequests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b border-navy/[0.04] last:border-0"
                >
                  <td className="py-2.5 text-slate-500">
                    {new Date(request.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 font-medium text-navy">
                    {request.service_name ?? request.service_key ?? "—"}
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-deep">
                      {request.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">
            No activity yet. Your service requests will appear here.
          </p>
        )}
      </section>
    </div>
  );
}