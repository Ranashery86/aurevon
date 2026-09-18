"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { card, btnPrimary, btnSecondary, muted } from "@/lib/ui";
import {
  CRAWL_MAX_URLS,
  CRAWL_MIN_URLS,
  extractUniqueUrls,
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
  ServiceColumn,
  ServiceField,
  ServiceRequestRow,
  ServiceResultRow,
} from "@/lib/services/types";

const RESULT_COLUMNS: ServiceColumn[] = [
  { key: "url", label: "Website", type: "link" },
  { key: "emails", label: "Emails" },
  { key: "phones", label: "Phones" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "twitter", label: "Twitter" },
  { key: "pinterest", label: "Pinterest" },
  { key: "threads", label: "Threads" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" },
  { key: "other_social_links", label: "Other Social Links" },
  { key: "pages_crawled", label: "Pages Crawled" },
  { key: "status", label: "Status" },
];

const FILE_EXTENSIONS = ["xlsx", "xls", "csv"];
const MODES = [
  { id: "manual", label: "Manual Entry" },
  { id: "upload", label: "Upload Excel/CSV" },
] as const;

type Mode = (typeof MODES)[number]["id"];

type WebsiteCrawlerWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  balance: number;
  fields: ServiceField[];
  history: ServiceRequestRow[];
};

type CrawlResultRow = ServiceResultRow & {
  url?: unknown;
  emails?: unknown;
  phones?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  linkedin?: unknown;
  youtube?: unknown;
  tiktok?: unknown;
  twitter?: unknown;
  pinterest?: unknown;
  threads?: unknown;
  whatsapp?: unknown;
  telegram?: unknown;
  other_social_links?: unknown;
  pages_crawled?: unknown;
  status?: unknown;
};

function cellText(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    const parts = value
      .filter((entry) => entry != null && String(entry).trim() !== "")
      .map(String);
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  const text = String(value).trim();
  return text || "—";
}

function formatUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function downloadCsv(
  rows: CrawlResultRow[],
  columns: ServiceColumn[],
  filename: string
) {
  const escape = (value: unknown) => {
    const joined = cellText(value);
    return `"${joined === "—" ? "" : joined.replace(/"/g, '""')}"`;
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

export function WebsiteCrawlerWorkflow({
  serviceKey,
  serviceName,
  balance,
  fields,
  history: initialHistory,
}: WebsiteCrawlerWorkflowProps) {
  const [mode, setMode] = useState<Mode>("manual");
  const [manualText, setManualText] = useState("");
  const [uploadedCells, setUploadedCells] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

  // Final URL list: normalize + dedupe, regardless of input mode, so the live
  // count/cost and the submitted payload are always in sync.
  const urls = useMemo(() => {
    const raw =
      mode === "manual"
        ? manualText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : uploadedCells;
    return extractUniqueUrls(raw);
  }, [mode, manualText, uploadedCells]);

  const cost = urls.length;
  const canAfford = balance >= cost;
  const overLimit = urls.length > CRAWL_MAX_URLS;
  const isBusy = submitting || isProcessingRequest(activeRequest);
  const submitDisabled =
    submitting || !canAfford || overLimit || urls.length < CRAWL_MIN_URLS;

  const results =
    isResolvedRequest(activeRequest) && activeRequest
      ? ((activeRequest.output as { results?: CrawlResultRow[] } | null)
          ?.results ?? [])
      : [];

  const failedMessage =
    activeRequest?.status === "failed"
      ? ((activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No results were generated.")
      : null;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTENSIONS.includes(ext)) {
      setParseError("Unsupported file type. Please upload an .xlsx, .xls, or .csv file.");
      setUploadedCells([]);
      setFileName(null);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const cells: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
        }) as unknown[][];

        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (cell == null) continue;
            const text = String(cell).trim();
            if (text && looksLikeUrlOrDomain(text)) cells.push(text);
          }
        }
      }

      if (cells.length === 0) {
        setParseError("No URLs or domains found in this file.");
        setUploadedCells([]);
        setFileName(file.name);
        return;
      }

      setUploadedCells(cells);
      setFileName(file.name);
    } catch {
      setParseError("Could not read that file. Check it's a valid .xlsx, .xls, or .csv.");
      setUploadedCells([]);
      setFileName(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (urls.length < CRAWL_MIN_URLS || urls.length > CRAWL_MAX_URLS) return;

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

  const submitLabel = urls.length === 1
    ? `Crawl 1 Website (1 credit)`
    : `Crawl ${urls.length} Websites (${urls.length} credits)`;

  return (
    <div className="space-y-6">
      {/* ── Input panel ─────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Input
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Paste URLs manually or upload a spreadsheet. One credit per URL.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mode === option.id
                  ? "bg-navy text-white"
                  : "bg-mist text-navy hover:bg-navy/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "manual" ? (
            <div>
              <label
                htmlFor="urls-manual"
                className="mb-1.5 block text-sm font-semibold text-navy"
              >
                URLs (one per line)
              </label>
              <textarea
                id="urls-manual"
                rows={8}
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder={"example.com\nhttps://another-site.com\nthird-site.io"}
                className="w-full resize-y rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-navy">
                Spreadsheet (.xlsx, .xls, or .csv)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-mist">
                Choose file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              <p className={`mt-2 text-sm ${muted}`}>
                Every cell that looks like a URL or domain is picked up from
                any column or sheet (a value containing a dot and no
                whitespace).
              </p>
            </div>
          )}

          {fileName && (
            <p className="text-sm font-medium text-navy">
              Loaded: {fileName}
            </p>
          )}

          <p className="text-sm font-semibold text-accent-deep">
            {urls.length} URLs found · {urls.length} credits
          </p>

          {parseError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
              {parseError}
            </p>
          )}

          {overLimit && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
              Maximum {CRAWL_MAX_URLS} URLs per run. You have {urls.length} —
              remove {urls.length - CRAWL_MAX_URLS} to continue.
            </p>
          )}

          {!overLimit && !parseError && urls.length < CRAWL_MIN_URLS && (
            <p className="text-sm text-slate-500">
              Add at least {CRAWL_MIN_URLS} URL to continue.
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
              {submitting ? "Submitting…" : submitLabel}
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
            Output
          </h2>
          {results.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadCsv(results, RESULT_COLUMNS, `${serviceName} results`)
              }
              className={`${btnSecondary} px-4 py-2 text-xs`}
            >
              Download CSV
            </button>
          )}
        </div>

        {isBusy ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <Spinner />
            <p className="text-sm font-semibold text-navy">Crawling…</p>
            <p className="text-sm text-slate-500">
              Your websites are being crawled. Results usually appear within a
              few minutes.
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
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                  {RESULT_COLUMNS.map((column) => (
                    <th key={column.key} className="pb-2 pr-4">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr
                    key={index}
                    className="border-b border-navy/[0.04] last:border-0"
                  >
                    {RESULT_COLUMNS.map((column) => {
                      const value = row[column.key];
                      if (column.type === "link") {
                        const href = formatUrl(value);
                        return (
                          <td
                            key={column.key}
                            className="py-2.5 pr-4 align-top text-slate-600"
                          >
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent-deep underline underline-offset-2 hover:text-navy"
                              >
                                {cellText(value)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={column.key}
                          className="max-w-64 py-2.5 pr-4 align-top text-slate-600"
                        >
                          {cellText(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              Your crawl results will appear here once ready.
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
          Previous crawl requests. Click a row to re-open its result.
        </p>

        <HistoryTable
          history={history}
          fields={fields}
          onOpen={openRequest}
          formatCell={(field, input) => {
            if (field.name === "urls") {
              const list = Array.isArray(input?.urls) ? (input?.urls as string[]) : [];
              return list.length === 1
                ? "1 website"
                : `${list.length} websites`;
            }
            return undefined;
          }}
          emptyMessage="No crawls yet. Your first run will appear here."
        />
      </section>
    </div>
  );
}