"use client";

import { cx } from "./ui";
import type { ListStatusFilter, MonitorSummary } from "./types";

type CardConfig = {
  key: string;
  label: string;
  shortLabel: string;
  value: number | null;
  filter: ListStatusFilter | null;
  tone: string;
};

export function SummaryCards({
  summary,
  loading,
  activeStatus,
  onSelect,
}: {
  summary: MonitorSummary | null;
  loading: boolean;
  activeStatus: ListStatusFilter;
  onSelect: (status: ListStatusFilter) => void;
}) {
  const read = (value: number | undefined) =>
    value == null ? null : Math.trunc(value);

  const cards: CardConfig[] = [
    {
      key: "total",
      label: "Total domains",
      shortLabel: "Total",
      value: read(summary?.total),
      filter: "all",
      tone: "text-navy",
    },
    {
      key: "expiring_30d",
      label: "Expiring in 30 days",
      shortLabel: "≤ 30 days",
      value: read(summary?.expiring_30d),
      filter: "expiring",
      tone: "text-orange-600",
    },
    {
      key: "expiring_7d",
      label: "Expiring in 7 days",
      shortLabel: "≤ 7 days",
      value: read(summary?.expiring_7d),
      filter: "expiring",
      tone: "text-red-600",
    },
    {
      key: "expired",
      label: "Expired",
      shortLabel: "Expired",
      value: read(summary?.expired),
      filter: "expired",
      tone: "text-red-600",
    },
    {
      key: "errors",
      label: "Errors",
      shortLabel: "Errors",
      value: read(summary?.errors),
      filter: "error",
      tone: "text-red-600",
    },
    {
      key: "unsupported_tld",
      label: "Manual date needed",
      shortLabel: "Manual date",
      value: read(summary?.unsupported_tld),
      filter: "unsupported_tld",
      tone: "text-amber-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const isActive =
          card.filter !== null && activeStatus === card.filter && card.key !== "expiring_7d";

        return (
          <button
            key={card.key}
            type="button"
            disabled={loading || card.value === null}
            onClick={() => card.filter && onSelect(card.filter)}
            title={card.filter ? `Filter by ${card.label.toLowerCase()}` : undefined}
            className={cx(
              "rounded-2xl bg-white p-4 text-left ring-1 transition-all duration-200",
              "shadow-[0_18px_36px_-24px_rgba(15,42,74,0.28)]",
              card.value === null
                ? "cursor-default opacity-70"
                : "hover:-translate-y-0.5 hover:shadow-md",
              isActive ? "ring-2 ring-accent" : "ring-navy/[0.05]"
            )}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="sm:hidden">{card.shortLabel}</span>
              <span className="hidden sm:inline">{card.label}</span>
            </p>
            <p
              className={cx(
                "mt-1 text-2xl font-bold tracking-tight",
                card.value === null ? "text-slate-300" : card.tone
              )}
            >
              {loading && card.value === null ? "–" : (card.value ?? 0)}
            </p>
          </button>
        );
      })}
    </div>
  );
}