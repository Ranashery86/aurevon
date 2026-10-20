import type { Metadata } from "next";
import Link from "next/link";
import { btnPrimary, btnSecondary, cardHover, muted, sectionTitle } from "@/lib/ui";

export const metadata: Metadata = {
  title: "About",
};

const beliefs = [
  {
    title: "Simplicity over complexity",
    description:
      "Powerful automation shouldn't require a manual. We design every tool to be obvious from the first click.",
  },
  {
    title: "Automation that scales with you",
    description:
      "Start with a single workflow and grow into an entire automated stack — without redoing your setup.",
  },
  {
    title: "Transparent, usage-based pricing",
    description:
      "You pay for what you use, in simple monthly credits. No hidden fees, no surprise invoices.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-3xl text-center" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          We built aurevon to remove busywork from growth
        </h1>
        <p className={`mt-6 text-lg leading-relaxed ${muted}`}>
          aurevon started with a simple observation: teams spend too much
          time on repetitive tasks — manually researching leads, copying data
          from websites, and writing the same kinds of content over and over.
          We built aurevon to automate that work, so teams can focus on
          strategy and execution instead of manual research and writing.
        </p>
        <p className={`mt-5 text-lg leading-relaxed ${muted}`}>
          Our platform runs on an automation engine behind the scenes, which
          means new capabilities get added regularly without disrupting how you
          already work. We started with three core tools — Website Crawler,
          Lead Generation, and AI Content Writing — and we&apos;re building
          more based on what our users need most.
        </p>
        <p className={`mt-5 text-lg leading-relaxed ${muted}`}>
          Our goal is simple: give individuals and small teams the same
          automation leverage that used to require a much bigger team and
          budget.
        </p>
      </div>

      <div className="mt-16">
        <h2 className={`${sectionTitle} text-center`} data-reveal>
          What we believe
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {beliefs.map((belief) => (
            <div key={belief.title} className={cardHover} data-reveal>
              <div className="p-8">
                <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-lg font-black text-accent-deep">
                  ✓
                </span>
                <h3 className="mt-5 text-lg font-bold text-navy">
                  {belief.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                  {belief.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-16 flex flex-col items-center gap-4 rounded-3xl bg-white/70 p-10 text-center ring-1 ring-navy/[0.06]"
        data-reveal
      >
        <h2 className={`${sectionTitle} text-2xl`}>Want to learn more?</h2>
        <p className={`max-w-lg ${muted}`}>
          Browse our pricing, explore the services, or reach out directly —
          we&apos;re happy to help.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <Link href="/pricing" className={btnPrimary}>
            View Pricing
          </Link>
          <Link href="/contact" className={btnSecondary}>
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}