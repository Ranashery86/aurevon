"use client";

import { useState } from "react";
import { card, btnPrimary, muted } from "@/lib/ui";
import {
  MAX_URLS_TECH_STACK,
  TECH_STACK_MIN_URLS,
  TECH_STACK_RATE_PER_URL,
  getTechStackCost,
} from "@/lib/services/costs";
import {
  TECH_STACK_CATEGORIES,
  detectionsFor,
  parseTechStackResults,
  type DetectedTechnology,
  type TechStackCategory,
  type TechStackConfidence,
  type TechStackSiteResult,
} from "@/lib/services/tech-stack";
import {
  useServiceRequestHistory,
  isProcessingRequest,
  isResolvedRequest,
} from "@/hooks/use-service-request-history";
import {
  HistoryTable,
  Spinner,
  UpgradeNotice,
} from "@/components/service-workflow-shared";
import {
  MultiUrlInput,
  useMultiUrlInput,
} from "@/components/multi-url-input";
import type { ServiceField, ServiceRequestRow } from "@/lib/services/types";

type TechStackWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  balance: number;
  fields: ServiceField[];
  history: ServiceRequestRow[];
};

// High = green, Medium = yellow, Low = gray. Matches the emerald/red/neutral
// severity language used by statusStyles() in service-workflow-shared.
function confidenceStyles(confidence: TechStackConfidence): string {
  switch (confidence) {
    case "High":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "Medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function siteTabLabel(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function formatUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function isUnreachable(site: TechStackSiteResult): boolean {
  return site.status === "failed";
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block text-xs text-slate-400 transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
    >
      &#9656;
    </span>
  );
}

// One detected technology: name, confidence badge, and a small expandable
// evidence list explaining why it was detected. The toggle only appears when
// there is evidence to show, so it never expands to nothing.
function TechnologyRow({ technology }: { technology: DetectedTechnology }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasEvidence = technology.evidence.length > 0;

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-navy">{technology.name}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${confidenceStyles(
            technology.confidence
          )}`}
        >
          {technology.confidence}
        </span>
        {hasEvidence && (
          <button
            type="button"
            onClick={() => setShowEvidence((open) => !open)}
            aria-expanded={showEvidence}
            className="text-xs font-semibold text-accent-deep underline underline-offset-2 hover:text-navy"
          >
            {showEvidence ? "Hide evidence" : `Why? (${technology.evidence.length})`}
          </button>
        )}
      </div>

      {hasEvidence && showEvidence && (
        <ul className="mt-2 space-y-1 border-l-2 border-navy/10 pl-3">
          {technology.evidence.map((reason, index) => (
            <li key={index} className="text-xs leading-relaxed text-slate-500">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// One category row. Categories are always rendered in the fixed
// TECH_STACK_CATEGORIES order so the user sees full coverage. A category with
// zero detections stays collapsed and grayed out rather than being hidden, and
// is not interactive — there is nothing to expand.
function CategorySection({
  category,
  technologies,
}: {
  category: TechStackCategory;
  technologies: DetectedTechnology[];
}) {
  const hasDetections = technologies.length > 0;
  const [expanded, setExpanded] = useState(hasDetections);

  return (
    <div
      className={`overflow-hidden rounded-xl ring-1 ${
        hasDetections ? "bg-white ring-navy/[0.08]" : "bg-slate-50/60 ring-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        disabled={!hasDetections}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          hasDetections ? "cursor-pointer hover:bg-mist/50" : "cursor-default"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Chevron expanded={expanded} />
          <span
            className={`truncate text-sm font-bold ${
              hasDetections ? "text-navy" : "text-slate-400"
            }`}
          >
            {category}
          </span>
        </span>
        <span
          className={`shrink-0 text-xs font-bold ${
            hasDetections ? "text-accent-deep" : "text-slate-400"
          }`}
        >
          {hasDetections
            ? `${technologies.length} detected`
            : "None detected"}
        </span>
      </button>

      {hasDetections && expanded && (
        <ul className="divide-y divide-navy/[0.06] border-t border-navy/[0.06] px-4">
          {technologies.map((technology, index) => (
            <TechnologyRow
              key={`${technology.name}-${index}`}
              technology={technology}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// The report for one URL: summary header, then all 12 categories in order.
function SiteReport({ site }: { site: TechStackSiteResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-mist/40 px-4 py-3">
        <p className="truncate text-sm font-bold text-navy">{site.url}</p>
        <p className="mt-0.5 text-sm font-semibold text-accent-deep">
          {site.total_technologies_found} technologies found across{" "}
          {site.categories_scanned} categories
        </p>
      </div>

      <div className="space-y-2">
        {TECH_STACK_CATEGORIES.map((category) => (
          <CategorySection
            key={category}
            category={category}
            technologies={detectionsFor(site, category)}
          />
        ))}
      </div>
    </div>
  );
}

// Multi-URL results with one tab per site. Mounted with a `key` of the request
// id by the parent, so switching (or re-opening) a request remounts this and
// the active tab naturally resets to the first site — no state syncing needed.
function TechStackResults({ results }: { results: TechStackSiteResult[] }) {
  const [activeSiteIndex, setActiveSiteIndex] = useState(0);

  const completed = results.filter((site) => !isUnreachable(site));
  // Clamp so a stale index can never point past the end of a shorter list.
  const siteIndex = Math.min(activeSiteIndex, Math.max(0, results.length - 1));
  const activeSite = results[siteIndex] ?? null;

  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/40 px-4 py-3">
        <p className="text-sm font-semibold text-navy">
          {completed.length} of {results.length} sites scanned successfully
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {results.map((site, index) => {
          const active = index === siteIndex;
          const unreachable = isUnreachable(site);
          return (
            <button
              key={index}
              type="button"
              onClick={() => setActiveSiteIndex(index)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-navy bg-navy text-white"
                  : "border-navy/10 bg-white text-navy hover:bg-mist"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  unreachable ? "bg-red-400" : "bg-emerald-400"
                }`}
              />
              <span className="max-w-44 truncate">{siteTabLabel(site.url)}</span>
            </button>
          );
        })}
      </div>

      {!activeSite ? (
        <p className="text-sm text-slate-500">No site selected.</p>
      ) : isUnreachable(activeSite) ? (
        <div className="rounded-xl bg-red-50 px-6 py-10 text-center ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-700">
            This site was unreachable
          </p>
          <p className="mt-1 break-all text-sm text-red-600/80">
            {activeSite.url}
          </p>
          <p className="mt-1 text-sm text-red-600/80">
            aurevon could not fetch this site, so no technologies could be
            detected. It may be down, blocking automated traffic, or the URL
            may be wrong.
          </p>
          <a
            href={formatUrl(activeSite.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-semibold text-accent-deep underline underline-offset-2 hover:text-navy"
          >
            Try opening it in your browser
          </a>
        </div>
      ) : (
        <SiteReport key={activeSite.url || siteIndex} site={activeSite} />
      )}
    </div>
  );
}

export function TechStackDetectorWorkflow({
  serviceKey,
  serviceName,
  balance,
  fields,
  history: initialHistory,
}: TechStackWorkflowProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Shared multi-URL input (manual entry or Excel/CSV upload) — identical
  // behavior and spreadsheet conventions to the other multi-URL services.
  const input = useMultiUrlInput();
  const { urls, parseError } = input;

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

  // Live credit preview. getTechStackCost() is the shared source of truth and
  // returns a number for any valid list (1-15 URLs); outside that range it
  // returns null, so fall back to the same rate × count purely for display
  // (0 URLs = 0 credits) rather than showing a misleading "0 credits".
  const cost = getTechStackCost(urls) ?? urls.length * TECH_STACK_RATE_PER_URL;
  const canAfford = balance >= cost;
  const overLimit = urls.length > MAX_URLS_TECH_STACK;
  const isBusy = submitting || isProcessingRequest(activeRequest);
  const submitDisabled =
    submitting || !canAfford || overLimit || urls.length < TECH_STACK_MIN_URLS;

  // Results are only read once the request is resolved; parseTechStackResults
  // normalizes the stored callback payload into the render contract.
  const results =
    isResolvedRequest(activeRequest) && activeRequest
      ? parseTechStackResults(activeRequest.output)
      : [];

  const failedMessage =
    activeRequest?.status === "failed"
      ? ((activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No results were generated.")
      : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (urls.length < TECH_STACK_MIN_URLS || urls.length > MAX_URLS_TECH_STACK)
      return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      // The trigger route re-validates the list, re-checks the balance and
      // fires the n8n webhook as { request_id, user_id, input: { urls } }.
      // Credits are NOT deducted here — the shared callback deducts the exact
      // quoted amount once the workflow completes (getServiceCreditCost).
      const response = await fetch(`/api/services/${serviceKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { urls } }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        request_id?: string;
        error?: string;
      };

      if (!response.ok || !body.request_id) {
        setSubmitError(body.error ?? "Something went wrong. Please try again.");
        return;
      }

      launchRequest(body.request_id, {
        id: body.request_id,
        uuid: "",
        service_name: serviceName,
        service_key: serviceKey,
        status: "processing",
        input: { urls },
        output: null,
        created_at: new Date().toISOString(),
      });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Input panel ─────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Input
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Detect the technology stack behind {TECH_STACK_MIN_URLS}&ndash;
          {MAX_URLS_TECH_STACK} websites &mdash; CMS, frameworks, hosting,
          analytics, payment and more. {TECH_STACK_RATE_PER_URL} credits per
          URL, and every one of the {TECH_STACK_CATEGORIES.length} categories
          is reported even when nothing is found.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <MultiUrlInput state={input} idPrefix="tech-stack-urls" />

          <p className="text-sm font-semibold text-accent-deep">
            {urls.length} URLs found · {cost} credits ({TECH_STACK_RATE_PER_URL}{" "}
            credits × {urls.length} URLs)
          </p>

          {overLimit && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
              Up to {MAX_URLS_TECH_STACK} URLs are allowed per run. You have{" "}
              {urls.length} &mdash; please remove{" "}
              {urls.length - MAX_URLS_TECH_STACK} to continue.
            </p>
          )}

          {!overLimit && !parseError && urls.length < TECH_STACK_MIN_URLS && (
            <p className="text-sm text-slate-500">
              Add at least {TECH_STACK_MIN_URLS} URL to continue.
            </p>
          )}

          {!canAfford && !overLimit ? (
            <UpgradeNotice cost={cost} />
          ) : (
            <button
              type="submit"
              disabled={submitDisabled}
              className={`${btnPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {submitting ? "Submitting…" : `Detect Tech Stack (${cost} credits)`}
            </button>
          )}

          {submitError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
              {submitError}
            </p>
          )}
        </form>
      </section>

      {/* ── Output panel ────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Output
        </h2>

        {isBusy ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <Spinner />
            <p className="text-sm font-semibold text-navy">Detecting…</p>
            <p className="text-sm text-slate-500">
              {urls.length > 1
                ? `${urls.length} sites are being scanned. Results usually appear within a few minutes.`
                : "Your site is being scanned. Results usually appear within a few minutes."}
            </p>
          </div>
        ) : failedMessage ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-red-50 px-6 py-12 text-center ring-1 ring-red-200">
            <p className="text-sm font-semibold text-red-700">
              This request failed
            </p>
            <p className="text-sm text-red-600/80">{failedMessage}</p>
          </div>
        ) : results.length > 0 ? (
          <TechStackResults
            key={activeRequest?.id ?? "tech-stack-results"}
            results={results}
          />
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              Your tech stack results will appear here once ready.
            </p>
          </div>
        )}
      </section>

      {/* ── History ───────────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          History
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Previous scans. Click a row to re-open its result.
        </p>

        <HistoryTable
          history={history}
          fields={fields}
          onOpen={openRequest}
          formatCell={(field, storedInput) => {
            if (field.name === "urls") {
              const list = Array.isArray(storedInput?.urls)
                ? (storedInput.urls as string[])
                : [];
              return list.length === 1 ? "1 website" : `${list.length} websites`;
            }
            return undefined;
          }}
          emptyMessage="No scans yet. Your first run will appear here."
        />
      </section>
    </div>
  );
}
