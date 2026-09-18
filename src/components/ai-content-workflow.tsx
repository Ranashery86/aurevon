"use client";

import { useCallback, useState } from "react";
import { card, btnPrimary, btnNavy, muted } from "@/lib/ui";
import {
  AI_CONTENT_TYPES,
  AI_CONTENT_TONES,
  AI_CONTENT_LENGTHS,
  getAiContentWritingCost,
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
} from "@/lib/services/types";

const OPTION_MAP: Record<string, readonly string[]> = {
  content_type: AI_CONTENT_TYPES,
  tone: AI_CONTENT_TONES,
  length: AI_CONTENT_LENGTHS,
};

type AiContentWorkflowProps = {
  serviceKey: string;
  serviceName: string;
  balance: number;
  fields: ServiceField[];
  history: ServiceRequestRow[];
};

export function AiContentWorkflow({
  serviceKey,
  serviceName,
  balance,
  fields,
  history: initialHistory,
}: AiContentWorkflowProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.name] =
        field.defaultValue !== undefined ? String(field.defaultValue) : "";
    }
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [lastLoadedRequestId, setLastLoadedRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { history, activeRequest, openRequest, launchRequest } =
    useServiceRequestHistory(initialHistory);

  // Seed the editable draft from the resolved request's output. This is the
  // "adjust state during render" pattern (see react.dev — storing info from
  // previous renders) rather than an effect: it runs exactly once per request
  // id (the guard below) and is only re-triggered when a NEW request resolves,
  // so user edits to the textarea are never clobbered by re-renders.
  if (
    activeRequest &&
    isResolvedRequest(activeRequest) &&
    lastLoadedRequestId !== activeRequest.id
  ) {
    const output = activeRequest.output as Record<string, unknown> | null;
    setDraft(typeof output?.content === "string" ? output.content : "");
    setLastLoadedRequestId(activeRequest.id);
  }

  const submitValues = useCallback(
    async (vals: Record<string, string>) => {
      setSubmitError(null);
      setSubmitting(true);
      setDraft("");
      setLastLoadedRequestId(null);

      try {
        const response = await fetch(`/api/services/${serviceKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: vals }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          request_id?: string;
          error?: string;
        };

        if (!response.ok || !body.request_id) {
          setSubmitError(
            body.error ?? "Something went wrong. Please try again."
          );
          return;
        }

        launchRequest(body.request_id, {
          id: body.request_id,
          uuid: "",
          service_name: serviceName,
          service_key: serviceKey,
          status: "processing",
          input: vals,
          output: null,
          created_at: new Date().toISOString(),
        });
      } catch {
        setSubmitError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [serviceKey, serviceName, launchRequest]
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void submitValues(values);
    },
    [submitValues, values]
  );

  const handleRegenerate = useCallback(() => {
    void submitValues(values);
  }, [submitValues, values]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [draft]);

  const handleDownload = useCallback(() => {
    if (!draft) return;
    const slug = serviceName.replace(/\s+/g, "-").toLowerCase();
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${slug}-result.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }, [draft, serviceName]);

  const cost = getAiContentWritingCost(values.length) ?? 0;
  const canAfford = balance >= cost;
  const isBusy = submitting || isProcessingRequest(activeRequest);

  const outputContent =
    isResolvedRequest(activeRequest) && activeRequest
      ? ((activeRequest.output as Record<string, unknown> | null)?.content as string | undefined) ?? null
      : null;

  const failedMessage =
    activeRequest?.status === "failed"
      ? ((activeRequest.output as Record<string, unknown> | null)?.error as string | undefined) ??
        "This request failed. No content was generated."
      : null;

  return (
    <div className="space-y-6">
      {/* ── Input panel ─────────────────────────────────────────── */}
      <section className={`${card} p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Input
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Tell us what to write and we&apos;ll generate it for you.
        </p>

        <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
          {fields.map((field) => {
            const options = OPTION_MAP[field.name];

            if (field.name === "topic") {
              return (
                <div key={field.name}>
                  <label
                    htmlFor={`field-${field.name}`}
                    className="mb-1.5 block text-sm font-semibold text-navy"
                  >
                    {field.label}
                  </label>
                  <textarea
                    id={`field-${field.name}`}
                    name={field.name}
                    rows={4}
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none"
                  />
                </div>
              );
            }

            if (options) {
              return (
                <div key={field.name}>
                  <label
                    htmlFor={`field-${field.name}`}
                    className="mb-1.5 block text-sm font-semibold text-navy"
                  >
                    {field.label}
                  </label>
                  <select
                    id={`field-${field.name}`}
                    name={field.name}
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    required={field.required}
                    className="w-full rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-navy focus:border-accent focus:outline-none"
                  >
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            return null;
          })}

          {canAfford ? (
            <button
              type="submit"
              disabled={!canAfford || submitting}
              className={`${btnPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {submitting ? "Submitting…" : `Submit (costs ${cost} credits)`}
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
        <h2 className="text-sm font-bold uppercase tracking-wider text-navy">
          Output
        </h2>

        {isBusy ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <Spinner />
            <p className="text-sm font-semibold text-navy">Generating…</p>
            <p className="text-sm text-slate-500">
              Your content is being generated. This usually takes a few seconds.
            </p>
          </div>
        ) : failedMessage ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-red-50 px-6 py-12 text-center ring-1 ring-red-200">
            <p className="text-sm font-semibold text-red-700">
              Generation failed
            </p>
            <p className="text-sm text-red-600/80">{failedMessage}</p>
          </div>
        ) : outputContent ? (
          <div className="mt-5 space-y-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="w-full resize-y rounded-xl border border-navy/10 bg-white px-4 py-3 text-sm leading-relaxed text-navy focus:border-accent focus:outline-none"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className={`${btnPrimary} px-5 py-2.5 text-xs`}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className={`${btnNavy} px-5 py-2.5 text-xs`}
              >
                Download .txt
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-full border border-accent/30 px-5 py-2.5 text-xs font-semibold text-accent-deep transition-colors hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl bg-mist/40 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              Your generated content will appear here once ready.
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
          Previous content requests. Click a row to re-open its result.
        </p>

        <HistoryTable
          history={history}
          fields={fields}
          onOpen={openRequest}
          emptyMessage="No content generated yet. Your first result will appear here."
        />
      </section>
    </div>
  );
}