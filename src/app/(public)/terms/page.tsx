import type { Metadata } from "next";
import Link from "next/link";
import { btnSecondary, muted } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="text-center" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          Terms of Service
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
          <h2 className="text-xl font-bold text-navy">Using aurevon</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            This placeholder page describes the terms of service for aurevon.
            Full details will be published here soon.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-navy">Credits &amp; billing</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            Plans are billed monthly and include credits that can be used
            across our services. Unused credits do not roll over between
            billing periods.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-navy">Acceptable use</h2>
          <p className={`mt-3 leading-relaxed ${muted}`}>
            You agree not to misuse our services — including automating
            harassment, spamming, scraping protected content, or anything that
            violates applicable law or third-party rights.
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