"use client";

import { useState } from "react";
import { card, btnPrimary, muted } from "@/lib/ui";
import {
  useServiceRequestHistory,
  isProcessingRequest,
  isResolvedRequest,
} from "@/hooks/use-service-request-history";
import { HistoryTable, Spinner, UpgradeNotice } from "@/components/service-workflow-shared";
import type {
  ServiceColumn,
  ServiceField,
  ServiceRequestRow,
  ServiceResultRow,
} from "@/lib/services/types";

type ServiceWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  creditCost: number;
  balance: number;
  fields: ServiceField[];
  columns: ServiceColumn[];
  history: ServiceRequestRow[];
  // When set, the cost of a run is the numeric value of this field
  // (e.g. "leads_count" for Lead Generation: 1 lead = 1 credit).
  creditCostField?: string;
  buttonLabel?: string;
};

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

function formatUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function CellValue({
  column,
  row,
}: {
  column: ServiceColumn;
  row: ServiceResultRow;
}) {
  const value = row[column.key];

  if (column.type === "link") {
    const href = formatUrl(value);
    if (!href) return <span>—</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-deep underline underline-offset-2 hover:text-navy"
      >
        {String(value)}
      </a>
    );
  }

  return <span>{value != null ? String(value) : "—"}</span>;
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
  creditCostField,
  buttonLabel = "Submit",
}: ServiceWorkflowProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      if (field.defaultValue !== undefined) {
        initial[field.name] = String(field.defaultValue);
      }
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

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
      launchRequest(body.request_id, optimisticRow);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestedCost = creditCostField
    ? Number(values[creditCostField]) || 0
    : creditCost;
  const cost = Math.max(0, requestedCost);

  const canAfford = balance >= cost;
  const formValid = fields.every((field) => {
    const value = values[field.name]?.trim();
    if (field.required && !value) return false;
    if (field.type === "number") {
      if (!value) return true;
      const num = Number(value);
      if (!Number.isFinite(num)) return false;
      if (field.min !== undefined && num < field.min) return false;
      if (field.max !== undefined && num > field.max) return false;
    }
    return true;
  });
  const submitDisabled = submitting || !canAfford || !formValid;
  const processing = isProcessingRequest(activeRequest);
  const resultRows = isResolvedRequest(activeRequest)
    ? getResultRows(activeRequest?.output)
    : [];

  const failedMessage =
    activeRequest?.status === "failed"
      ? (activeRequest.output as { error?: string } | null)?.error ??
        "This request failed. No result was generated."
      : null;

  return (
    <div className="space-y-6">
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
                type={field.type === "number" ? "number" : "text"}
                name={field.name}
                value={values[field.name] ?? ""}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    [field.name]: event.target.value,
                  }))
                }
                min={field.min}
                max={field.max}
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
                : `${buttonLabel} (costs ${cost} credits)`}
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
              Your request is running. Results usually appear within a minute.
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
                        <CellValue column={column} row={row} />
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

      {/* ── History ───────────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          History
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Previous requests for this service. Click a row to re-open its
          result.
        </p>

        <HistoryTable history={history} fields={fields} onOpen={openRequest} />
      </section>
    </div>
  );
}