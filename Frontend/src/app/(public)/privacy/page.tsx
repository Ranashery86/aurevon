import type { Metadata } from "next";
import Link from "next/link";
import { btnSecondary, muted } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="text-center" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          Privacy Policy
        </h1>
        <p className={`mt-4 text-lg leading-relaxed ${muted}`}>
          Last updated: January 2026
        </p>
      </div>

      <div
        className="mt-12 space-y-8 rounded-3xl bg-white/70 p-8 ring-1 ring-navy/[0.06] sm:p-10"
        data-reveal
      >
        <section>
          <h2 className="text-xl font-bold text-navy">Overview</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            This placeholder page describes the privacy policy for aurevon.
            Full details will be published here soon.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-navy">Data we collect</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            We collect the information you provide when you create an account,
            submit a request, or contact us — such as your name, email address,
            and the content you ask our services to process.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-navy">How we use it</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            Your data is used to deliver our services, manage your account and
            credits, respond to support requests, and improve the platform.
          </p>
        </section>

        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link href="/" className={btnSecondary}>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}