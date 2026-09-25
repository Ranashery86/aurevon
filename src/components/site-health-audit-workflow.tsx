"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { card, btnPrimary, btnSecondary, btnNavy, muted } from "@/lib/ui";
import {
  SITE_AUDIT_MIN_URLS,
  SITE_AUDIT_MAX_URLS,
  SITE_AUDIT_RATE_PER_URL,
  extractUniqueUrls,
  getSiteHealthAuditCost,
  looksLikeUrlOrDomain,
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

const FILE_EXTENSIONS = ["xlsx", "xls", "csv"];
const MODES = [
  { id: "manual", label: "Manual Entry" },
  { id: "upload", label: "Upload Excel/CSV" },
] as const;

type Mode = (typeof MODES)[number]["id"];

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

// One entry per submitted URL. Completed sites carry the full report; failed
// entries only carry { url, status: "failed", error }.
type SiteResult = {
  url?: unknown;
  status?: unknown;
  scores?: Record<string, unknown> | null;
  site_level?: Record<string, unknown> | null;
  structured_data?: Record<string, unknown> | null;
  js_rendering_risk?: unknown;
  pages?: unknown[];
  checks?: unknown[];
  category_scores?: Record<string, unknown> | null;
  error?: unknown;
};

type SiteHealthOutput = {
  results?: SiteResult[];
};

const PAGE_CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "site", label: "Site" },
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

function isCompletedSite(site: SiteResult): boolean {
  return String(site.status ?? "").toLowerCase() === "completed";
}

function siteTabLabel(url: unknown): string {
  const text = String(url ?? "").trim();
  if (!text) return "Site";
  try {
    return new URL(text).hostname || text;
  } catch {
    return text;
  }
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

function pdfCheckStatusBadge(status: unknown): string {
  const text = String(status ?? "").trim().toLowerCase();
  if (text === "pass") {
    return `<span class="badge" style="background:#6ee7b733;color:#0f2a4a;border:1px solid #6ee7b7;">Pass</span>`;
  }
  if (text === "warn" || text === "warning") {
    return `<span class="badge" style="background:#fcd34d33;color:#0f2a4a;border:1px solid #fcd34d;">Warn</span>`;
  }
  if (text === "fail") {
    return `<span class="badge" style="background:#fca5a533;color:#0f2a4a;border:1px solid #fca5a5;">Fail</span>`;
  }
  const raw = String(status ?? "").trim();
  return `<span class="badge" style="background:#cbd5e133;color:#0f2a4a;border:1px solid #cbd5e1;">${esc(raw || "—")}</span>`;
}

function pdfScoreBadge(score: number | null): string {
  if (score === null) {
    return `<span class="badge" style="background:#e2e8f033;color:#0f2a4a;border:1px solid #cbd5e1;">No score</span>`;
  }
  const color = score < 50 ? "#fca5a5" : score < 80 ? "#fcd34d" : "#6ee7b7";
  return `<span class="badge" style="background:${color}33;color:#0f2a4a;border:1px solid ${color};">${Math.round(score)}/100</span>`;
}

function buildSiteBlockHtml(site: SiteResult): string {
  const scores = site.scores ?? null;
  const seo = toNumber(scores?.seo_score);
  const ai = toNumber(scores?.ai_readiness_score);
  const overall = toNumber(scores?.overall_score);
  const hasSiteLevel = site.site_level != null && typeof site.site_level === "object";
  const siteLevel = hasSiteLevel ? (site.site_level as Record<string, unknown>) : null;
  const structuredData =
    site.structured_data != null && typeof site.structured_data === "object"
      ? (site.structured_data as Record<string, unknown>)
      : null;
  const jsRisk = typeof site.js_rendering_risk === "string" ? site.js_rendering_risk : null;
  const botAccess: AiBotAccessRow[] = Array.isArray(siteLevel?.ai_bot_access)
    ? (siteLevel.ai_bot_access as AiBotAccessRow[])
    : [];
  const pages: PageRow[] = Array.isArray(site.pages) ? (site.pages as PageRow[]) : [];
  const checks: AuditCheck[] = Array.isArray(site.checks)
    ? (site.checks as AuditCheck[])
    : [];
  const hasCategoryScores =
    site.category_scores != null && typeof site.category_scores === "object";
  const categoryScores: CategoryScores | null = hasCategoryScores
    ? (site.category_scores as CategoryScores)
    : null;
  const showChecks = checks.length > 0 && categoryScores !== null;
  const passedTotal = countChecksByStatus(checks, "pass");
  const warnedTotal = countChecksByStatus(checks, "warn");
  const failedTotal = countChecksByStatus(checks, "fail");

  const summaryLine = showChecks
    ? `<div class="indicator-row" style="margin-bottom:28px;">
      <span class="badge" style="background:#6ee7b733;color:#0f2a4a;border:1px solid #6ee7b7;">${passedTotal} passed</span>
      <span class="badge" style="background:#fcd34d33;color:#0f2a4a;border:1px solid #fcd34d;">${warnedTotal} warning${warnedTotal === 1 ? "" : "s"}</span>
      <span class="badge" style="background:#fca5a533;color:#0f2a4a;border:1px solid #fca5a5;">${failedTotal} failed</span>
    </div>`
    : "";

  const categoryBlocks = showChecks
    ? CATEGORY_ORDER.map((categoryName) => {
        const categoryChecks = checks.filter(
          (entry) =>
            normalizeCategory(entry.category) === normalizeCategory(categoryName)
        );
        if (categoryChecks.length === 0) return "";
        const scores = findCategoryScore(categoryScores ?? {}, categoryName) ?? {};
        const score = toNumber(scores.score);
        const passed = toNumber(scores.pass) ?? 0;
        const warned = toNumber(scores.warn) ?? 0;
        const failed = toNumber(scores.fail) ?? 0;
        const rows = categoryChecks
          .map((entry) => {
            const message = joinList(entry.message, "");
            return `<tr>
                <td>${pdfCheckStatusBadge(entry.status)}</td>
                <td><strong>${esc(cellText(entry.check))}</strong></td>
                <td>${esc(message || "—")}</td>
              </tr>`;
          })
          .join("");
        return `
          <div class="check-category">
            <div class="check-category-head">
              <span class="check-category-name">${esc(categoryName)}</span>
              ${pdfScoreBadge(score)}
              <span class="badge" style="background:#6ee7b733;color:#0f2a4a;border:1px solid #6ee7b7;">${passed} pass</span>
              <span class="badge" style="background:#fcd34d33;color:#0f2a4a;border:1px solid #fcd34d;">${warned} warn</span>
              <span class="badge" style="background:#fca5a533;color:#0f2a4a;border:1px solid #fca5a5;">${failed} fail</span>
            </div>
            <table>
              <thead><tr><th style="width:80px;">Status</th><th>Check</th><th>Message</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      })
      .join("")
    : "";

  const checklistSection = showChecks
    ? `<div class="section">
      <div class="section-title">Audit checklist</div>
      ${categoryBlocks}
    </div>`
    : "";

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

  return `
    <div class="site-block">
      <div class="site-title">${esc(cellText(site.url))}</div>

      <div class="section">
        <div class="section-title">Scores</div>
        <div class="cards">
          ${seoRow(seo, "SEO Score")}
          ${seoRow(ai, "AI Readiness Score")}
          ${seoRow(overall, "Overall Score")}
        </div>
      </div>

      ${summaryLine}

      <div class="section">
        <div class="section-title">Site-level signals</div>
        <div class="indicator-row">
          <div class="indicator"><strong>llms.txt</strong>${esc(siteLevel && siteLevel.llms_txt_found === true ? "Found" : siteLevel ? "Not Found" : "—")}</div>
          <div class="indicator"><strong>sitemap.xml</strong>${esc(siteLevel && siteLevel.sitemap_found === true ? "Found" : siteLevel ? "Not Found" : "—")}</div>
          <div class="indicator"><strong>robots.txt</strong>${esc(siteLevel && siteLevel.robots_txt_found === true ? "Found" : siteLevel ? "Not Found" : "—")}</div>
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

      ${checklistSection}

      <div class="section">
        <div class="section-title">Pages (${pages.length})</div>
        ${
          pageRows
            ? `<table><thead><tr><th>URL</th><th>Title</th><th>Meta Description</th><th>H1</th><th>Alt-Text %</th><th>Word Count</th><th>Load Time</th><th>Broken Links</th><th>Issues</th></tr></thead><tbody>${pageRows}</tbody></table>`
            : `<div class="no-data">No page-level data available.</div>`
        }
      </div>
    </div>`;
}

function buildPdfHtml(results: SiteResult[]): string {
  const completed = results.filter(isCompletedSite);
  const overallScores = completed
    .map((site) => toNumber(site.scores?.overall_score))
    .filter((num): num is number => num !== null);
  const avg =
    overallScores.length > 0
      ? overallScores.reduce((sum, num) => sum + num, 0) / overallScores.length
      : null;
  const summary =
    `${completed.length} of ${results.length} sites audited successfully` +
    (avg !== null && completed.length > 1
      ? ` · Average Overall Score: ${Math.round(avg)}`
      : "");
  const blocks = completed.map(buildSiteBlockHtml).join("");

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
  .site-block { margin-bottom: 36px; }
  .site-block:last-child { margin-bottom: 0; }
  .site-title { font-size: 18px; font-weight: 800; color: #10b3a3; margin-bottom: 18px; }
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
  .check-category { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 14px; }
  .check-category-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .check-category-name { font-size: 14px; font-weight: 800; color: #0f2a4a; }
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
  <div class="meta">${esc(summary)} &middot; Generated ${new Date().toLocaleString()}</div>

  ${blocks}
</body>
</html>`;
}

function downloadPdfReport(output: SiteHealthOutput) {
  const html = buildPdfHtml(output.results ?? []);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

const CATEGORY_ORDER = [
  "Core SEO",
  "Content",
  "Images",
  "Links",
  "Security",
  "Performance",
  "Social",
  "E-E-A-T",
  "Structured Data",
  "AI/GEO Readiness",
  "URL Structure",
  "Mobile",
  "HTML Validation",
  "Redirects",
  "Accessibility",
  "Internationalization",
] as const;

const CATEGORY_SUMMARY_ORDER = [
  "Core SEO",
  "Content",
  "Performance",
  "Links",
  "Images",
  "Security",
  "Accessibility",
  "Structured Data",
  "Social",
  "E-E-A-T",
  "URL Structure",
  "Mobile",
  "HTML Validation",
  "Redirects",
  "AI/GEO Readiness",
  "Internationalization",
] as const;

type AuditCheck = {
  category?: unknown;
  check?: unknown;
  status?: unknown;
  message?: unknown;
};

type CategoryScore = {
  score?: unknown;
  pass?: unknown;
  warn?: unknown;
  fail?: unknown;
};

type CategoryScores = Record<string, CategoryScore>;

function checkStatusInfo(status: unknown): { badge: string; label: string } {
  const text = String(status ?? "").trim().toLowerCase();
  if (text === "pass") {
    return { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Pass" };
  }
  if (text === "warn" || text === "warning") {
    return { badge: "bg-yellow-50 text-yellow-700 ring-yellow-200", label: "Warn" };
  }
  if (text === "fail") {
    return { badge: "bg-red-50 text-red-700 ring-red-200", label: "Fail" };
  }
  const raw = String(status ?? "").trim();
  return { badge: "bg-slate-100 text-slate-600 ring-slate-200", label: raw || "—" };
}

function countChecksByStatus(checks: AuditCheck[], wanted: "pass" | "warn" | "fail"): number {
  return checks.filter((entry) => {
    const text = String(entry.status ?? "").trim().toLowerCase();
    if (wanted === "warn") return text === "warn" || text === "warning";
    return text === wanted;
  }).length;
}

function normalizeCategory(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function findCategoryScore(
  categoryScores: CategoryScores,
  categoryName: string
): CategoryScore | undefined {
  const direct = categoryScores[categoryName];
  if (direct != null) return direct;
  const normalized = normalizeCategory(categoryName);
  const match = Object.keys(categoryScores).find(
    (key) => normalizeCategory(key) === normalized
  );
  return match != null ? categoryScores[match] : undefined;
}

type CategorySummaryRow = {
  name: string;
  score: number | null;
  fail: number;
  warn: number;
  pass: number;
};

function buildCategorySummaryRows(categoryScores: CategoryScores): CategorySummaryRow[] {
  return CATEGORY_SUMMARY_ORDER.flatMap((categoryName) => {
    const scores = findCategoryScore(categoryScores, categoryName);
    if (scores == null) return [];
    return [
      {
        name: categoryName,
        score: toNumber(scores.score),
        fail: toNumber(scores.fail) ?? 0,
        warn: toNumber(scores.warn) ?? 0,
        pass: toNumber(scores.pass) ?? 0,
      },
    ];
  });
}

function CategorySummaryTable({ rows }: { rows: CategorySummaryRow[] }) {
  if (rows.length === 0) return null;

  const scoreClass = (score: number | null) => {
    if (score === null) return "text-slate-400";
    if (score >= 90) return "text-emerald-600";
    if (score >= 70) return "text-amber-600";
    return "text-red-600";
  };
  const failClass = (value: number) => (value > 0 ? "text-red-600" : "text-slate-400");
  const warnClass = (value: number) => (value > 0 ? "text-amber-600" : "text-slate-400");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy/[0.06] bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Score</th>
            <th className="px-3 py-2.5 text-right">Fail</th>
            <th className="px-3 py-2.5 text-right">Warn</th>
            <th className="px-3 py-2.5 text-right">Pass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-navy/[0.04] last:border-0">
              <td className="px-3 py-2.5 font-medium text-navy">{row.name}</td>
              <td className={`px-3 py-2.5 text-right font-bold ${scoreClass(row.score)}`}>
                {row.score === null ? "—" : Math.round(row.score)}
              </td>
              <td className={`px-3 py-2.5 text-right ${failClass(row.fail)}`}>
                {row.fail}
              </td>
              <td className={`px-3 py-2.5 text-right ${warnClass(row.warn)}`}>
                {row.warn}
              </td>
              <td className="px-3 py-2.5 text-right text-emerald-600">{row.pass}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryChecksSection({
  checks,
  categoryScores,
}: {
  checks: AuditCheck[];
  categoryScores: CategoryScores;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const visibleCategories = CATEGORY_ORDER.filter((categoryName) =>
    checks.some((entry) => normalizeCategory(entry.category) === normalizeCategory(categoryName))
  );
  if (visibleCategories.length === 0) return null;

  return (
    <div className="space-y-3">
      {visibleCategories.map((categoryName) => {
        const categoryChecks = checks.filter(
          (entry) => normalizeCategory(entry.category) === normalizeCategory(categoryName)
        );
        const scores = findCategoryScore(categoryScores, categoryName) ?? {};
        const score = toNumber(scores.score);
        const passed = toNumber(scores.pass) ?? 0;
        const warned = toNumber(scores.warn) ?? 0;
        const failed = toNumber(scores.fail) ?? 0;
        const isCollapsed = collapsed.has(categoryName);

        return (
          <div
            key={categoryName}
            className="rounded-2xl border border-navy/[0.08] bg-white"
          >
            <button
              type="button"
              onClick={() => toggle(categoryName)}
              aria-expanded={!isCollapsed}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-mist/40"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-navy">{categoryName}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                    score === null
                      ? "bg-slate-100 text-slate-600 ring-slate-200"
                      : score < 50
                        ? "bg-red-50 text-red-700 ring-red-200"
                        : score < 80
                          ? "bg-yellow-50 text-yellow-700 ring-yellow-200"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  }`}
                >
                  {score === null ? "No score" : `${Math.round(score)}/100`}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {passed} pass
                  </span>
                  <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 ring-1 ring-yellow-200">
                    {warned} warn
                  </span>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                    {failed} fail
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {isCollapsed ? "Show checks" : "Hide checks"}
              </span>
            </button>
            {!isCollapsed && (
              <ul className="space-y-3 border-t border-navy/[0.06] px-4 py-4">
                {categoryChecks.map((entry, index) => {
                  const statusInfo = checkStatusInfo(entry.status);
                  const message = joinList(entry.message, "");
                  return (
                    <li key={index} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 whitespace-nowrap text-xs font-semibold ring-1 ${statusInfo.badge}`}
                      >
                        {statusInfo.label}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-navy">
                          {cellText(entry.check)}
                        </p>
                        {message && (
                          <p className="mt-0.5 text-sm text-slate-600">{message}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SiteReport({ site }: { site: SiteResult }) {
  const scores = site.scores ?? null;
  const seoScore = toNumber(scores?.seo_score);
  const aiScore = toNumber(scores?.ai_readiness_score);
  const overallScore = toNumber(scores?.overall_score);
  const siteLevel =
    site.site_level && typeof site.site_level === "object"
      ? (site.site_level as Record<string, unknown>)
      : null;
  const structuredData =
    site.structured_data && typeof site.structured_data === "object"
      ? (site.structured_data as Record<string, unknown>)
      : null;
  const jsRisk =
    typeof site.js_rendering_risk === "string" ? site.js_rendering_risk : null;
  const botAccess: AiBotAccessRow[] = Array.isArray(siteLevel?.ai_bot_access)
    ? (siteLevel.ai_bot_access as AiBotAccessRow[])
    : [];
  const pages: PageRow[] = Array.isArray(site.pages) ? (site.pages as PageRow[]) : [];
  const checks: AuditCheck[] = Array.isArray(site.checks)
    ? (site.checks as AuditCheck[])
    : [];
  const hasCategoryScores =
    site.category_scores != null && typeof site.category_scores === "object";
  const categoryScores: CategoryScores | null = hasCategoryScores
    ? (site.category_scores as CategoryScores)
    : null;
  const showChecks = checks.length > 0 && categoryScores !== null;
  const categorySummaryRows =
    categoryScores !== null ? buildCategorySummaryRows(categoryScores) : [];
  const showCategorySummary = categorySummaryRows.length > 0;
  const passedTotal = countChecksByStatus(checks, "pass");
  const warnedTotal = countChecksByStatus(checks, "warn");
  const failedTotal = countChecksByStatus(checks, "fail");
  const typesFound = joinList(structuredData?.types_found, "None found");
  const orgComplete = structuredData?.organization_schema_complete === true;

  return (
    <div className="space-y-8">
      {/* Scores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScoreCard label="SEO Score" value={seoScore} />
        <ScoreCard label="AI Readiness Score" value={aiScore} />
        <ScoreCard label="Overall Score" value={overallScore} />
      </div>

      {showChecks && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
            {passedTotal} passed
          </span>
          <span className="rounded-full bg-yellow-50 px-3 py-1 text-sm font-bold text-yellow-700 ring-1 ring-yellow-200">
            {warnedTotal} warning{warnedTotal === 1 ? "" : "s"}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 ring-1 ring-red-200">
            {failedTotal} failed
          </span>
        </div>
      )}

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

      {showCategorySummary && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Audit Category Summary
          </h3>
          <CategorySummaryTable rows={categorySummaryRows} />
        </div>
      )}

      {showChecks && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Audit Checklist
          </h3>
          <CategoryChecksSection checks={checks} categoryScores={categoryScores} />
        </div>
      )}

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
          <p className="text-sm text-slate-500">No page-level data available.</p>
        )}
      </div>
    </div>
  );
}

export function SiteHealthAuditWorkflow({
  serviceKey,
  serviceName,
  balance,
  fields,
  history: initialHistory,
}: SiteHealthAuditWorkflowProps) {
  const [mode, setMode] = useState<Mode>("manual");
  const [manualText, setManualText] = useState("");
  const [uploadedCells, setUploadedCells] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeSiteIndex, setActiveSiteIndex] = useState(0);
  const [lastLoadedRequestId, setLastLoadedRequestId] = useState<string | null>(null);

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

  // Raw list becomes URLs: duplicates collapse, each entry is normalized
  // (https:// added when missing), and the list is de-duplicated — mirroring
  // the server-side re-validation in the trigger route.
  const urls = useMemo(() => {
    const raw = mode === "manual" ? manualText.split(/\r?\n/) : uploadedCells;
    return extractUniqueUrls(raw);
  }, [mode, manualText, uploadedCells]);

  const cost = getSiteHealthAuditCost(urls) ?? 0;
  const canAfford = balance >= cost;
  const overLimit = urls.length > SITE_AUDIT_MAX_URLS;
  const isBusy = submitting || isProcessingRequest(activeRequest);

  const output: SiteHealthOutput | null = useMemo(() => {
    if (!activeRequest || !isResolvedRequest(activeRequest)) return null;
    const raw = activeRequest.output;
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as { results?: unknown };
    return Array.isArray(obj.results) ? (obj as SiteHealthOutput) : null;
  }, [activeRequest]);

  // Reset to the first site's tab whenever a (re)loaded request resolves.
  if (
    activeRequest &&
    isResolvedRequest(activeRequest) &&
    lastLoadedRequestId !== activeRequest.id
  ) {
    setActiveSiteIndex(0);
    setLastLoadedRequestId(activeRequest.id);
  }

  const results: SiteResult[] = output?.results ?? [];
  const completedResults = results.filter(isCompletedSite);
  const overallScores = completedResults
    .map((site) => toNumber(site.scores?.overall_score))
    .filter((num): num is number => num !== null);
  const avgOverall =
    overallScores.length > 0
      ? overallScores.reduce((sum, num) => sum + num, 0) / overallScores.length
      : null;
  const siteIndex = Math.min(activeSiteIndex, Math.max(0, results.length - 1));
  const activeSite = results[siteIndex] ?? null;
  const activeSiteFailed = !!activeSite && !isCompletedSite(activeSite);

  const failedMessage =
    activeRequest?.status === "failed"
      ? ((activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No result was generated.")
      : null;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const valid = FILE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
    if (!valid) {
      setParseError("Unsupported file type. Please upload an .xlsx, .xls, or .csv file.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const cells: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          workbook.Sheets[sheetName],
          { defval: "" }
        );
        for (const row of rows) {
          for (const value of Object.values(row)) {
            const text = String(value ?? "").trim();
            if (text && looksLikeUrlOrDomain(text)) cells.push(text);
          }
        }
      }

      if (cells.length === 0) {
        setParseError("No valid URLs or domains found in the file.");
        return;
      }

      setUploadedCells(cells);
      setFileName(file.name);
      setParseError(null);
    } catch {
      setParseError("Could not read that file. Please check the format and try again.");
    }
  };

  const resetFileInput = (event: React.MouseEvent<HTMLButtonElement>) => {
    setUploadedCells([]);
    setFileName(null);
    setParseError(null);
    const input = document.getElementById("site-audit-file-input") as HTMLInputElement | null;
    if (input) input.value = "";
    event.currentTarget.blur();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (urls.length < SITE_AUDIT_MIN_URLS || urls.length > SITE_AUDIT_MAX_URLS) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
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

  const hasResult = output !== null;
  const submitDisabled =
    submitting || !canAfford || overLimit || urls.length < SITE_AUDIT_MIN_URLS;

  const downloadAllCsv = () => {
    const rows: PageRow[] = completedResults.flatMap((site) =>
      (Array.isArray(site.pages) ? (site.pages as PageRow[]) : []).map((row) => ({
        site: site.url,
        ...row,
      }))
    );
    downloadCsv(rows, PAGE_CSV_COLUMNS, `${serviceName} pages`);
  };

  return (
    <div className="space-y-6">
      {/* ── Input panel ─────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Input
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Audit 1–{SITE_AUDIT_MAX_URLS} websites for SEO health and AI readiness —
          {SITE_AUDIT_RATE_PER_URL} credits per URL. Every site is audited at{" "}
          {SITE_AUDIT_RATE_PER_URL} pages depth and you can review each report
          after the run completes.
        </p>

        <div className="mt-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map((option) => {
              const active = option.id === mode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  aria-pressed={active}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-navy/10 bg-white text-navy hover:bg-mist"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {mode === "manual" ? (
              <div>
                <label
                  htmlFor="site-audit-urls"
                  className="mb-1.5 block text-sm font-semibold text-navy"
                >
                  Websites (one per line)
                </label>
                <textarea
                  id="site-audit-urls"
                  rows={5}
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder={`example.com\nhttps://another-site.com\nthird-site.io`}
                  className="w-full resize-y rounded-xl border border-navy/10 bg-white px-4 py-2.5 font-mono text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <input
                  id="site-audit-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {uploadedCells.length > 0 ? (
                  <div className="rounded-xl border border-navy/10 bg-mist/40 px-4 py-3">
                    <p className="text-sm font-semibold text-navy">{fileName}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {uploadedCells.length} URL{uploadedCells.length === 1 ? "" : "s"} found
                    </p>
                    <button
                      type="button"
                      onClick={resetFileInput}
                      className={`${btnSecondary} mt-2 px-3 py-1.5 text-xs`}
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById("site-audit-file-input") as HTMLInputElement | null;
                      input?.click();
                    }}
                    className={`${btnSecondary} w-full px-4 py-3 text-sm`}
                  >
                    Choose file (.xlsx, .xls, or .csv)
                  </button>
                )}
              </div>
            )}

            {parseError && (
              <p className="mt-2 text-sm font-medium text-red-700">{parseError}</p>
            )}

            <p className="mt-3 text-sm font-semibold text-accent-deep">
              {urls.length} URLs found · {cost} credits (
              {SITE_AUDIT_RATE_PER_URL} credits × {urls.length} URLs)
            </p>
          </div>

          {!overLimit && !parseError && urls.length < SITE_AUDIT_MIN_URLS && (
            <p className="mt-2 text-sm text-slate-500">
              Add at least {SITE_AUDIT_MIN_URLS} URL to continue.
            </p>
          )}
          {overLimit && (
            <p className="mt-2 text-sm font-medium text-red-700">
              Up to {SITE_AUDIT_MAX_URLS} URLs are allowed per run. Please remove{" "}
              {urls.length - SITE_AUDIT_MAX_URLS} to continue.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {canAfford ? (
              <button
                type="submit"
                disabled={submitDisabled}
                className={`${btnPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {submitting ? "Submitting…" : `Run Audit (${cost} credits)`}
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
        </div>
      </section>

      {/* ── Output panel ────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
            Output
          </h2>
          {hasResult && completedResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadPdfReport(output as SiteHealthOutput)}
                className={`${btnNavy} px-4 py-2 text-xs`}
              >
                Download PDF Report
              </button>
              <button
                type="button"
                onClick={downloadAllCsv}
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
              {urls.length > 1
                ? `${urls.length} sites are being audited. Results usually appear within a few minutes.`
                : "Your site is being audited. Results usually appear within a few minutes."}
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
          results.length > 0 ? (
            <div className="mt-5 space-y-5">
              {/* Run summary strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/40 px-4 py-3">
                <p className="text-sm font-semibold text-navy">
                  {completedResults.length} of {results.length} sites audited
                  successfully
                </p>
                {completedResults.length > 1 && avgOverall !== null && (
                  <p className="text-sm font-semibold text-accent-deep">
                    Average Overall Score: {Math.round(avgOverall)}
                  </p>
                )}
              </div>

              {/* Per-site tabs */}
              <div className="flex flex-wrap gap-2">
                {results.map((site, index) => {
                  const active = index === siteIndex;
                  const failed = !isCompletedSite(site);
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
                          failed ? "bg-red-400" : "bg-emerald-400"
                        }`}
                      />
                      <span className="max-w-44 truncate">
                        {siteTabLabel(site.url)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active site report */}
              {activeSiteFailed ? (
                <div className="rounded-xl bg-red-50 px-6 py-10 text-center ring-1 ring-red-200">
                  <p className="text-sm font-semibold text-red-700">
                    {cellText(activeSite?.url)}
                  </p>
                  <p className="mt-1 text-sm text-red-600/80">
                    {joinList(activeSite?.error) || "This site could not be audited."}
                  </p>
                </div>
              ) : activeSite ? (
                <SiteReport
                  key={String(activeSite.url ?? "") || siteIndex}
                  site={activeSite}
                />
              ) : (
                <p className="text-sm text-slate-500">No site selected.</p>
              )}
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                Your audit results will appear here once ready.
              </p>
            </div>
          )
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
          formatCell={(field, input) => {
            if (field.name === "urls") {
              const list = Array.isArray(input?.urls)
                ? (input.urls as string[])
                : [];
              return list.length === 1 ? "1 site" : `${list.length} sites`;
            }
            return undefined;
          }}
        />
      </section>
    </div>
  );
}