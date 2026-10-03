"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { btnPrimary } from "@/lib/ui";
import { callDomainMonitor, errorMessage } from "./api";
import {
  DaysLeft,
  DetailRow,
  Label,
  Modal,
  Spinner,
  StatusBadge,
  Toggle,
  cx,
  inputClass,
} from "./ui";
import {
  formatDate,
  formatDateTime,
  relativeTime,
  textOrDash,
  toDateInputValue,
  toStringList,
  yesNo,
} from "./format";
import type {
  MonitorAlert,
  MonitorDetailsResponse,
  MonitorDomain,
  MonitorHistoryEntry,
} from "./types";

function ListBlock({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-slate-400">—</span>;

  return (
    <ul className="space-y-0.5">
      {values.map((value) => (
        <li key={value} className="break-all">
          {value}
        </li>
      ))}
    </ul>
  );
}

function Timeline({ entries }: { entries: MonitorHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-mist/40 px-4 py-3 text-sm text-slate-500">
        No checks recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3 border-l-2 border-navy/10 pl-4">
      {entries.map((entry, index) => (
        <li key={`${entry.checked_at}-${index}`} className="relative">
          <span className="absolute -left-[22px] top-1.5 size-2.5 rounded-full bg-accent ring-2 ring-white" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.whois_status} lastError={entry.error} />
            <DaysLeft value={entry.days_left} />
            <span className="ml-auto text-xs text-slate-400">
              {relativeTime(entry.checked_at)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(entry.checked_at)}
            {entry.expiry_date ? ` · expires ${formatDate(entry.expiry_date)}` : ""}
            {entry.registrar ? ` · ${entry.registrar}` : ""}
          </p>
          {entry.error && (
            <p className="mt-1 break-words text-xs text-red-600">{entry.error}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function DetailsDrawer({
  domain,
  focus = "info",
  onClose,
  onSaved,
  onRecheck,
  onSuccess,
  onError,
}: {
  domain: string;
  focus?: "info" | "edit";
  onClose: () => void;
  onSaved: (updated: MonitorDomain) => void;
  onRecheck: (domain: string) => void | Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<MonitorDetailsResponse | null>(null);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [history, setHistory] = useState<MonitorHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    client: "",
    notes: "",
    manualExpiry: "",
    active: true,
  });
  const editRef = useRef<HTMLDivElement | null>(null);

  const applyDomain = useCallback((next: MonitorDomain) => {
    setForm({
      label: next.label ?? "",
      client: next.client ?? "",
      notes: next.notes ?? "",
      manualExpiry: toDateInputValue(next.manual_expiry),
      active: next.active !== false,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    callDomainMonitor<MonitorDetailsResponse>({
      action: "details",
      domain,
    })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setAlerts(Array.isArray(response.alerts) ? response.alerts : []);
        setHistory(Array.isArray(response.history) ? response.history : []);
        if (response.domain) applyDomain(response.domain);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(errorMessage(error, "Could not load this domain."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyDomain, domain]);

  useEffect(() => {
    if (focus === "edit" && !loading && editRef.current) {
      editRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus, loading]);

  const current = data?.domain ?? null;

  const handleSave = async () => {
    if (!current || saving) return;

    setSaving(true);
    try {
      const response = await callDomainMonitor<{ domain: MonitorDomain }>({
        action: "update",
        domain: current.domain,
        label: form.label,
        client: form.client,
        notes: form.notes,
        manual_expiry: form.manualExpiry,
        active: form.active,
      });

      const updated = response.domain ?? { ...current };
      setData((prev) => (prev ? { ...prev, domain: updated } : prev));
      applyDomain(updated);
      onSaved(updated);
      onSuccess(`Saved changes to ${updated.domain}.`);
    } catch (error) {
      onError(errorMessage(error, "Could not save this domain."));
    } finally {
      setSaving(false);
    }
  };

  const handleRecheck = async () => {
    if (!current || rechecking) return;

    setRechecking(true);
    try {
      await onRecheck(current.domain);
    } finally {
      setRechecking(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={current?.domain ?? domain}
      subtitle={current ? `${current.registrar ?? "Registrar unknown"}` : undefined}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={handleRecheck}
            disabled={rechecking || saving || !current}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rechecking && <Spinner />}
            {rechecking ? "Queuing…" : "Re-check now"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !current}
            className={cx(
              btnPrimary,
              "px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {saving && <Spinner />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      {loading && !current ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner className="text-accent" />
          Loading domain…
        </div>
      ) : loadError && !current ? (
        <div className="rounded-2xl bg-red-50 px-5 py-8 text-center ring-1 ring-red-200">
          <p className="text-sm font-bold text-red-700">Could not load this domain</p>
          <p className="mt-1 text-sm text-red-600/90">{loadError}</p>
        </div>
      ) : current ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={current.whois_status}
              lastError={current.last_error}
            />
            <DaysLeft value={current.days_left} />
            {current.manual_expiry && (
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent-deep">
                manual expiry
              </span>
            )}
            {!current.active && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Inactive
              </span>
            )}
          </div>

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <DetailRow label="Registrar">{textOrDash(current.registrar)}</DetailRow>
            <DetailRow label="Created">{formatDate(current.created_date)}</DetailRow>
            <DetailRow label="Expires">{formatDate(current.expiry_date)}</DetailRow>
            <DetailRow label="Updated">{formatDate(current.updated_date)}</DetailRow>
            <DetailRow label="Last checked">
              {relativeTime(current.last_checked)}
            </DetailRow>
            <DetailRow label="Added">{formatDate(current.added_at)}</DetailRow>
            <DetailRow label="Has MX">{yesNo(current.has_mx)}</DetailRow>
            <DetailRow label="DNSSEC">{yesNo(current.dnssec)}</DetailRow>
            <DetailRow label="Client">{textOrDash(current.client)}</DetailRow>
            <DetailRow label="Label">{textOrDash(current.label)}</DetailRow>
            <DetailRow label="Status codes">
              <ListBlock values={toStringList(current.domain_status)} />
            </DetailRow>
            <DetailRow label="Nameservers">
              <ListBlock values={toStringList(current.nameservers)} />
            </DetailRow>
            <DetailRow label="A records">
              <ListBlock values={toStringList(current.a_records)} />
            </DetailRow>
            <div className="col-span-2 sm:col-span-3">
              <DetailRow label="Notes">{textOrDash(current.notes)}</DetailRow>
            </div>
            {current.last_error && (
              <div className="col-span-2 sm:col-span-3">
                <DetailRow label="Last error">
                  <span className="text-red-600">{current.last_error}</span>
                </DetailRow>
              </div>
            )}
          </section>

          <div ref={editRef} className="rounded-2xl bg-mist/40 p-4 ring-1 ring-navy/[0.05]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-navy">
                Edit
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Active</span>
                <Toggle
                  checked={form.active}
                  onChange={(next) =>
                    setForm((prev) => ({ ...prev, active: next }))
                  }
                  label="Active"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="detail-label">Label</Label>
                <input
                  id="detail-label"
                  type="text"
                  value={form.label}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, label: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="detail-client">Client</Label>
                <input
                  id="detail-client"
                  type="text"
                  value={form.client}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, client: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="detail-notes">Notes</Label>
                <textarea
                  id="detail-notes"
                  rows={3}
                  value={form.notes}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  className={cx(inputClass, "resize-y")}
                />
              </div>
              <div>
                <Label
                  htmlFor="detail-manual-expiry"
                  hint="Leave empty to clear the manual date"
                >
                  Manual expiry date
                </Label>
                <input
                  id="detail-manual-expiry"
                  type="date"
                  value={form.manualExpiry}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, manualExpiry: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-navy">
              Alerts
            </h3>
            {alerts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No alerts for this domain.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-xl bg-mist/40 px-4 py-3 text-sm ring-1 ring-navy/[0.05]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy">
                        {textOrDash(alert.type)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {relativeTime(alert.created_at)}
                      </span>
                      {alert.acknowledged && (
                        <span className="text-xs font-semibold text-emerald-600">
                          acknowledged
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-slate-600">
                      {textOrDash(alert.message)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-navy">
              Check history
            </h3>
            <div className="mt-3">
              <Timeline entries={history} />
            </div>
          </section>
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-slate-500">
          This domain is no longer tracked.
        </div>
      )}
    </Modal>
  );
}