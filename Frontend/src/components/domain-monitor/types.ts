export type WhoisStatus =
  | "ok"
  | "pending"
  | "unsupported_tld"
  | "not_found"
  | "rate_limited"
  | "error";

export type ListStatusFilter =
  | "all"
  | "expiring"
  | "expired"
  | "ok"
  | "error"
  | "unsupported_tld";

export type ListSort = "expiry_asc" | "expiry_desc" | "domain" | "client";

export type MonitorDomain = {
  domain: string;
  label: string | null;
  client: string | null;
  notes: string | null;
  registrar: string | null;
  created_date: string | null;
  expiry_date: string | null;
  updated_date: string | null;
  days_left: number | null;
  domain_status: string[] | null;
  nameservers: string[] | null;
  a_records: string[] | null;
  has_mx: boolean | null;
  dnssec: string | boolean | null;
  whois_status: WhoisStatus | string | null;
  manual_expiry: string | null;
  last_checked: string | null;
  last_error: string | null;
  active: boolean | null;
  added_at: string | null;
};

export type MonitorSummary = {
  total: number;
  expiring_30d: number;
  expiring_7d: number;
  expired: number;
  ok: number;
  errors: number;
  unsupported_tld: number;
};

export type MonitorPagination = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type MonitorListResponse = {
  success: boolean;
  summary: MonitorSummary;
  items: MonitorDomain[];
  pagination: MonitorPagination;
  plan_limit: number;
  credits: MonitorCredits;
};

export type MonitorAlert = {
  id: number;
  domain: string;
  type: string;
  message: string;
  days_left: number | null;
  created_at: string | null;
  sent_email: boolean | null;
  acknowledged: boolean | null;
  priority: string | null;
  client: string | null;
};

export type MonitorHistoryEntry = {
  checked_at: string | null;
  whois_status: string | null;
  expiry_date: string | null;
  days_left: number | null;
  registrar: string | null;
  nameservers: string[] | null;
  domain_status: string[] | null;
  error: string | null;
};

export type MonitorDetailsResponse = {
  success: boolean;
  domain: MonitorDomain;
  alerts: MonitorAlert[];
  history: MonitorHistoryEntry[];
};

export type AddInvalidEntry = { input: string; reason: string };

export type AddResult = {
  added: string[];
  duplicates: string[];
  invalid: AddInvalidEntry[];
};

// Appended by the server route on every response so the page can show the
// credit cost and the plan's domain cap without a second request.
export type MonitorCredits = {
  charged: number;
  balance: number;
};

export type MonitorSettings = {
  alert_days: number[];
  notify_emails: string[];
  email_enabled: boolean;
  check_hour: number;
  timezone: string;
};

export type ListQuery = {
  search: string;
  client: string;
  status: ListStatusFilter;
  sort: ListSort;
  page: number;
};