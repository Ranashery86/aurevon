"use client";

import { inputClass, selectClass, Spinner, cx } from "./ui";
import type { ListSort, ListStatusFilter } from "./types";

const STATUS_OPTIONS: { value: ListStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "ok", label: "Active" },
  { value: "error", label: "Check failed" },
  { value: "unsupported_tld", label: "Manual date needed" },
];

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "expiry_asc", label: "Expiry: soonest first" },
  { value: "expiry_desc", label: "Expiry: latest first" },
  { value: "domain", label: "Domain: A → Z" },
  { value: "client", label: "Client: A → Z" },
];

export function FiltersBar({
  search,
  onSearchChange,
  client,
  clients,
  onClientChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  refreshing,
  onRefresh,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  client: string;
  clients: string[];
  onClientChange: (value: string) => void;
  status: ListStatusFilter;
  onStatusChange: (value: ListStatusFilter) => void;
  sort: ListSort;
  onSortChange: (value: ListSort) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search domain, client or label…"
            aria-label="Search domains"
            className={cx(inputClass, "pl-9")}
          />
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
            <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <select
          value={client}
          onChange={(event) => onClientChange(event.target.value)}
          aria-label="Filter by client"
          className={selectClass}
        >
          <option value="">All clients</option>
          {clients.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as ListStatusFilter)
          }
          aria-label="Filter by status"
          className={selectClass}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as ListSort)}
          aria-label="Sort domains"
          className={selectClass}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? <Spinner /> : null}
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </div>
  );
}