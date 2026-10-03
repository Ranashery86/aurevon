"use client";

import Link from "next/link";
import { useState } from "react";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { callDomainMonitor, errorCode, errorMessage } from "./api";
import { Label, Modal, Spinner, cx, inputClass } from "./ui";
import type { AddResult, MonitorCredits } from "./types";

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeResult(result: AddResult | undefined): AddResult {
  return {
    added: Array.isArray(result?.added) ? result.added : [],
    duplicates: Array.isArray(result?.duplicates) ? result.duplicates : [],
    invalid: Array.isArray(result?.invalid) ? result.invalid : [],
  };
}

export function AddDomainsModal({
  open,
  creditCost,
  onClose,
  onAdded,
  onError,
}: {
  open: boolean;
  creditCost: number;
  onClose: () => void;
  onAdded: (credits: MonitorCredits | null) => void;
  onError: (message: string) => void;
}) {
  const [bulkText, setBulkText] = useState("");
  const [client, setClient] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);
  const [credits, setCredits] = useState<MonitorCredits | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const previewCount = bulkText
    .split(/[\s,;\n\r\t]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean).length;

  // Duplicates and invalid entries are never charged, so this is a worst case.
  const maxCharge = Math.max(creditCost, 0) * previewCount;

  const reset = () => {
    setBulkText("");
    setClient("");
    setLabel("");
    setResult(null);
    setCredits(null);
    setLimitReached(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || previewCount === 0) return;

    setSubmitting(true);
    setLimitReached(false);

    try {
      const payload: Record<string, unknown> = {
        action: "add",
        bulk_text: bulkText.trim(),
      };

      if (client.trim()) payload.client = client.trim();
      if (label.trim()) payload.label = label.trim();

      const response = await callDomainMonitor<
        AddResult & { credits?: MonitorCredits }
      >(payload);
      const normalized = normalizeResult(response);

      setResult(normalized);
      setCredits(response.credits ?? null);
      onAdded(response.credits ?? null);
    } catch (error) {
      const code = errorCode(error);

      if (code === "domain_limit_reached") {
        setLimitReached(true);
      } else {
        onError(errorMessage(error, "Could not add those domains."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add domains"
      subtitle="One domain per line, or separated by commas or spaces. Domains are saved instantly and checked in the background."
      wide
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className={`${btnSecondary} px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              type="submit"
              form="add-domains-form"
              disabled={submitting || previewCount === 0}
              className={cx(
                btnPrimary,
                "px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {submitting && <Spinner />}
              {submitting
                ? "Adding…"
                : `Add ${previewCount} domain${previewCount === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      }
    >
      <form id="add-domains-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label
            htmlFor="add-domains-bulk"
            hint="Example: example.com, example.org"
          >
            Domains
          </Label>
          <textarea
            id="add-domains-bulk"
            rows={8}
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            disabled={submitting}
            spellCheck={false}
            placeholder={"example.com\nexample.org, example.net"}
            className={cx(
              inputClass,
              "resize-y font-mono text-sm placeholder:font-sans placeholder:text-slate-400"
            )}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-accent-deep">
              {previewCount} domain{previewCount === 1 ? "" : "s"} detected
            </p>
            {previewCount > 0 && (
              <p className="text-xs text-slate-500">
                This will use up to {maxCharge} credit
                {maxCharge === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="add-domains-client" hint="Applied to all">
              Client
            </Label>
            <input
              id="add-domains-client"
              type="text"
              value={client}
              onChange={(event) => setClient(event.target.value)}
              disabled={submitting}
              placeholder="Acme Ltd"
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor="add-domains-label" hint="Applied to all">
              Label
            </Label>
            <input
              id="add-domains-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={submitting}
              placeholder="Primary domains"
              className={inputClass}
            />
          </div>
        </div>
      </form>

      {limitReached && (
        <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">
            You have reached the number of domains included in your plan.
          </p>
          <p className="mt-1">
            Remove a few domains or{" "}
            <Link
              href="/pricing"
              className="font-semibold underline underline-offset-2 hover:text-navy"
            >
              upgrade your plan
            </Link>{" "}
            to add more.
          </p>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-3 rounded-2xl bg-mist/50 p-4 ring-1 ring-navy/[0.05]">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              {countEntries(result.added)} added
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              {countEntries(result.duplicates)} duplicate
              {countEntries(result.duplicates) === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200">
              {countEntries(result.invalid)} invalid
            </span>
          </div>

          {credits && credits.charged > 0 && (
            <p className="text-xs text-slate-600">
              Used {credits.charged} credit{credits.charged === 1 ? "" : "s"} —
              {credits.balance} remaining.
            </p>
          )}

          {credits && credits.charged === 0 && countEntries(result.added) === 0 && (
            <p className="text-xs text-slate-600">
              Nothing new was added, so no credits were used.
            </p>
          )}

          {countEntries(result.duplicates) > 0 && (
            <p className="break-words text-xs text-slate-600">
              Already tracked: {result.duplicates.join(", ")}
            </p>
          )}

          {countEntries(result.invalid) > 0 && (
            <ul className="space-y-1.5">
              {result.invalid.map((entry, index) => (
                <li
                  key={`${entry.input}-${index}`}
                  className="rounded-xl bg-white px-3 py-2 text-xs text-red-700 ring-1 ring-red-200"
                >
                  <span className="font-bold break-all">{entry.input || "—"}</span>
                  <span className="ml-1.5 text-red-600/80">
                    {entry.reason || "Invalid domain"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-500">
            New domains appear as “Checking…” and update automatically. Close this
            window to see them in the list.
          </p>
        </div>
      )}
    </Modal>
  );
}
