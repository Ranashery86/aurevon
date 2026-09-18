"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { card, muted } from "@/lib/ui";

const inputClasses =
  "w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50";

export default function SettingsPage() {
  const supabase = createClient();

  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "loading" | "success"
  >("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "loading" | "success"
  >("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  async function handleEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    setEmailMsg(null);
    setEmailStatus("loading");

    const { error } = await supabase.auth.updateUser({ email });

    if (error) {
      setEmailError(error.message);
      setEmailStatus("idle");
      return;
    }

    setEmail("");
    setEmailMsg("Verification email sent. Confirm it to update your email.");
    setEmailStatus("success");
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMsg(null);
    setPasswordStatus("loading");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPasswordError(error.message);
      setPasswordStatus("idle");
      return;
    }

    setPassword("");
    setPasswordMsg("Password updated successfully.");
    setPasswordStatus("success");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">Settings</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Manage your account email and password.
        </p>
      </div>

      <section className={`${card} max-w-xl p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Account email
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Current: <span className="font-semibold text-navy">{currentEmail ?? "Loading\u2026"}</span>
        </p>

        <form onSubmit={handleEmailChange} className="mt-4 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            New email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={emailStatus === "loading"}
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClasses}
            />
          </label>

          {emailError && (
            <p role="alert" className="text-sm text-red-500">
              {emailError}
            </p>
          )}
          {emailMsg && (
            <p role="status" className="text-sm font-semibold text-emerald-600">
              {emailMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={emailStatus === "loading"}
            className="inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:opacity-50"
          >
            {emailStatus === "loading" ? "Sending\u2026" : "Update email"}
          </button>
        </form>
      </section>

      <section className={`${card} max-w-xl p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Change password
        </h2>

        <form
          onSubmit={handlePasswordChange}
          className="mt-4 flex flex-col gap-4"
          noValidate
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={passwordStatus === "loading"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={inputClasses}
            />
          </label>

          {passwordError && (
            <p role="alert" className="text-sm text-red-500">
              {passwordError}
            </p>
          )}
          {passwordMsg && (
            <p role="status" className="text-sm font-semibold text-emerald-600">
              {passwordMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={passwordStatus === "loading"}
            className="inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent-deep disabled:opacity-50"
          >
            {passwordStatus === "loading" ? "Updating\u2026" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}