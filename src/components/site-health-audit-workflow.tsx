"use client";

import { useMemo, useState } from "react";
import { card, btnPrimary, btnSecondary, btnNavy, muted } from "@/lib/ui";
import {
  getSiteHealthAuditCost,
  looksLikeUrlOrDomain,
  normalizeUrl,
} from "@/lib/services/costs";
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
import type {
  ServiceField,
  ServiceRequestRow,
  ServiceResultRow,
} from "@/lib/services/types";

const TIERS = [
  { pages: 5, label: "Quick" },
  { pages: 15, label: "Standard" },
  { pages: 30, label: "Deep" },
] as const;

type SiteHealthAuditWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  balance: number;
  fields: ServiceField[];
  history: ServiceRequestRow[];
};

type AiBotAccessRow = {
  bot?: unknown;
  operator?: unknown;
  purpose?: unknown;
  status?: unknown;
};

type PageRow = ServiceResultRow;

type SiteHealthOutput = {
  scores?: Record<string, unknown> | null;
  site_level?: Record<string, unknown> | null;
  structured_data?: Record<string, unknown> | null;
  js_rendering_risk?: unknown;
  pages?: unknown[];
};

const PAGE_CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "url", label: "URL" },
  { key: "title", label: "Title" },
  { key: "meta_description_status", label: "Meta Description" },
  { key: "h1_count", label: "H1" },
  { key: "alt_text_percentage", label: "Alt-Text %" },
  { key: "word_count", label: "Word Count" },
  { key: "load_time_ms", label: "Load Time (ms)" },
  { key: "broken_links_found", label: "Broken Links" },
  { key: "issues", label: "Issues" },
];

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function scoreTone(score: number | null): { panel: string; text: string; label: string } {
  if (score === null) {
    return { panel: "bg-mist/40 ring-navy/10", text: "text-slate-500", label: "Not available" };
  }
  if (score < 50) {
    return { panel: "bg-red-50 ring-red-200", text: "text-red-700", label: "Needs work" };
  }
  if (score < 80) {
    return { panel: "bg-yellow-50 ring-yellow-200", text: "text-yellow-700", label: "Fair" };
  }
  return { panel: "bg-emerald-50 ring-emerald-200", text: "text-emerald-700", label: "Strong" };
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  const tone = scoreTone(value);
  return (
    <div className={`rounded-2xl p-5 ring-1 ${tone.panel}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-4xl font-black tracking-tight ${tone.text}`}>
        {value === null ? "—" : Math.round(value)}
      </p>
      <p className={`mt-1 text-sm font-semibold ${tone.text}`}>{tone.label}</p>
    </div>
  );
}

function FoundBadge({ found }: { found: boolean }) {
  return found ? (
    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      Found
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
      Not Found
    </span>
  );
}

function botStatusTone(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "allowed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (normalized === "blocked") {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function botStatusLabel(status: unknown): string {
  const text = String(status ?? "").trim();
  if (!text) return "Not Specified";
  if (text.toLowerCase() === "not specified" || text.toLowerCase() === "unspecified") {
    return "Not Specified";
  }
  return text;
}

function riskTone(risk: string): string {
  const normalized = risk.toLowerCase();
  if (normalized === "low") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (normalized === "medium") {
    return "bg-yellow-50 text-yellow-700 ring-yellow-200";
  }
  if (normalized === "high") {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function joinList(value: unknown, fallback = "—"): string {
  if (value == null) return fallback;
  if (Array.isArray(value)) {
    const parts = value
      .filter((entry) => entry != null && String(entry).trim() !== "")
      .map(String);
    return parts.length > 0 ? parts.join(", ") : fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function formatUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function formatLoadTime(value: unknown): string {
  const ms = toNumber(value);
  if (ms === null || ms < 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatPercent(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return `${Math.round(value)}%`;
  const text = String(value).trim();
  if (!text) return "—";
  return /%$/.test(text) ? text : `${text}%`;
}

function formatCount(value: unknown): string {
  const num = toNumber(value);
  if (num === null) return value != null ? String(value) : "—";
  return Math.round(num).toLocaleString();
}

function formatH1(value: unknown): string {
  const num = toNumber(value);
  if (num === null) return "—";
  return `${Math.round(num)} H1`;
}

function cellText(value: unknown): string {
  const joined = joinList(value, "");
  return joined === "" ? "—" : joined;
}

function downloadCsv(rows: PageRow[], columns: { key: string; label: string }[], filename: string) {
  const escape = (value: unknown) => {
    const text = cellText(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const header = columns.map((column) => escape(column.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => escape(row[column.key])).join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(
  siteUrl: string,
  scores: Record<string, unknown> | null | undefined,
  siteLevel: Record<string, unknown> | null | undefined,
  structuredData: Record<string, unknown> | null | undefined,
  jsRisk: string | null,
  botAccess: AiBotAccessRow[],
  pages: PageRow[]
): string {
  const seo = toNumber(scores?.seo_score);
  const ai = toNumber(scores?.ai_readiness_score);
  const overall = toNumber(scores?.overall_score);

  const seoRow = (score: number | null, label: string) => {
    const tone = scoreTone(score);
    const color =
      tone.label === "Needs work"
        ? "#fca5a5"
        : tone.label === "Fair"
          ? "#fcd34d"
          : "#6ee7b7";
    return `
      <div class="score-card" style="background:${color}1a;border:1px solid ${color};">
        <div class="score-label">${esc(label)}</div>
        <div class="score-value">${score === null ? "&mdash;" : esc(Math.round(score))}</div>
        <div class="score-sub">${esc(tone.label)}</div>
      </div>`;
  };

  const botRows = botAccess
    .map((row) => {
      const status = botStatusLabel(row.status);
      const tone = (() => {
        if (status.toLowerCase() === "allowed") return "#6ee7b7";
        if (status.toLowerCase() === "blocked") return "#fca5a5";
        return "#cbd5e1";
      })();
      return `<tr><td>${esc(row.bot)}</td><td>${esc(row.operator)}</td><td>${esc(
        row.purpose
      )}</td><td><span class="badge" style="background:${tone}33;color:#0f2a4a;border:1px solid ${tone};">${esc(
        status
      )}</span></td></tr>`;
    })
    .join("");

  const pageRows = pages
    .map(
      (row) => `<tr>
        <td><a href="${esc(formatUrl(row.url))}">${esc(cellText(row.url))}</a></td>
        <td>${esc(cellText(row.title))}</td>
        <td>${esc(cellText(row.meta_description_status))}</td>
        <td>${esc(cellText(row.h1_count))}</td>
        <td>${esc(formatPercent(row.alt_text_percentage))}</td>
        <td>${esc(formatCount(row.word_count))}</td>
        <td>${esc(formatLoadTime(row.load_time_ms))}</td>
        <td>${esc(cellText(row.broken_links_found))}</td>
        <td>${esc(joinList(row.issues))}</td>
      </tr>`
    )
    .join("");

  const hasSiteLevel = !!siteLevel && typeof siteLevel === "object";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Site Health &amp; AI Audit Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f2a4a; margin: 0; padding: 40px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 28px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 12px; }
  .cards { display: flex; gap: 16px; }
  .score-card { flex: 1; border-radius: 14px; padding: 18px; }
  .score-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .score-value { font-size: 40px; font-weight: 900; margin-top: 6px; }
  .score-sub { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .indicator-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .indicator { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .indicator strong { margin-right: 6px; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
  td { border-bottom: 1px solid #f1f5f9; padding: 8px 10px; vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  a { color: #10b3a3; text-decoration: underline; }
  .no-data { color: #94a3b8; font-size: 13px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } a { color: #0f2a4a; } }
</style>
</head>
<body>
  <h1>Site Health &amp; AI Readiness Audit</h1>
  <div class="meta">${esc(siteUrl)} &middot; Generated ${new Date().toLocaleString()}</div>

  <div class="section">
    <div class="section-title">Scores</div>
    <div class="cards">
      ${seoRow(seo, "SEO Score")}
      ${seoRow(ai, "AI Readiness Score")}
      ${seoRow(overall, "Overall Score")}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Site-level signals</div>
    <div class="indicator-row">
      <div class="indicator"><strong>llms.txt</strong>${esc(hasSiteLevel ? (siteLevel.llms_txt_found === true ? "Found" : "Not Found") : "—")}</div>
      <div class="indicator"><strong>sitemap.xml</strong>${esc(hasSiteLevel ? (siteLevel.sitemap_found === true ? "Found" : "Not Found") : "—")}</div>
      <div class="indicator"><strong>robots.txt</strong>${esc(hasSiteLevel ? (siteLevel.robots_txt_found === true ? "Found" : "Not Found") : "—")}</div>
      <div class="indicator"><strong>JS Rendering Risk</strong>${esc(jsRisk ?? "—")}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Structured data</div>
    <div class="indicator-row">
      <div class="indicator"><strong>Types found</strong>${esc(joinList(structuredData?.types_found, "None found"))}</div>
      <div class="indicator"><strong>Organization schema</strong>${esc(structuredData?.organization_schema_complete === true ? "Complete" : "Incomplete")}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">AI bot access</div>
    ${
      botRows
        ? `<table><thead><tr><th>Bot</th><th>Operator</th><th>Purpose</th><th>Status</th></tr></thead><tbody>${botRows}</tbody></table>`
        : `<div class="no-data">No AI bot access data available.</div>`
    }
  </div>

  <div class="section">
    <div class="section-title">Pages (${pages.length})</div>
    ${
      pageRows
        ? `<table><thead><tr><th>URL</th><th>Title</th><th>Meta Description</th><th>H1</th><th>Alt-Text %</th><th>Word Count</th><th>Load Time</th><th>Broken Links</th><th>Issues</th></tr></thead><tbody>${pageRows}</tbody></table>`
        : `<div class="no-data">No page-level data available.</div>`
    }
  </div>
</body>
</html>`;
}

function downloadPdfReport(siteUrl: string, output: SiteHealthOutput) {
  const html = buildReportHtml(
    siteUrl,
    output.scores,
    output.site_level,
    output.structured_data,
    typeof output.js_rendering_risk === "string" ? output.js_rendering_risk : null,
    Array.isArray(output.site_level?.ai_bot_access)
      ? (output.site_level.ai_bot_access as AiBotAccessRow[])
      : [],
    Array.isArray(output.pages) ? (output.pages as PageRow[]) : []
  );
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function SiteHealthAuditWorkflow({
  serviceKey,
  serviceName,
  balance,
  fields,
  history: initialHistory,
}: SiteHealthAuditWorkflowProps) {
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState<number>(15);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

  const cost = getSiteHealthAuditCost(tier) ?? 0;
  const canAfford = balance >= cost;
  const isBusy = submitting || isProcessingRequest(activeRequest);

  const output: SiteHealthOutput | null = useMemo(() => {
    if (!activeRequest || !isResolvedRequest(activeRequest)) return null;
    const raw = activeRequest.output;
    if (!raw || typeof raw !== "object") return null;
    return raw as SiteHealthOutput;
  }, [activeRequest]);

  const scores = output?.scores ?? null;
  const seoScore = toNumber(scores?.seo_score);
  const aiScore = toNumber(scores?.ai_readiness_score);
  const overallScore = toNumber(scores?.overall_score);
  const siteLevel =
    output?.site_level && typeof output.site_level === "object"
      ? output.site_level
      : null;
  const structuredData =
    output?.structured_data && typeof output.structured_data === "object"
      ? output.structured_data
      : null;
  const jsRisk =
    typeof output?.js_rendering_risk === "string"
      ? output.js_rendering_risk
      : null;
  const botAccess: AiBotAccessRow[] = Array.isArray(siteLevel?.ai_bot_access)
    ? (siteLevel.ai_bot_access as AiBotAccessRow[])
    : [];
  const pages: PageRow[] = Array.isArray(output?.pages)
    ? (output.pages as PageRow[])
    : [];

  const typesFound = joinList(structuredData?.types_found, "None found");
  const orgComplete = structuredData?.organization_schema_complete === true;

  const failedMessage =
    activeRequest?.status === "failed"
      ? ((activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No result was generated.")
      : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (getSiteHealthAuditCost(tier) === null) return;

    // Accept a full URL or a bare domain; normalize before submitting so the
    // workflow always receives a fetchable https:// URL.
    const siteUrl = normalizeUrl(url.trim());
    if (siteUrl === null) {
      setSubmitError("Please enter a valid website URL or domain.");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/services/${serviceKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { url: siteUrl, max_pages: tier },
        }),
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
        input: { url: siteUrl, max_pages: tier },
        output: null,
        created_at: new Date().toISOString(),
      });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const trimmedUrl = url.trim();
  const urlError =
    trimmedUrl && !looksLikeUrlOrDomain(trimmedUrl)
      ? "Please enter a valid URL or domain (e.g. example.com or https://example.com)."
      : null;
  const hasResult = output !== null && isResolvedRequest(activeRequest) && activeRequest?.status === "completed";
  const submitDisabled =
    submitting || !canAfford || !trimmedUrl || !!urlError;

  return (
    <div className="space-y-6">
      {/* ── Input panel ─────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Input
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Audit a website for SEO health and AI readiness. Pricing scales with
          audit depth (10 / 60 / 180 credits).
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label
              htmlFor="url"
              className="mb-1.5 block text-sm font-semibold text-navy"
            >
              Website URL
            </label>
            <input
              id="url"
              type="text"
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com or example.com"
              required
              className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none ${
                urlError ? "border-red-300 ring-1 ring-red-200" : "border-navy/10"
              }`}
            />
            {urlError && (
              <p className="mt-1.5 text-sm font-medium text-red-700">
                {urlError}
              </p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-navy">
              Audit depth
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TIERS.map((option) => {
                const active = option.pages === tier;
                return (
                  <button
                    key={option.pages}
                    type="button"
                    onClick={() => setTier(option.pages)}
                    aria-pressed={active}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                        : "border-navy/10 bg-white hover:bg-mist"
                    }`}
                  >
                    <span className="block text-sm font-bold text-navy">
                      {option.label}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {option.pages} pages ({getSiteHealthAuditCost(option.pages)} credits)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {canAfford ? (
            <button
              type="submit"
              disabled={submitDisabled}
              className={`${btnPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {submitting
                ? "Submitting…"
                : `Run Audit (${cost} credits)`}
            </button>
          ) : (
            <UpgradeNotice cost={cost} />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
            Output
          </h2>
          {hasResult && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadPdfReport(
                    String(activeRequest?.input?.url ?? ""),
                    output as SiteHealthOutput
                  )
                }
                className={`${btnNavy} px-4 py-2 text-xs`}
              >
                Download PDF Report
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(pages, PAGE_CSV_COLUMNS, `${serviceName} pages`)
                }
                className={`${btnSecondary} px-4 py-2 text-xs`}
              >
                Download CSV
              </button>
            </div>
          )}
        </div>

        {isBusy ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <Spinner />
            <p className="text-sm font-semibold text-navy">Auditing…</p>
            <p className="text-sm text-slate-500">
              Your site is being audited. Results usually appear within a few
              minutes.
            </p>
          </div>
        ) : failedMessage ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-red-50 px-6 py-12 text-center ring-1 ring-red-200">
            <p className="text-sm font-semibold text-red-700">
              This request failed
            </p>
            <p className="text-sm text-red-600/80">{failedMessage}</p>
          </div>
        ) : hasResult ? (
          <div className="mt-5 space-y-8">
            {/* Scores */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ScoreCard label="SEO Score" value={seoScore} />
              <ScoreCard label="AI Readiness Score" value={aiScore} />
              <ScoreCard label="Overall Score" value={overallScore} />
            </div>

            {/* AI Bot Access */}
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                AI Bot Access
              </h3>
              {botAccess.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="pb-2 pr-4">Bot</th>
                        <th className="pb-2 pr-4">Operator</th>
                        <th className="pb-2 pr-4">Purpose</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {botAccess.map((row, index) => (
                        <tr
                          key={index}
                          className="border-b border-navy/[0.04] last:border-0"
                        >
                          <td className="py-2.5 pr-4 font-medium text-navy">
                            {cellText(row.bot)}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600">
                            {cellText(row.operator)}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600">
                            {cellText(row.purpose)}
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${botStatusTone(
                                botStatusLabel(row.status)
                              )}`}
                            >
                              {botStatusLabel(row.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No AI bot access data available.
                </p>
              )}
            </div>

            {/* Site-level indicators */}
            {siteLevel && (
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    llms.txt
                  </p>
                  <div className="mt-1">
                    <FoundBadge found={siteLevel.llms_txt_found === true} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    sitemap.xml
                  </p>
                  <div className="mt-1">
                    <FoundBadge found={siteLevel.sitemap_found === true} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    robots.txt
                  </p>
                  <div className="mt-1">
                    <FoundBadge found={siteLevel.robots_txt_found === true} />
                  </div>
                </div>
              </div>
            )}

            {/* Structured data + JS risk */}
            <div className="flex flex-wrap items-center gap-6">
              {structuredData && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Structured data
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Types found:{" "}
                    <span className="font-semibold text-navy">{typesFound}</span>
                  </p>
                  <div className="mt-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                        orgComplete
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-yellow-50 text-yellow-700 ring-yellow-200"
                      }`}
                    >
                      Organization schema: {orgComplete ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                </div>
              )}
              {jsRisk && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    JS rendering risk
                  </p>
                  <div className="mt-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${riskTone(
                        jsRisk
                      )}`}
                    >
                      {jsRisk.charAt(0).toUpperCase() + jsRisk.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Per-page table */}
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Pages ({pages.length})
              </h3>
              {pages.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="pb-2 pr-4">URL</th>
                        <th className="pb-2 pr-4">Title</th>
                        <th className="pb-2 pr-4">Meta Description</th>
                        <th className="pb-2 pr-4">H1</th>
                        <th className="pb-2 pr-4">Alt-Text %</th>
                        <th className="pb-2 pr-4">Word Count</th>
                        <th className="pb-2 pr-4">Load Time</th>
                        <th className="pb-2 pr-4">Broken Links</th>
                        <th className="pb-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map((row, index) => (
                        <tr
                          key={index}
                          className="border-b border-navy/[0.04] last:border-0"
                        >
                          <td className="max-w-56 py-2.5 pr-4 align-top">
                            {row.url ? (
                              <a
                                href={formatUrl(row.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-words text-accent-deep underline underline-offset-2 hover:text-navy"
                              >
                                {cellText(row.url)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="max-w-56 py-2.5 pr-4 align-top text-slate-600">
                            {cellText(row.title)}
                          </td>
                          <td className="max-w-48 py-2.5 pr-4 align-top text-slate-600">
                            {cellText(row.meta_description_status)}
                          </td>
                          <td className="py-2.5 pr-4 align-top text-slate-600">
                            {formatH1(row.h1_count)}
                          </td>
                          <td className="py-2.5 pr-4 align-top text-slate-600">
                            {formatPercent(row.alt_text_percentage)}
                          </td>
                          <td className="py-2.5 pr-4 align-top text-slate-600">
                            {formatCount(row.word_count)}
                          </td>
                          <td className="py-2.5 pr-4 align-top whitespace-nowrap text-slate-600">
                            {formatLoadTime(row.load_time_ms)}
                          </td>
                          <td className="py-2.5 pr-4 align-top text-slate-600">
                            {cellText(row.broken_links_found)}
                          </td>
                          <td
                            className="max-w-72 py-2.5 align-top text-slate-600"
                            title={joinList(row.issues, "")}
                          >
                            {joinList(row.issues)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No page-level data available.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              Your audit results will appear here once ready.
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
          Previous audits. Click a row to re-open its result.
        </p>

        <HistoryTable
          history={history}
          fields={fields}
          onOpen={openRequest}
          emptyMessage="No audits yet. Your first run will appear here."
        />
      </section>
    </div>
  );
}