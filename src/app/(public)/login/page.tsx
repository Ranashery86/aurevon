"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { logoMark, muted } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setStatus("idle");
      return;
    }

    router.replace("/dashboard");
  }

  const inputClasses =
    "w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl bg-white/90 p-10 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.2)] ring-1 ring-navy/[0.05] backdrop-blur">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className={logoMark}>a</span>
            <span className="text-lg font-bold tracking-tight text-navy">
              {site.name}
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
            Welcome back
          </h1>
          <p className={`mt-2 text-sm ${muted}`}>
            Log in to your dashboard and pick up where you left off.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === "loading"}
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={status === "loading"}
              autoComplete="current-password"
              placeholder="Your password"
              className={inputClasses}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:opacity-50"
          >
            {status === "loading" ? "Signing in\u2026" : "Log in"}
          </button>
        </form>

        <p className={`mt-6 text-center text-sm ${muted}`}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-accent-deep hover:text-navy">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}