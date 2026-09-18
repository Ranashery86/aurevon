"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { card, btnPrimary, muted } from "@/lib/ui";
import type {
  ServiceColumn,
  ServiceField,
  ServiceRequestRow,
  ServiceResultRow,
} from "@/lib/services/types";

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_ATTEMPTS = 90;

type ServiceWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  creditCost: number;
  balance: number;
  fields: ServiceField[];
  columns: ServiceColumn[];
  history: ServiceRequestRow[];
};

const isProcessing = (row: ServiceRequestRow | null) =>
  !!row && (row.status === "processing" || row.status === "pending");

const isResolved = (row: ServiceRequestRow | null) =>
  !!row && (row.status === "completed" || row.status === "failed");

function getResultRows(output: unknown): ServiceResultRow[] {
  if (Array.isArray(output)) return output as ServiceResultRow[];
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    for (const key of ["leads", "result", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as ServiceResultRow[];
    }
  }
  return [];
}

function summarizeInput(
  input: ServiceRequestRow["input"],
  fields: ServiceField[]
): string {
  if (!input) return "—";
  const parts = fields
    .map((field) => input[field.name]?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(input);
}

function statusStyles(status: ServiceRequestRow["status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 ring-red-200";
    case "processing":
      return "bg-accent/10 text-accent-deep ring-accent/20";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function Spinner() {
  return (
    <div
      className="size-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
      aria-hidden
    />
  );
}

function downloadCsv(
  rows: ServiceResultRow[],
  columns: ServiceColumn[],
  filename: string
) {
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

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

export function ServiceWorkflow({
  serviceKey,
  serviceName,
  creditCost,
  balance,
  fields,
  columns,
  history: initialHistory,
}: ServiceWorkflowProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<ServiceRequestRow | null>(
    null
  );
  const [history, setHistory] = useState<ServiceRequestRow[]>(initialHistory);

  const applyRequest = useCallback((row: ServiceRequestRow) => {
    setActiveRequest(row);
    setHistory((previous) => {
      const index = previous.findIndex((item) => item.id === row.id);
      if (index === -1) return [row, ...previous];
      const next = [...previous];
      next[index] = row;
      return next;
    });
  }, []);

  // Poll the service_requests row until the workflow reaches a terminal state.
  useEffect(() => {
    if (!activeRequestId) return;

    const supabase = createClient();
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const check = async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", activeRequestId)
        .maybeSingle();

      if (cancelled || error || !data) return;
      applyRequest(data as ServiceRequestRow);

      if (data.status === "completed" || data.status === "failed") {
        stop();
      }
    };

    timer = setInterval(() => {
      attempts += 1;
      void check();
      if (attempts >= MAX_POLL_ATTEMPTS) stop();
    }, POLL_INTERVAL_MS);

    void check();

    return () => {
      cancelled = true;
      stop();
    };
  }, [activeRequestId, applyRequest]);

  const openRequest = (row: ServiceRequestRow) => {
    setActiveRequestId(row.id);
    applyRequest(row);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/services/${serviceKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: values }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        request_id?: string;
        error?: string;
      };

      if (!response.ok || !body.request_id) {
        setSubmitError(body.error ?? "Something went wrong. Please try again.");
        return;
      }

      const optimisticRow: ServiceRequestRow = {
        id: body.request_id,
        uuid: "",
        service_name: serviceName,
        service_key: serviceKey,
        status: "processing",
        input: values,
        output: null,
        created_at: new Date().toISOString(),
      };
      setActiveRequestId(body.request_id);
      applyRequest(optimisticRow);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canAfford = balance >= creditCost;
  const formValid = fields.every(
    (field) => !field.required || values[field.name]?.trim()
  );
  const submitDisabled = submitting || !canAfford || !formValid;
  const processing = isProcessing(activeRequest);
  const resultRows = isResolved(activeRequest)
    ? getResultRows(activeRequest?.output)
    : [];

  const failedMessage =
    activeRequest?.status === "failed"
      ? (activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No result was generated."
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Input panel ─────────────────────────────────────────── */}
        <section className={`${card} p-6`}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
            Input
          </h2>
          <p className={`mt-1 text-sm ${muted}`}>
            Tell us what to target and we&apos;ll run the workflow for you.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {fields.map((field) => (
              <div key={field.name}>
                <label
                  htmlFor={`field-${field.name}`}
                  className="mb-1.5 block text-sm font-semibold text-navy"
                >
                  {field.label}
                </label>
                <input
                  id={`field-${field.name}`}
                  type="text"
                  name={field.name}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      [field.name]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  className="w-full rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none"
                />
              </div>
            ))}

            {canAfford ? (
              <button
                type="submit"
                disabled={submitDisabled}
                className={`${btnPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {submitting
                  ? "Submitting…"
                  : `Submit (costs ${creditCost} credits)`}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled
                  className={`${btnPrimary} w-full cursor-not-allowed opacity-50`}
                >
                  Submit (costs {creditCost} credits)
                </button>
                <p className="text-center text-sm text-accent-deep">
                  Not enough credits —{" "}
                  <Link
                    href="/pricing"
                    className="font-semibold underline underline-offset-2 hover:text-navy"
                  >
                    upgrade your plan
                  </Link>
                </p>
              </div>
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
            {resultRows.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv(resultRows, columns, `${serviceName} results`)
                }
                className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-deep"
              >
                Export CSV
              </button>
            )}
          </div>

          {processing ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
              <Spinner />
              <p className="text-sm font-semibold text-navy">Processing…</p>
              <p className="text-sm text-slate-500">
                Your request is running. Results usually appear within a
                minute.
              </p>
            </div>
          ) : failedMessage ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-red-50 px-6 py-12 text-center ring-1 ring-red-200">
              <p className="text-sm font-semibold text-red-700">
                This request failed
              </p>
              <p className="text-sm text-red-600/80">{failedMessage}</p>
            </div>
          ) : resultRows.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                    {columns.map((column) => (
                      <th key={column.key} className="pb-2 pr-4">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row, index) => (
                    <tr
                      key={index}
                      className="border-b border-navy/[0.04] last:border-0"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className="py-2.5 pr-4 align-top text-slate-600"
                        >
                          {row[column.key] != null ? String(row[column.key]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                Your results will appear here once ready.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── History ───────────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          History
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Previous requests for this service. Click a row to re-open its
          result.
        </p>

        {history.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-4">Input</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openRequest(row)}
                    className="cursor-pointer border-b border-navy/[0.04] transition-colors last:border-0 hover:bg-mist/50"
                  >
                    <td className="py-3 pr-4 text-slate-600">
                      {summarizeInput(row.input, fields)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusStyles(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap text-slate-500">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`mt-4 text-sm ${muted}`}>
            No requests yet. Your first run will appear here.
          </p>
        )}
      </section>
    </div>
  );
}