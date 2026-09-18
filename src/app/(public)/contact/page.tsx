"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        className="mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center"
        data-reveal
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-lg shadow-accent/30">
          ✓
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy">
          Thanks for reaching out
        </h1>
        <p className="mt-2 text-slate-500">
          We&apos;ve received your message and will get back to you shortly.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/" className={btnPrimary}>
            Back to Home
          </Link>
          <Link href="/services" className={btnSecondary}>
            Explore Services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="text-center" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          Contact Us
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-500">
          Have a question about aurevon, a specific plan, or a feature
          request? Send us a message and we&apos;ll get back to you.
        </p>
      </div>

      <div
        className="mt-10 rounded-3xl bg-white p-8 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05] sm:p-10"
        data-reveal
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-semibold text-navy"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Your name"
              className="w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-navy"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="mb-1.5 block text-sm font-semibold text-navy"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              placeholder="How can we help?"
              className="w-full resize-none rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>

          <button type="submit" className={`${btnPrimary} w-full py-3.5`}>
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}