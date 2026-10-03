"use client";

import { useEffect, type ReactNode } from "react";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const inputClass =
  "w-full rounded-xl border border-navy/10 bg-white px-3.5 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none";

export const selectClass = cx(inputClass, "appearance-none bg-white pr-9");

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy">
        {children}
      </label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]",
        className
      )}
      aria-hidden
    />
  );
}

export function IconButton({
  onClick,
  label,
  children,
  disabled,
  className,
  type = "button",
}: {
  onClick?: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-navy/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative z-10 my-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl ring-1 ring-navy/10 sm:my-8 sm:rounded-3xl sm:p-6",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-navy">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition-colors hover:bg-mist hover:text-navy"
          >
            ×
          </button>
        </div>

        <div className="mt-5">{children}</div>

        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`${btnSecondary} px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Spinner />}
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

const STATUS_BADGES: Record<
  string,
  { label: string; className: string; spin: boolean }
> = {
  ok: {
    label: "Active",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    spin: false,
  },
  pending: {
    label: "Checking…",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    spin: true,
  },
  unsupported_tld: {
    label: "Manual date needed",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    spin: false,
  },
  not_found: {
    label: "Not found / may be dropped",
    className: "bg-red-50 text-red-700 ring-red-200",
    spin: false,
  },
  rate_limited: {
    label: "Rate limited, retry later",
    className: "bg-orange-50 text-orange-700 ring-orange-200",
    spin: false,
  },
  error: {
    label: "Check failed",
    className: "bg-red-50 text-red-700 ring-red-200",
    spin: false,
  },
};

export function StatusBadge({
  status,
  checking = false,
  lastError,
}: {
  status: string | null | undefined;
  checking?: boolean;
  lastError?: string | null;
}) {
  const key = checking ? "pending" : (status ?? "pending");
  const meta = STATUS_BADGES[key] ?? {
    label: key ? key.replace(/_/g, " ") : "Unknown",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    spin: false,
  };

  const badge = (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        meta.className
      )}
    >
      {meta.spin && <Spinner className="size-3" />}
      <span className="truncate">{meta.label}</span>
    </span>
  );

  if (!lastError) return badge;

  return (
    <span className="group relative inline-flex">
      <span title={lastError}>{badge}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-xl bg-navy px-3 py-2 text-xs font-medium text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {lastError}
      </span>
    </span>
  );
}

export function DaysLeft({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-slate-400">-</span>;
  }

  const days = Math.trunc(value);

  if (days < 0) {
    return (
      <span className="inline-flex flex-col">
        <span className="font-bold text-red-600">Expired</span>
        <span className="text-xs text-red-500">{Math.abs(days)}d ago</span>
      </span>
    );
  }

  const tone =
    days <= 7
      ? "bg-red-50 text-red-700 ring-red-200"
      : days <= 30
        ? "bg-orange-50 text-orange-700 ring-orange-200"
        : days <= 60
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1",
        tone
      )}
    >
      {days}d
    </span>
  );
}

export function ManualTag() {
  return (
    <span
      title="This expiry date was entered manually"
      className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-deep"
    >
      manual
    </span>
  );
}

export function NameServers({ servers }: { servers: string[] }) {
  if (servers.length === 0) return <span className="text-slate-400">-</span>;

  const shown = servers.slice(0, 2);
  const extra = servers.length - shown.length;

  return (
    <span className="flex flex-col gap-0.5 text-xs text-slate-600">
      {shown.map((server) => (
        <span key={server} className="break-all">
          {server}
        </span>
      ))}
      {extra > 0 && (
        <span className="font-semibold text-accent-deep">+{extra} more</span>
      )}
    </span>
  );
}

export type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:left-auto sm:right-6 sm:w-96"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cx(
            "pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ring-1",
            toast.tone === "success"
              ? "bg-emerald-600 text-white ring-emerald-700/30"
              : toast.tone === "error"
                ? "bg-red-600 text-white ring-red-700/30"
                : "bg-navy text-white ring-navy/20"
          )}
        >
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="-mr-1 -mt-0.5 shrink-0 rounded-full px-1 text-lg leading-none text-white/70 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-mist/40 px-5 py-12 text-center">
      <p className="text-sm font-bold text-navy">{title}</p>
      <p className="max-w-md text-sm text-slate-500">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-red-50 px-5 py-10 text-center ring-1 ring-red-200">
      <p className="text-sm font-bold text-red-700">Could not load domains</p>
      <p className="max-w-md text-sm text-red-600/90">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`${btnPrimary} px-5 py-2.5`}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading domains">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-mist/60"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-slate-300"
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-0.5 break-words text-sm text-navy">{children}</div>
    </div>
  );
}