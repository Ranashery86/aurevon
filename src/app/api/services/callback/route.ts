import type { NextRequest } from "next/server";
import {
  authenticateCallback,
  handleWorkflowCallback,
} from "@/lib/services/callback";

export async function POST(request: NextRequest) {
  const auth = authenticateCallback(request.headers);

  if (!auth.authorized) {
    console.error("[service-callback] rejected:", auth.reason);
    return Response.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { request_id: requestId, status } = payload as Record<string, unknown>;
  if (typeof requestId !== "string" || requestId.length === 0) {
    return Response.json({ error: "Missing request_id" }, { status: 400 });
  }
  if (status !== "completed" && status !== "failed") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await handleWorkflowCallback(payload as {
    request_id: string;
    status: "completed" | "failed";
    result?: unknown;
    error?: string;
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ received: true });
}