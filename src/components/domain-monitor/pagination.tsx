"use client";

import { cx } from "./ui";
import type { MonitorPagination } from "./types";

export function Pagination({
  pagination,
  onPageChange,
  loading,
}: {
  pagination: MonitorPagination | null;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  if (!pagination) return null;

  const totalPages = Math.max(1, Number(pagination.total_pages ?? 1));
  const page = Number(pagination.page ?? 1);
  const totalItems = Number(pagination.total_items ?? 0);
  const from = totalItems === 0 ? 0 : (page - 1) * Number(pagination.page_size ?? 100) + 1;
  const to = Math.min(totalItems, page * Number(pagination.page_size ?? 100));

  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-navy/[0.05] sm:flex-row">
      <p className="text-xs font-semibold text-slate-500">
        {totalItems === 0
          ? "No domains on this page"
          : `Showing ${from}–${to} of ${totalItems}`}
      </p>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={loading || !pagination.has_prev || page <= 1}
          className={cx(
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist sm:flex-none",
            (loading || !pagination.has_prev || page <= 1) &&
              "cursor-not-allowed opacity-40 hover:bg-transparent"
          )}
        >
          ← Previous
        </button>

        <span className="shrink-0 text-xs font-bold text-slate-500">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={loading || !pagination.has_next || page >= totalPages}
          className={cx(
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist sm:flex-none",
            (loading || !pagination.has_next || page >= totalPages) &&
              "cursor-not-allowed opacity-40 hover:bg-transparent"
          )}
        >
          Next →
        </button>
      </div>
    </div>
  );
}