"use client";

import { useState, type ReactNode } from "react";
import {
  DaysLeft,
  ManualTag,
  NameServers,
  Spinner,
  StatusBadge,
  cx,
} from "./ui";
import { formatDate, relativeTime, textOrDash, toStringList } from "./format";
import type { MonitorDomain } from "./types";

type TableProps = {
  items: MonitorDomain[];
  checking: Set<string>;
  rechecking: string | null;
  onDetails: (domain: string) => void;
  onEdit: (domain: string) => void;
  onRecheck: (domain: string) => void;
  onDelete: (domain: string) => void;
  onSetManualExpiry: (domain: string, date: string) => void;
};

function QuickExpirySetter({
  domain,
  onSave,
}: {
  domain: string;
  onSave: (domain: string, date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300 transition-colors hover:bg-amber-50"
      >
        Set expiry date
      </button>
    );
  }

  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value) return;
        onSave(domain, value);
        setOpen(false);
        setValue("");
      }}
    >
      <input
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Expiry date for ${domain}`}
        className="rounded-lg border border-navy/10 bg-white px-2 py-1 text-xs text-navy focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value}
        className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-navy"
      >
        Cancel
      </button>
    </form>
  );
}

function ExpiryCell({ item }: { item: MonitorDomain }) {
  const manual = Boolean(item.manual_expiry);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap">{formatDate(item.expiry_date)}</span>
      {manual && <ManualTag />}
    </span>
  );
}

function RowActions({
  item,
  busy,
  onDetails,
  onEdit,
  onRecheck,
  onDelete,
  compact = false,
}: {
  item: MonitorDomain;
  busy: boolean;
  onDetails: (domain: string) => void;
  onEdit: (domain: string) => void;
  onRecheck: (domain: string) => void;
  onDelete: (domain: string) => void;
  compact?: boolean;
}) {
  const base = cx(
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    compact ? "" : "whitespace-nowrap"
  );

  return (
    <div className={cx("flex flex-wrap gap-1.5", compact ? "" : "justify-end")}>
      <button
        type="button"
        onClick={() => onDetails(item.domain)}
        className={cx(base, "bg-white text-navy ring-navy/10 hover:bg-mist")}
      >
        Details
      </button>
      <button
        type="button"
        onClick={() => onEdit(item.domain)}
        className={cx(base, "bg-white text-navy ring-navy/10 hover:bg-mist")}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onRecheck(item.domain)}
        disabled={busy}
        className={cx(base, "bg-white text-accent-deep ring-accent/20 hover:bg-blush")}
      >
        {busy ? <Spinner className="size-3" /> : null}
        {busy ? "Checking…" : "Re-check"}
      </button>
      <button
        type="button"
        onClick={() => onDelete(item.domain)}
        disabled={busy}
        className={cx(base, "bg-white text-red-600 ring-red-200 hover:bg-red-50")}
      >
        Delete
      </button>
    </div>
  );
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cx("py-3 pr-4 align-top text-slate-600", className)}>
      {children}
    </td>
  );
}

export function DomainTable({
  items,
  checking,
  rechecking,
  onDetails,
  onEdit,
  onRecheck,
  onDelete,
  onSetManualExpiry,
}: TableProps) {
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
              <th className="pb-2 pr-4">Domain</th>
              <th className="pb-2 pr-4">Client</th>
              <th className="pb-2 pr-4">Registrar</th>
              <th className="pb-2 pr-4">Expiry</th>
              <th className="pb-2 pr-4">Days left</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Nameservers</th>
              <th className="pb-2 pr-4">Last checked</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isChecking =
                rechecking === item.domain ||
                checking.has(item.domain) ||
                item.whois_status === "pending";
              const needsManual = item.whois_status === "unsupported_tld";

              return (
                <tr
                  key={item.domain}
                  className="border-b border-navy/[0.04] align-top transition-colors last:border-0 hover:bg-mist/40"
                >
                  <Cell className="max-w-56">
                    <p className="font-semibold break-all text-navy">
                      {item.domain}
                    </p>
                    {item.label && (
                      <p className="mt-0.5 text-xs text-slate-500">{item.label}</p>
                    )}
                  </Cell>
                  <Cell className="max-w-32">
                    <span className="break-words">{textOrDash(item.client)}</span>
                  </Cell>
                  <Cell className="max-w-36">
                    <span className="break-words">{textOrDash(item.registrar)}</span>
                  </Cell>
                  <Cell className="whitespace-nowrap">
                    <ExpiryCell item={item} />
                  </Cell>
                  <Cell>
                    <DaysLeft value={item.days_left} />
                  </Cell>
                  <Cell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge
                        status={item.whois_status}
                        checking={isChecking}
                        lastError={item.last_error}
                      />
                      {needsManual && (
                        <QuickExpirySetter
                          domain={item.domain}
                          onSave={onSetManualExpiry}
                        />
                      )}
                    </div>
                  </Cell>
                  <Cell className="max-w-40">
                    <NameServers servers={toStringList(item.nameservers)} />
                  </Cell>
                  <Cell className="whitespace-nowrap text-slate-500">
                    {relativeTime(item.last_checked)}
                  </Cell>
                  <Cell>
                    <RowActions
                      item={item}
                      busy={rechecking === item.domain}
                      onDetails={onDetails}
                      onEdit={onEdit}
                      onRecheck={onRecheck}
                      onDelete={onDelete}
                    />
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const isChecking =
            rechecking === item.domain ||
            checking.has(item.domain) ||
            item.whois_status === "pending";
          const needsManual = item.whois_status === "unsupported_tld";

          return (
            <article
              key={item.domain}
              className="rounded-2xl bg-mist/40 p-4 ring-1 ring-navy/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-bold text-navy">
                    {item.domain}
                  </p>
                  {item.label && (
                    <p className="mt-0.5 text-xs text-slate-500">{item.label}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <DaysLeft value={item.days_left} />
                </div>
              </div>

              <div className="mt-3">
                <StatusBadge
                  status={item.whois_status}
                  checking={isChecking}
                  lastError={item.last_error}
                />
                {needsManual && (
                  <QuickExpirySetter
                    domain={item.domain}
                    onSave={onSetManualExpiry}
                  />
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Client
                  </dt>
                  <dd className="mt-0.5 break-words text-navy">
                    {textOrDash(item.client)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Registrar
                  </dt>
                  <dd className="mt-0.5 break-words text-navy">
                    {textOrDash(item.registrar)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Expiry
                  </dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-navy">
                    <ExpiryCell item={item} />
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Last checked
                  </dt>
                  <dd className="mt-0.5 text-navy">
                    {relativeTime(item.last_checked)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Nameservers
                  </dt>
                  <dd className="mt-0.5">
                    <NameServers servers={toStringList(item.nameservers)} />
                  </dd>
                </div>
              </dl>

              <div className="mt-3 border-t border-navy/[0.06] pt-3">
                <RowActions
                  item={item}
                  busy={rechecking === item.domain}
                  onDetails={onDetails}
                  onEdit={onEdit}
                  onRecheck={onRecheck}
                  onDelete={onDelete}
                  compact
                />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}