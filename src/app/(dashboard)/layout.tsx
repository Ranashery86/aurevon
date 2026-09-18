import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { LiveRefresh } from "@/components/live-refresh";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const [{ data: services }, { data: creditRows }, { data: profile }] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, key")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("credit_transactions")
        .select("amount")
        .eq("uuid", claims.claims.sub),
      supabase
        .from("profile")
        .select("name")
        .eq("uuid", claims.claims.sub)
        .maybeSingle(),
    ]);

  const balance =
    creditRows?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? 0;

  return (
    <div className="flex min-h-screen w-full">
      <LiveRefresh />
      <DashboardSidebar services={services ?? []} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-end gap-4 border-b border-navy/[0.06] bg-white/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3 text-sm">
            {profile?.name && (
              <span className="hidden font-semibold text-navy sm:block">
                Hi, {profile.name.split(" ")[0]} 👋
              </span>
            )}
            <span className="font-semibold text-slate-500">Credits</span>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent-deep">
              {balance}
            </span>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}