"use client";

const REQUEST_TIMEOUT_MS = 30000;

// Server-side error codes the route returns that the page reacts to specially.
export type DomainMonitorErrorCode =
  | "insufficient_credits"
  | "domain_limit_reached";

export class DomainMonitorError extends Error {
  readonly code?: DomainMonitorErrorCode;
  readonly status: number;

  constructor(message: string, status: number, code?: DomainMonitorErrorCode) {
    super(message);
    this.name = "DomainMonitorError";
    this.status = status;
    this.code = code;
  }
}

// A session can expire while the tab is open. The page registers a handler that
// routes to /login so an expired session never shows up as a generic failure.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

// Every call goes to our own /api/services/domain-monitor route, which
// authenticates the session, applies billing and forwards the JSON body to the
// workflow. The browser never talks to the workflow directly, so the webhook URL
// and the shared secret stay server-side.
export async function callDomainMonitor<T extends object>(
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = options?.signal;

  const forwardAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", forwardAbort);

  try {
    const response = await fetch("/api/services/domain-monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    // The session can expire while the tab is open. Send the user to the login
    // page instead of showing a generic failure.
    if (response.status === 401) {
      unauthorizedHandler?.();
      throw new DomainMonitorError("Please log in", 401);
    }

    const body = (await response
      .json()
      .catch(() => null)) as
      | ({ success?: boolean; error?: string; code?: string } & T)
      | null;

    if (!body) {
      throw new DomainMonitorError(
        `The domain monitor returned an unreadable response (HTTP ${response.status}).`,
        response.status
      );
    }

    if (body.success === false || !response.ok) {
      const code =
        body.code === "insufficient_credits" || body.code === "domain_limit_reached"
          ? body.code
          : undefined;

      throw new DomainMonitorError(
        body.error || `The request failed (HTTP ${response.status}).`,
        response.status,
        code
      );
    }

    return body;
  } catch (error) {
    if (error instanceof DomainMonitorError) throw error;

    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      throw new DomainMonitorError(
        "The request timed out after 30 seconds. Please try again.",
        408
      );
    }

    throw new DomainMonitorError(
      "Network error. Please check your connection and try again.",
      0
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof DomainMonitorError) return error.message;
  return fallback;
}

export function errorCode(
  error: unknown
): DomainMonitorErrorCode | undefined {
  return error instanceof DomainMonitorError ? error.code : undefined;
}

export function errorStatus(error: unknown): number {
  return error instanceof DomainMonitorError ? error.status : 0;
}
