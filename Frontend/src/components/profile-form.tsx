"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { card, muted } from "@/lib/ui";

const inputClasses =
  "w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50";

export function ProfileForm({
  uuid,
  name: initialName,
  phone: initialPhone,
}: {
  uuid: string;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);

    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from("profile").update({ name, phone }).eq("uuid", uuid),
      supabase.auth.updateUser({ data: { name, phone } }),
    ]);

    if (profileError || authError) {
      setError(profileError?.message ?? authError?.message ?? "Update failed.");
      setStatus("idle");
      return;
    }

    setStatus("success");
    router.refresh();
  }

  return (
    <section className={`${card} max-w-xl p-6`}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
        Edit profile
      </h2>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={status === "loading"}
            placeholder="Your name"
            className={inputClasses}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            disabled={status === "loading"}
            autoComplete="tel"
            placeholder="+92 300 1234567"
            className={inputClasses}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {status === "success" && (
          <p role="status" className="text-sm font-semibold text-emerald-600">
            Profile updated.
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:opacity-50"
        >
          {status === "loading" ? "Saving\u2026" : "Save changes"}
        </button>
      </form>

      <p className={`mt-4 text-xs ${muted}`}>
        To change your email, open the Settings page.
      </p>
    </section>
  );
}