"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ServiceRequestRow } from "@/lib/services/types";

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_ATTEMPTS = 90;

export function isProcessingRequest(row: ServiceRequestRow | null): boolean {
  return !!row && (row.status === "processing" || row.status === "pending");
}

export function isResolvedRequest(row: ServiceRequestRow | null): boolean {
  return !!row && (row.status === "completed" || row.status === "failed");
}

// Shared polling + history state for every service page: track the active
// run, poll service_requests until it reaches a terminal state, and keep the
// history table in sync. Used by both ServiceWorkflow (Lead Generation) and
// AiContentWorkflow.
export function useServiceRequestHistory(initialHistory: ServiceRequestRow[]) {
  const [history, setHistory] = useState<ServiceRequestRow[]>(initialHistory);
  const [activeRequest, setActiveRequest] = useState<ServiceRequestRow | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const applyRequest = useCallback((row: ServiceRequestRow) => {
    setActiveRequest(row);
    setHistory((previous) => {
      const index = previous.findIndex((item) => item.id === row.id);
      if (index === -1) return [row, ...previous];
      const next = [...previous];
      next[index] = row;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeRequestId) return;

    const supabase = createClient();
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const check = async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", activeRequestId)
        .maybeSingle();

      if (cancelled || error || !data) return;
      applyRequest(data as ServiceRequestRow);

      if (data.status === "completed" || data.status === "failed") {
        stop();
      }
    };

    timer = setInterval(() => {
      attempts += 1;
      void check();
      if (attempts >= MAX_POLL_ATTEMPTS) stop();
    }, POLL_INTERVAL_MS);

    void check();

    return () => {
      cancelled = true;
      stop();
    };
  }, [activeRequestId, applyRequest]);

  // Re-open a past request (row clicks): resumes polling until terminal and
  // shows its stored result/output.
  const openRequest = useCallback(
    (row: ServiceRequestRow) => {
      setActiveRequestId(row.id);
      applyRequest(row);
    },
    [applyRequest]
  );

  // Kick off a brand new run with an optimistic in-progress row.
  const launchRequest = useCallback(
    (requestId: string, optimisticRow: ServiceRequestRow) => {
      setActiveRequestId(requestId);
      applyRequest(optimisticRow);
    },
    [applyRequest]
  );

  return { history, activeRequest, openRequest, launchRequest };
}