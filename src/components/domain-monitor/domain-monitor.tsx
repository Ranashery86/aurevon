"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary, card, muted } from "@/lib/ui";
import {
  callDomainMonitor,
  errorCode,
  errorMessage,
  errorStatus,
  setUnauthorizedHandler,
} from "./api";
import { SummaryCards } from "./summary-cards";
import { FiltersBar } from "./filters-bar";
import { DomainTable } from "./domain-table";
import { Pagination } from "./pagination";
import { AddDomainsModal } from "./add-domains-modal";
import { DetailsDrawer } from "./details-drawer";
import { AlertsPanel } from "./alerts-panel";
import { SettingsModal } from "./settings-modal";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRows,
  Spinner,
  ToastStack,
  type Toast,
} from "./ui";
import type {
  ListQuery,
  ListSort,
  ListStatusFilter,
  MonitorAlert,
  MonitorCredits,
  MonitorDomain,
  MonitorListResponse,
  MonitorPagination,
  MonitorSummary,
} from "./types";

const PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 120000;
const BACKGROUND_REFRESH_MS = 60000;
const SEARCH_DEBOUNCE_MS = 400;

const INITIAL_QUERY: ListQuery = {
  search: "",
  client: "",
  status: "all",
  sort: "expiry_asc",
  page: 1,
};

type LoadOptions = {
  silent?: boolean;
  alerts?: boolean;
};

type AlertsResult =
  | { ok: true; alerts: MonitorAlert[]; count: number }
  | { ok: false; message: string };

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

export function DomainMonitor({
  initialBalance,
  creditCost,
}: {
  initialBalance: number;
  creditCost: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState<ListQuery>(INITIAL_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<MonitorDomain[]>([]);
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [pagination, setPagination] = useState<MonitorPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [planLimit, setPlanLimit] = useState(0);
  const [billingBlock, setBillingBlock] = useState<
    "insufficient_credits" | "domain_limit_reached" | null
  >(null);

  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [details, setDetails] = useState<{
    domain: string;
    focus: "info" | "edit";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toastId = useRef(0);
  const queryRef = useRef(query);
  const loadRequestRef = useRef(0);
  const pollDeadlineRef = useRef(0);
  const alertErrorRef = useRef<string | null>(null);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const goToLogin = () => router.push("/login");
    setUnauthorizedHandler(goToLogin);

    return () => setUnauthorizedHandler(() => undefined);
  }, [router]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (tone: Toast["tone"], message: string) => {
      toastId.current += 1;
      const id = toastId.current;

      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast]
  );

  const showError = useCallback(
    (message: string) => pushToast("error", message),
    [pushToast]
  );

  const showSuccess = useCallback(
    (message: string) => pushToast("success", message),
    [pushToast]
  );

  // Central failure reporter: billing codes raise the upgrade banner instead of
  // a toast, a throttled request gets a friendly "come back in a bit" line, and
  // everything else is a plain error toast.
  const reportError = useCallback(
    (error: unknown, fallback: string) => {
      const code = errorCode(error);

      if (code) {
        setBillingBlock(code);
        return;
      }

      if (errorStatus(error) === 429) {
        pushToast("info", "You are going a bit fast — please try again in a few minutes.");
        return;
      }

      showError(errorMessage(error, fallback));
    },
    [pushToast, showError]
  );

  const startPolling = useCallback(() => {
    pollDeadlineRef.current = Date.now() + POLL_MAX_MS;
  }, []);

  // One request cycle refreshes the domain list and, unless the caller opts out,
  // the unacknowledged alert count that drives the bell badge. Loading flags are
  // only raised by the click handlers that start a load — never synchronously
  // from an effect — and every cycle carries a sequence number so a superseded
  // response is dropped instead of overwriting newer data.
  const load = useCallback(
    async (options?: LoadOptions) => {
      const requestId = ++loadRequestRef.current;
      const withAlerts = options?.alerts !== false;

      try {
        const active = queryRef.current;

        const [listResponse, alertsResult] = await Promise.all([
          callDomainMonitor<MonitorListResponse>({
            action: "list",
            search: active.search,
            client: active.client,
            status: active.status,
            sort: active.sort,
            page: active.page,
            page_size: PAGE_SIZE,
          }),
          withAlerts
            ? callDomainMonitor<{ alerts: MonitorAlert[]; count: number }>({
                action: "alerts",
                unacknowledged_only: true,
              }).then(
                (response): AlertsResult => ({
                  ok: true,
                  alerts: Array.isArray(response.alerts) ? response.alerts : [],
                  count:
                    typeof response.count === "number"
                      ? response.count
                      : (response.alerts ?? []).length,
                })
              )
            : Promise.resolve(null),
        ]);

        if (requestId !== loadRequestRef.current) return;

        const nextItems = Array.isArray(listResponse.items)
          ? listResponse.items
          : [];
        setItems(nextItems);
        setSummary(listResponse.summary ?? null);
        setPagination(listResponse.pagination ?? null);
        setListError(null);

        if (typeof listResponse.plan_limit === "number") {
          setPlanLimit(listResponse.plan_limit);
        }
        if (listResponse.credits) {
          setBalance(listResponse.credits.balance);
        }

        if (
          pollDeadlineRef.current <= Date.now() &&
          nextItems.some((item) => item.whois_status === "pending")
        ) {
          pollDeadlineRef.current = Date.now() + POLL_MAX_MS;
        }

        setChecking((prev) => {
          if (prev.size === 0) return prev;
          const stillChecking = new Set<string>();
          for (const item of nextItems) {
            if (prev.has(item.domain) && item.whois_status === "pending") {
              stillChecking.add(item.domain);
            }
          }
          return stillChecking;
        });

        if (alertsResult?.ok) {
          setAlerts(alertsResult.alerts);
          setAlertCount(alertsResult.count);
          alertErrorRef.current = null;
        } else if (alertsResult && alertErrorRef.current !== alertsResult.message) {
          alertErrorRef.current = alertsResult.message;
          showError(alertsResult.message);
        }
      } catch (error) {
        if (requestId !== loadRequestRef.current) return;

        const message = errorMessage(error, "Something went wrong.");
        if (options?.silent) showError(message);
        else setListError(message);
      } finally {
        if (requestId === loadRequestRef.current) {
          setLoading(false);
          setRefreshing(false);
          if (withAlerts) setAlertsLoading(false);
        }
      }
    },
    [showError]
  );

  useEffect(() => {
    void load();
  }, [query, load]);

  useEffect(() => {
    const interval = setInterval(() => {
      void load({ silent: true });
    }, BACKGROUND_REFRESH_MS);

    return () => clearInterval(interval);
  }, [load]);

  const hasPendingWork = useMemo(
    () => checking.size > 0 || items.some((item) => item.whois_status === "pending"),
    [checking, items]
  );

  useEffect(() => {
    if (!hasPendingWork) return;

    const interval = setInterval(() => {
      if (Date.now() >= pollDeadlineRef.current) {
        clearInterval(interval);
        pushToast(
          "info",
          "Some domains are still being checked — results will appear as soon as they finish."
        );
        return;
      }

      void load({ silent: true, alerts: false });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasPendingWork, load, pushToast]);

  useEffect(() => {
    if (checking.size === 0) return;

    const timeout = setTimeout(() => {
      setChecking(new Set());
    }, POLL_MAX_MS);

    return () => clearTimeout(timeout);
  }, [checking.size]);

  useEffect(() => {
    const trimmed = searchInput.trim();

    const timeout = setTimeout(() => {
      setQuery((prev) =>
        prev.search === trimmed ? prev : { ...prev, search: trimmed, page: 1 }
      );
      setLoading(true);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  const clients = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      const name = item.client?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const patchItem = useCallback((updated: MonitorDomain) => {
    setItems((prev) =>
      prev.map((item) =>
        item.domain === updated.domain ? { ...item, ...updated } : item
      )
    );
  }, []);

  const refreshSilently = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  const reloadWithSpinner = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const handleQueryChange = useCallback((patch: Partial<ListQuery>) => {
    setLoading(true);
    setQuery((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setLoading(true);
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const handleCheckAll = useCallback(async () => {
    setCheckingAll(true);

    try {
      const response = await callDomainMonitor<{ queued: number }>({
        action: "check",
        all: true,
      });

      const queued = response.queued ?? 0;
      startPolling();
      setChecking(new Set(items.map((item) => item.domain)));
      showSuccess(
        `Queued ${queued} domain check${queued === 1 ? "" : "s"}. This page updates automatically.`
      );
      refreshSilently();
    } catch (error) {
      reportError(error, "Could not queue the checks.");
    } finally {
      setCheckingAll(false);
    }
  }, [items, refreshSilently, reportError, showSuccess, startPolling]);

  const handleRecheck = useCallback(
    async (domain: string) => {
      if (rechecking) return;
      setRechecking(domain);

      try {
        const response = await callDomainMonitor<{ queued: number }>({
          action: "check",
          domains: [domain],
        });

        const queued = response.queued ?? 1;
        startPolling();
        setChecking((prev) => new Set(prev).add(domain));
        showSuccess(
          `Queued ${queued} check${queued === 1 ? "" : "s"} for ${domain}.`
        );
        refreshSilently();
      } catch (error) {
        reportError(error, `Could not queue a check for ${domain}.`);
      } finally {
        setRechecking(null);
      }
    },
    [rechecking, refreshSilently, reportError, showSuccess, startPolling]
  );

  const handleExport = useCallback(async () => {
    setExporting(true);

    try {
      const response = await callDomainMonitor<{
        filename: string;
        csv: string;
      }>({
        action: "export_csv",
      });

      const filename = (response.filename || "domains.csv").replace(
        /[^\w.\- ]+/g,
        "_"
      );
      downloadCsv(response.csv ?? "", filename);
      showSuccess(`Downloaded ${filename}.`);
    } catch (error) {
      showError(errorMessage(error, "Could not export the CSV."));
    } finally {
      setExporting(false);
    }
  }, [showError, showSuccess]);

  const handleSetManualExpiry = useCallback(
    async (domain: string, date: string) => {
      try {
        const response = await callDomainMonitor<{ domain: MonitorDomain }>({
          action: "update",
          domain,
          manual_expiry: date,
        });

        if (response.domain) {
          patchItem(response.domain);
          showSuccess(`Expiry date saved for ${domain}.`);
          refreshSilently();
        }
      } catch (error) {
        showError(errorMessage(error, `Could not save the date for ${domain}.`));
      }
    },
    [patchItem, refreshSilently, showError, showSuccess]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);

    try {
      const response = await callDomainMonitor<{ deleted: number }>({
        action: "delete",
        domains: [deleteTarget],
      });

      const deleted = response.deleted ?? 1;
      showSuccess(`Deleted ${deleted} domain${deleted === 1 ? "" : "s"}.`);
      setDeleteTarget(null);
      if (details?.domain === deleteTarget) setDetails(null);
      reloadWithSpinner();
    } catch (error) {
      showError(errorMessage(error, "Could not delete that domain."));
    } finally {
      setDeleting(false);
    }
  }, [
    deleteTarget,
    deleting,
    details,
    reloadWithSpinner,
    showError,
    showSuccess,
  ]);

  const handleAdd = useCallback(
    (credits: MonitorCredits | null) => {
      if (credits) setBalance(credits.balance);
      startPolling();
      reloadWithSpinner();
    },
    [reloadWithSpinner, startPolling]
  );

  const openAdd = useCallback(() => {
    setBillingBlock(null);
    setAddOpen(true);
  }, []);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeAlerts = useCallback(() => setAlertsOpen(false), []);
  const closeDetails = useCallback(() => setDetails(null), []);

  const openAlerts = useCallback(() => {
    setAlertsOpen(true);
    setAlertsLoading(true);
    refreshSilently();
  }, [refreshSilently]);

  const compactPrimary = `${btnPrimary} px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50`;
  const compactSecondary = `${btnSecondary} px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50`;

  const domainsUsed = summary?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-navy">
            Domain / WHOIS Bulk Monitor
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            Bulk-add client domains, watch expiry dates and get alerted before
            anything drops.
          </p>
          <p className="mt-2 max-w-xl rounded-xl bg-mist/60 px-3 py-2 text-xs leading-relaxed text-slate-600">
            .pk and some other country domains have no public WHOIS/RDAP data, so
            enter their expiry date manually.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-navy/[0.06]">
              <span className="text-slate-400">Credits</span>
              <span className="text-navy">{balance}</span>
              <Link
                href="/pricing"
                className="font-semibold text-accent-deep underline underline-offset-2 hover:text-navy"
              >
                Top up
              </Link>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-navy/[0.06]">
              <span className="text-slate-400">Domains</span>
              <span className="text-navy">
                {planLimit > 0 ? `${domainsUsed} / ${planLimit}` : `${domainsUsed}`}
              </span>
            </span>
            <span className="text-slate-500">
              Each new domain uses {creditCost} credit{creditCost === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            disabled={checkingAll || exporting}
            className={compactPrimary}
          >
            Add domains
          </button>
          <button
            type="button"
            onClick={handleCheckAll}
            disabled={checkingAll || exporting}
            className={compactSecondary}
          >
            {checkingAll ? <Spinner className="text-accent" /> : null}
            {checkingAll ? "Queuing…" : "Check all now"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || checkingAll}
            className={compactSecondary}
          >
            {exporting ? <Spinner className="text-accent" /> : null}
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={compactSecondary}
          >
            Settings
          </button>

          <button
            type="button"
            onClick={openAlerts}
            aria-label={`Alerts: ${alertCount} unacknowledged`}
            className="relative inline-flex size-10 items-center justify-center rounded-full bg-white text-navy ring-1 ring-navy/10 transition-colors hover:bg-mist"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
              <path
                d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.3 20a2 2 0 0 0 3.4 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            {alertCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full bg-accent px-1 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <SummaryCards
        summary={summary}
        loading={loading}
        activeStatus={query.status}
        onSelect={(status: ListStatusFilter) => handleQueryChange({ status })}
      />

      <FiltersBar
        search={searchInput}
        onSearchChange={setSearchInput}
        client={query.client}
        clients={clients}
        onClientChange={(client) => handleQueryChange({ client })}
        status={query.status}
        onStatusChange={(status) => handleQueryChange({ status })}
        sort={query.sort}
        onSortChange={(sort: ListSort) => handleQueryChange({ sort })}
        refreshing={refreshing}
        onRefresh={reloadWithSpinner}
      />

      {loading ? (
        <LoadingRows />
      ) : listError ? (
        <ErrorState message={listError} onRetry={reloadWithSpinner} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No domains to show"
          message={
            query.search || query.client || query.status !== "all"
              ? "No domains match these filters. Try clearing the search or status filter."
              : "Add your first domains to start tracking expiry dates, WHOIS details and alerts."
          }
          action={
            <button
              type="button"
              onClick={openAdd}
              className={`${btnPrimary} mt-2 px-5 py-2.5`}
            >
              Add domains
            </button>
          }
        />
      ) : (
        <section className={`${card} p-4 sm:p-6`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
            <span>
              {pagination
                ? `Page ${pagination.page} of ${Math.max(
                    1,
                    pagination.total_pages
                  )} · ${pagination.total_items} domains`
                : `${items.length} domains`}
            </span>
            {hasPendingWork && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-accent-deep">
                <Spinner className="text-accent" />
                Checking in the background — this page refreshes for up to 2
                minutes
              </span>
            )}
          </div>

          <DomainTable
            items={items}
            checking={checking}
            rechecking={rechecking}
            onDetails={(domain) => setDetails({ domain, focus: "info" })}
            onEdit={(domain) => setDetails({ domain, focus: "edit" })}
            onRecheck={handleRecheck}
            onDelete={(domain) => setDeleteTarget(domain)}
            onSetManualExpiry={handleSetManualExpiry}
          />
        </section>
      )}

      {!loading && !listError && items.length > 0 && (
        <Pagination
          pagination={pagination}
          loading={refreshing}
          onPageChange={handlePageChange}
        />
      )}

      {billingBlock && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {billingBlock === "insufficient_credits"
              ? "You do not have enough credits to add more domains."
              : "You have reached the number of domains included in your plan."}{" "}
            <Link
              href="/pricing"
              className="font-semibold underline underline-offset-2 hover:text-navy"
            >
              View plans
            </Link>{" "}
            to keep going.
          </p>
          <button
            type="button"
            onClick={() => setBillingBlock(null)}
            className="shrink-0 self-start rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 transition-colors hover:bg-amber-100 sm:self-auto"
          >
            Dismiss
          </button>
        </div>
      )}

      <AddDomainsModal
        open={addOpen}
        creditCost={creditCost}
        onClose={closeAdd}
        onAdded={handleAdd}
        onError={showError}
      />

      {details && (
        <DetailsDrawer
          key={details.domain}
          domain={details.domain}
          focus={details.focus}
          onClose={closeDetails}
          onSaved={patchItem}
          onRecheck={handleRecheck}
          onSuccess={showSuccess}
          onError={showError}
        />
      )}

      <AlertsPanel
        open={alertsOpen}
        onClose={closeAlerts}
        alerts={alerts}
        loading={alertsLoading}
        onRefresh={refreshSilently}
        onSuccess={showSuccess}
        onError={showError}
      />

      {settingsOpen && (
        <SettingsModal
          onClose={closeSettings}
          onSuccess={showSuccess}
          onError={showError}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete domain"
        message={
          <p>
            Remove <span className="font-bold text-navy">{deleteTarget}</span> from
            the monitor? Its alerts and check history are deleted too. This cannot
            be undone.
          </p>
        }
        confirmLabel="Delete domain"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}