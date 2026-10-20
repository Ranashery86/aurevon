import Link from "next/link";
import type {
  ServiceField,
  ServiceRequestRow,
} from "@/lib/services/types";

export function Spinner() {
  return (
    <div
      className="size-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
      aria-hidden
    />
  );
}

export function statusStyles(status: ServiceRequestRow["status"]) {
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

export function summarizeInput(
  input: ServiceRequestRow["input"],
  fields: ServiceField[]
): string {
  if (!input) return "—";
  const parts = fields
    .map((field) => {
      const raw = input[field.name];
      return raw == null ? "" : String(raw).trim();
    })
    .filter((value) => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(input);
}

// Render a stored input value for a history cell. Arrays (e.g. the website
// crawler's list of URLs) are joined so they read naturally in a table cell.
function displayInputValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value != null ? String(value) : "—";
}

// Reusable history table for every service page. Renders one column per
// field (e.g. industry/location/leads_count, or content type/tone/length,
// or the website list) plus status and date; clicking a row re-opens its
// result. Pass formatCell to override how a specific field's value renders.
export function HistoryTable({
  history,
  fields,
  onOpen,
  emptyMessage = "No requests yet. Your first run will appear here.",
  formatCell,
}: {
  history: ServiceRequestRow[];
  fields: ServiceField[];
  onOpen: (row: ServiceRequestRow) => void;
  emptyMessage?: string;
  formatCell?: (
    field: ServiceField,
    input: ServiceRequestRow["input"]
  ) => string | null | undefined;
}) {
  if (history.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy/[0.06] text-xs font-bold uppercase tracking-wider text-slate-400">
            {fields.map((field) => (
              <th key={field.name} className="pb-2 pr-4">
                {field.label}
              </th>
            ))}
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {history.map((row) => (
            <tr
              key={row.id}
              onClick={() => onOpen(row)}
              className="cursor-pointer border-b border-navy/[0.04] transition-colors last:border-0 hover:bg-mist/50"
            >
              {fields.map((field) => (
                <td key={field.name} className="py-3 pr-4 text-slate-600">
                  {formatCell
                    ? (formatCell(field, row.input) ??
                      displayInputValue(row.input?.[field.name]))
                    : displayInputValue(row.input?.[field.name])}
                </td>
              ))}
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
  );
}

export function UpgradeNotice({ cost }: { cost: number }) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled
        className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white opacity-50 shadow-lg shadow-accent/30"
      >
        Submit (costs {cost} credits)
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
  );
}