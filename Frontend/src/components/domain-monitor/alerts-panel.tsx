"use client";

import { useState } from "react";
import { btnSecondary } from "@/lib/ui";
import { callDomainMonitor, errorMessage } from "./api";
import { Modal, Spinner, cx } from "./ui";
import { relativeTime, textOrDash } from "./format";
import type { MonitorAlert } from "./types";

function priorityTone(priority: string | null | undefined) {
  const value = String(priority ?? "").toLowerCase();

  if (value === "high") return "bg-red-50 text-red-700 ring-red-200";
  if (value === "info") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-mist text-slate-600 ring-navy/10";
}

export function AlertsPanel({
  open,
  onClose,
  alerts,
  loading,
  onRefresh,
  onSuccess,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  alerts: MonitorAlert[];
  loading: boolean;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState<number | "all" | null>(null);

  const acknowledge = async (target: number | "all") => {
    if (busyId !== null) return;

    setBusyId(target);
    try {
      const payload =
        target === "all" ? { action: "ack_alert", all: true } : { action: "ack_alert", id: target };

      const response = await callDomainMonitor<{ acknowledged: number }>(payload);
      const count = response.acknowledged ?? 0;
      onRefresh();
      onSuccess(`Acknowledged ${count} alert${count === 1 ? "" : "s"}.`);
    } catch (error) {
      onError(errorMessage(error, "Could not acknowledge that alert."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alerts"
      subtitle="Expiry alerts raised by the monitor. They appear here whether or not email is enabled."
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={`${btnSecondary} px-5 py-2.5`}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => acknowledge("all")}
            disabled={busyId !== null || alerts.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyId === "all" && <Spinner />}
            Acknowledge all
          </button>
        </>
      }
    >
      {loading && alerts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner className="text-accent" />
          Loading alerts…
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl bg-mist/40 px-5 py-10 text-center">
          <p className="text-sm font-bold text-navy">No open alerts</p>
          <p className="mt-1 text-sm text-slate-500">
            You&apos;ll be notified here when a domain is close to expiry, expired
            or needs a manual date.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="rounded-2xl bg-mist/40 p-4 ring-1 ring-navy/[0.05]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cx(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1",
                    priorityTone(alert.priority)
                  )}
                >
                  {textOrDash(alert.type)}
                </span>
                <span className="break-all text-sm font-bold text-navy">
                  {alert.domain}
                </span>
                {alert.client && (
                  <span className="text-xs text-slate-500">{alert.client}</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {relativeTime(alert.created_at)}
                </span>
              </div>

              <p className="mt-2 text-sm break-words text-slate-600">
                {textOrDash(alert.message)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {alert.days_left != null && (
                  <span className="text-xs font-semibold text-slate-500">
                    {alert.days_left < 0
                      ? `Expired ${Math.abs(alert.days_left)}d ago`
                      : `${alert.days_left} days left`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => acknowledge(alert.id)}
                  disabled={busyId !== null}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === alert.id && <Spinner className="size-3" />}
                  Acknowledge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}