import type { NextRequest } from "next/server";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_SESSION_ID_LENGTH = 100;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const N8N_TIMEOUT_MS = 30_000;
const N8N_ERROR_RESPONSE = { error: "Voice service is temporarily unavailable." };
const N8N_TIMEOUT_RESPONSE = { error: "Voice service timed out." };

// Simple per-IP rate limit, in-memory.
// NOTE: serverless instances do NOT share memory, so each instance keeps its
// own counters and the effective limit is per-instance. The upgrade path is a
// shared store such as Upstash Redis (@upstash/ratelimit) — swap the Map below
// for a Redis-backed limiter when you need a global limit.
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (requestLog.get(ip) ?? []).filter((t) => t > windowStart);

  if (hits.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, hits);
    return true;
  }

  hits.push(now);
  requestLog.set(ip, hits);

  if (requestLog.size > 10_000) {
    for (const [key, times] of requestLog) {
      if (times.every((t) => t <= windowStart)) requestLog.delete(key);
    }
  }

  return false;
}

function isAllowedAudioType(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return type.startsWith("audio/") || type === "video/webm";
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 415 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  const sessionId = form.get("sessionId");

  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: "Missing audio file." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio file is too large (max 5 MB)." }, { status: 413 });
  }
  if (!audio.type || !isAllowedAudioType(audio.type)) {
    return Response.json({ error: "Unsupported audio content type." }, { status: 415 });
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return Response.json({ error: "Missing sessionId." }, { status: 400 });
  }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    return Response.json({ error: "sessionId is too long." }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_VOICE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[voice] N8N_VOICE_WEBHOOK_URL is not set");
    return Response.json({ error: "Voice service is not configured." }, { status: 503 });
  }

  const headerName = process.env.N8N_VOICE_HEADER_NAME || "x-voice-secret";
  const secret = process.env.N8N_VOICE_SECRET;

  const forward = new FormData();
  forward.append("audio", audio, audio.name);
  forward.append("sessionId", sessionId);

  let n8nResponse: Response;
  try {
    n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: secret ? { [headerName]: secret } : undefined,
      body: forward,
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return Response.json(N8N_TIMEOUT_RESPONSE, { status: 504 });
    }
    console.error("[voice] n8n fetch failed");
    return Response.json(N8N_ERROR_RESPONSE, { status: 502 });
  }

  if (!n8nResponse.ok) {
    console.error("[voice] n8n responded with status", n8nResponse.status);
    return Response.json(N8N_ERROR_RESPONSE, { status: 502 });
  }

  const payload = (await n8nResponse.json().catch(() => null)) as {
    transcript?: unknown;
    reply?: unknown;
  } | null;

  if (
    !payload ||
    typeof payload.transcript !== "string" ||
    typeof payload.reply !== "string"
  ) {
    console.error("[voice] n8n returned an unexpected payload");
    return Response.json(N8N_ERROR_RESPONSE, { status: 502 });
  }

  return Response.json({ transcript: payload.transcript, reply: payload.reply });
}
