import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/faq";
import {
  badge,
  btnPrimary,
  btnSecondary,
  card,
  cardHover,
  muted,
  sectionTitle,
} from "@/lib/ui";

export const metadata: Metadata = {
  title: "Home",
};

const floatingStats = [
  {
    label: "Leads found",
    value: "128",
    trend: "+18 this week",
    className: "rotate-[-1.5deg]",
  },
  {
    label: "Pages crawled",
    value: "540",
    trend: "Auto-scheduled",
    className: "translate-y-3 rotate-[1deg]",
  },
  {
    label: "Content generated",
    value: "96",
    trend: "In brand voice",
    className: "rotate-[-1deg]",
  },
];

const barHeights = [40, 65, 45, 80, 58, 92, 70];

const benefits = [
  {
    icon: "🌐",
    title: "Website Crawler",
    description:
      "Pull data from the web automatically. Give us a URL and get structured, export-ready data in seconds.",
  },
  {
    icon: "🎯",
    title: "Lead Generation",
    description:
      "Find qualified leads without manual research. Set your industry, location, and keywords — we do the rest.",
  },
  {
    icon: "✍️",
    title: "AI Content Writing",
    description:
      "Generate on-brand content in seconds. Blog posts, social captions, and ad copy from a simple prompt.",
  },
];

const steps = [
  {
    number: "01",
    title: "Sign Up",
    description:
      "Create your free account in under a minute. You'll get starting credits to explore every tool.",
  },
  {
    number: "02",
    title: "Submit Input",
    description:
      "Tell aurevon what you need — a URL to crawl, a lead profile, or a content brief.",
  },
  {
    number: "03",
    title: "Get Output",
    description:
      "Receive structured data or finished drafts instantly, ready to export or use in your workflows.",
  },
];

const testimonials = [
  {
    initials: "AM",
    name: "Aarav Mehta",
    role: "Founder, NovaLand",
    quote:
      "aurevon replaced three tools we were juggling. Lead lists that used to take a week now take minutes.",
  },
  {
    initials: "SC",
    name: "Sara Chen",
    role: "Marketing Lead, Brightpath",
    quote:
      "Content drafts come out shockingly close to final. Our team spends more time on story, less on the first draft.",
  },
  {
    initials: "DR",
    name: "Diego Ramírez",
    role: "Operations, Fieldnotes",
    quote:
      "The credit system makes budgeting so simple. We know exactly what we're spending every month.",
  },
];

const faqItems = [
  {
    question: "How does the credit system work?",
    answer:
      "Every plan includes a monthly credit balance. Each time you run a service — crawling a site, generating leads, or writing content — a small amount of credits is deducted based on the size of the job. Your balance resets each month, so you always know exactly what you're working with. You can top up anytime if you need more.",
  },
  {
    question: "Can I upgrade or downgrade my plan anytime?",
    answer:
      "Yes. You can switch plans at any time — upgrades take effect immediately and downgrades apply at the start of your next billing cycle. Your credits are always yours to use, so there's no lock-in.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. All data is transmitted over encrypted connections and stored in a secure, access-controlled database. We only use your submitted inputs to fulfill your requests, and you can delete your account and data at any time.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. Every new account starts on a free trial with a small starter credit balance, so you can try the Website Crawler, Lead Generation, and AI Content Writing before committing to a paid plan.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
        <div>
          <span className={badge}>✨ AI-powered growth toolkit</span>
          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-5xl lg:text-6xl">
            Automate your growth with AI-powered tools
          </h1>
          <p
            className={`mt-6 max-w-xl text-lg leading-relaxed ${muted}`}
          >
            aurevon helps businesses generate leads, extract web data, and
            create content automatically — so your team can focus on strategy
            and execution instead of manual research and writing.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/signup" className={btnPrimary}>
              Try for free
            </Link>
            <Link href="/pricing" className={btnSecondary}>
              See Pricing
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-white/70 to-accent/10 blur-2xl" />
          <div className="grid grid-cols-2 gap-5">
            {floatingStats.map((stat) => (
              <div key={stat.label} className={card}>
                <div className={`p-6 ${stat.className}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-navy">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs font-medium text-accent-deep">
                    {stat.trend}
                  </p>
                </div>
              </div>
            ))}
            <div className={card}>
              <div className="flex h-full flex-col justify-between p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Requests
                </p>
                <div className="mt-3 flex h-16 items-end gap-1.5">
                  {barHeights.map((height, index) => (
                    <span
                      key={index}
                      style={{ height: `${height}%` }}
                      className={`flex-1 rounded-full ${
                        index === 5 ? "bg-accent" : "bg-mist"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats / quick points */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={cardHover}>
            <div className="p-6 text-center">
              <p className="text-2xl font-bold text-navy">⚡ Fast setup</p>
              <p className={`mt-1.5 text-sm ${muted}`}>
                Get running in minutes, not weeks.
              </p>
            </div>
          </div>
          <div className={cardHover}>
            <div className="p-6 text-center">
              <p className="text-2xl font-bold text-navy">💳 Pay-as-you-grow credits</p>
              <p className={`mt-1.5 text-sm ${muted}`}>
                Simple monthly credits, no surprise bills.
              </p>
            </div>
          </div>
          <div className={cardHover}>
            <div className="p-6 text-center">
              <p className="text-2xl font-bold text-navy">🧰 3 automation tools in one dashboard</p>
              <p className={`mt-1.5 text-sm ${muted}`}>
                Crawl, generate leads, and write content together.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why teams use aurevon */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="max-w-2xl">
          <h2 className={sectionTitle}>Why teams use aurevon</h2>
          <p className={`mt-4 text-lg leading-relaxed ${muted}`}>
            Three core tools that turn repetitive growth tasks into one
            automated workflow.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {benefits.map((benefit) => (
            <Link key={benefit.title} href="/services" className={cardHover}>
              <div className="p-8">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-2xl">
                  {benefit.icon}
                </span>
                <h3 className="mt-5 text-xl font-bold text-navy">
                  {benefit.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                  {benefit.description}
                </p>
                <p className="mt-5 text-sm font-semibold text-accent-deep">
                  Learn more →
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="text-center">
          <h2 className={sectionTitle}>How it works</h2>
          <p className={`mx-auto mt-4 max-w-xl text-lg leading-relaxed ${muted}`}>
            Three steps between you and automated growth.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.number} className={cardHover}>
              <div className="relative p-8">
                <span className="flex size-12 items-center justify-center rounded-full bg-accent text-base font-bold text-white shadow-lg shadow-accent/30">
                  {step.number}
                </span>
                {index < steps.length - 1 && (
                  <span className="absolute right-[-18px] top-12 hidden text-2xl text-accent lg:block">
                    →
                  </span>
                )}
                <h3 className="mt-5 text-xl font-bold text-navy">{step.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="text-center">
          <h2 className={sectionTitle}>Loved by growing teams</h2>
          <p className={`mx-auto mt-4 max-w-xl text-lg leading-relaxed ${muted}`}>
            See how teams use aurevon to move faster every day.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure key={testimonial.name} className={cardHover}>
              <div className="p-8">
                <p className="text-sm text-accent">★★★★★</p>
                <blockquote className={`mt-4 text-sm leading-relaxed ${muted}`}>
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                    {testimonial.initials}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-navy">
                      {testimonial.name}
                    </p>
                    <p className="text-xs text-slate-400">{testimonial.role}</p>
                  </div>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className={sectionTitle}>Frequently asked questions</h2>
            <p className={`mt-4 text-lg leading-relaxed ${muted}`}>
              Everything you need to know about credits, plans, and how
              aurevon works.
            </p>
          </div>
          <Faq items={faqItems} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-deep px-8 py-16 text-center shadow-[0_32px_64px_-32px_rgba(15,42,74,0.6)] sm:px-16">
          <div className="absolute -left-16 -top-16 size-48 rounded-full bg-accent/20 blur-2xl" />
          <div className="absolute -bottom-16 -right-16 size-48 rounded-full bg-mist/20 blur-2xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Automate your growth today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
              Join teams that stopped doing busywork. Start free, pick a plan,
              and let aurevon handle the repetitive stuff.
            </p>
            <Link
              href="/signup"
              className={`${btnPrimary} mt-8 px-8 py-3.5 text-base`}
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}