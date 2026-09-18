import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import { card, muted } from "@/lib/ui";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const [{ data: userData }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profile")
      .select("uuid, name, email, phone, created_at")
      .eq("uuid", claims.claims.sub)
      .maybeSingle(),
  ]);

  const email = profile?.email ?? userData.user?.email ?? "";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">Profile</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Your account details. Name and phone are shown across the product.
        </p>
      </div>

      <section className={`${card} max-w-xl p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Account info
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-semibold text-navy">{profile?.name ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-semibold text-navy">{email || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Phone</dt>
            <dd className="font-semibold text-navy">{profile?.phone ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-semibold text-navy">{memberSince}</dd>
          </div>
        </dl>
      </section>

      <ProfileForm
        uuid={claims.claims.sub}
        name={profile?.name ?? ""}
        phone={profile?.phone ?? ""}
      />
    </div>
  );
}