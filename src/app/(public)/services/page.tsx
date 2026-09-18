import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, btnSecondary, card, cardHover, muted, sectionTitle } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Services",
};

type Service = {
  id: string;
  name: string;
  key: string;
  status: string;
};

type ServiceDetail = {
  title: string;
  description: string;
  input: string;
  processing: string;
  output: string;
};

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function findDetail(key: string): ServiceDetail {
  const k = normalizeKey(key);

  if (["website-crawler", "crawler"].includes(k) || k.includes("crawl")) {
    return {
      title: "Website Crawler",
      description:
        "Turn any website into structured data. Give us a URL and aurevon extracts titles, text, links, and metadata in seconds — ready to use, export, or feed into your other workflows.",
      input: "Paste any URL (or a list of URLs)",
      processing:
        "aurevon crawls the page and extracts titles, text, links, and metadata",
      output: "Structured, export-ready data in seconds",
    };
  }

  if (["lead-generation", "lead-generation", "leads"].includes(k) || k.includes("lead")) {
    return {
      title: "Lead Generation",
      description:
        "Stop searching manually. Tell us your target industry, location, and keywords, and aurevon finds and organizes qualified leads with contact details, ready to export.",
      input: "Your target industry, location, and keywords",
      processing:
        "aurevon finds and organizes qualified leads with contact details",
      output: "A clean, export-ready list of leads",
    };
  }

  if (["ai-content-writing", "ai-content", "content-writing"].includes(k) || k.includes("content")) {
    return {
      title: "AI Content Writing",
      description:
        "Generate blog posts, social captions, and ad copy in your tone of voice. Just describe the topic and let aurevon write the first draft for you.",
      input: "Topic, tone of voice, and content type",
      processing: "aurevon drafts content in your brand voice",
      output: "Blog posts, captions, or ad copy to edit and publish",
    };
  }

  return {
    title: "Automation Tool",
    description:
      "Give aurevon a task, and it automates the repetitive work for you, returning clean results you can export or use right away.",
    input: "Describe the input you want to provide",
    processing: "aurevon processes it automatically",
    output: "Clean output you can use immediately",
  };
}

function FlowStep({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1">
      <span
        className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
          accent ? "bg-accent text-white" : "bg-mist text-navy"
        }`}
      >
        {label}
      </span>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();

  // QUERY: select("id, name, key, status") from "services", ordered by name
  // Client context: SSR Server Component -> createServerClient (anon key, RLS applied)
  console.log("[services] Running query on services table...");
  const { data: allServices, error: servicesError } = await supabase
    .from("services")
    .select("*")
    .order("name");

  console.log(
    "[services] Query result:",
    JSON.stringify({
      data: allServices,
      error: servicesError
        ? { message: servicesError.message, code: servicesError.code, details: servicesError.details }
        : null,
    })
  );

  if (servicesError) {
    console.error(
      "[services] Failed to load services:",
      servicesError.message,
      servicesError.code,
      servicesError.details
    );
  }

  if ((allServices?.length ?? 0) === 0 && !servicesError) {
    console.error(
      "[services] services returned 0 rows with NO error — RLS is likely blocking the anon role (check SELECT policy on public.services)"
    );
  }

  const services: Service[] = allServices ?? [];

  const active = services.filter((service) => service.status === "active");
  const comingSoon = services.filter(
    (service) => service.status === "coming_soon"
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="max-w-2xl" data-reveal>
        <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
          Services
        </h1>
        <p className={`mt-4 text-lg leading-relaxed ${muted}`}>
          Choose a tool, submit your input, and let aurevon handle the
          rest. Every plan includes credits that work across all three
          services.
        </p>
      </div>

      {servicesError && (
        <div
          className="mt-10 rounded-2xl bg-accent/10 px-6 py-4 text-center ring-1 ring-accent/20"
          data-reveal
        >
          <p className="text-sm font-medium text-accent-deep">
            Couldn&apos;t load the service list: {servicesError.message}
            {servicesError.code ? ` (${servicesError.code})` : ""}
            {servicesError.details ? ` — ${servicesError.details}` : ""}
          </p>
        </div>
      )}

      {active.length > 0 ? (
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {active.map((service) => {
            const detail = findDetail(service.key);
            const anchor = normalizeKey(service.key);
            return (
              <div key={service.id} className={cardHover} data-reveal>
                <div className="flex h-full flex-col p-8">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-xl">
                    {detail.title === "Website Crawler" ? "🌐" : detail.title === "Lead Generation" ? "🎯" : "✍️"}
                  </span>
                  <h2 className="mt-5 text-xl font-bold text-navy">
                    {service.name}
                  </h2>
                  <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                    {detail.description}
                  </p>
                  <div className="mt-auto pt-6">
                    <a
                      href={`#${anchor}`}
                      className="text-sm font-semibold text-accent-deep hover:text-navy"
                    >
                      See how it works ↓
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="mx-auto mt-12 max-w-xl rounded-3xl bg-white/70 p-10 text-center ring-1 ring-navy/[0.06]"
          data-reveal
        >
          <h2 className="text-xl font-bold text-navy">No data found</h2>
          <p className={`mt-2 text-sm ${muted}`}>
            The services table returned no rows. Check the database (RLS
            policies must allow the anon role to read) and that rows have
            status = &apos;active&apos;.
          </p>
          <Link href="/signup" className={`${btnPrimary} mt-6`}>
            Sign Up Free
          </Link>
        </div>
      )}

      {comingSoon.length > 0 && (
        <>
          <h2 className={`${sectionTitle} mt-16`} data-reveal>
            Coming soon
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {comingSoon.map((service) => (
              <div key={service.id} className={card} data-reveal>
                <div className="flex h-full flex-col p-8 opacity-75">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-navy">
                      {service.name}
                    </h2>
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent-deep">
                      Coming soon
                    </span>
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                    {findDetail(service.key).description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {active.length > 0 && (
        <div className="mt-16 space-y-6">
          {services.map((service) => {
            const detail = findDetail(service.key);
            const anchor = normalizeKey(service.key);
            return (
              <section
                key={service.id}
                id={anchor}
                data-reveal
                className="scroll-mt-28 rounded-3xl bg-white p-8 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05] sm:p-10"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-navy">
                      {service.name}
                    </h2>
                    <p className={`mt-2 max-w-2xl leading-relaxed ${muted}`}>
                      {detail.description}
                    </p>
                  </div>
                  <Link href={`/dashboard/${service.key}`} className={btnSecondary}>
                    Open in Dashboard
                  </Link>
                </div>

                <div className="mt-8 flex flex-col gap-8 rounded-2xl bg-mist/40 p-6 sm:p-8 lg:flex-row lg:gap-10">
                  <FlowStep label="Input" text={detail.input} />
                  <div className="hidden lg:block">
                    <div className="flex size-10 items-center justify-center rounded-full bg-accent text-white">
                      →
                    </div>
                  </div>
                  <FlowStep label="Processing" text={detail.processing} />
                  <div className="hidden lg:block">
                    <div className="flex size-10 items-center justify-center rounded-full bg-accent text-white">
                      →
                    </div>
                  </div>
                  <FlowStep label="Output" text={detail.output} accent />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div
        className="mt-16 rounded-3xl bg-white/70 p-8 text-center ring-1 ring-navy/[0.06]"
        data-reveal
      >
        <h2 className="text-2xl font-bold tracking-tight text-navy">
          Not sure which plan fits?
        </h2>
        <p className={`mx-auto mt-2 max-w-lg ${muted}`}>
          Every plan includes monthly credits that work across all our
          services. Compare plans and sign up in minutes.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/pricing" className={btnPrimary}>
            View Pricing
          </Link>
          <Link href="/signup" className={btnSecondary}>
            Sign Up Free
          </Link>
        </div>
      </div>
    </div>
  );
}