const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

// A bare "YYYY-MM-DD" from the API has no timezone, so it is built as a local
// date — otherwise it renders a day early for anyone west of UTC.
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";

  return `${date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function relativeTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) return "just now";
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1m ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(months / 12)}y ago`;
}

export function toDateInputValue(
  value: string | null | undefined
): string {
  if (!value) return "";

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;

  const date = parseDate(value);
  if (!date) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry != null && String(entry).trim() !== "")
    .map((entry) => String(entry).trim());
}

export function yesNo(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "1", "signeddelegation", "clienttransferprohibited"].includes(text)) {
    return "Yes";
  }
  if (["false", "no", "0", "unsigned"].includes(text)) return "No";
  return String(value);
}

export function textOrDash(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}