"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Noto_Naskh_Arabic } from "next/font/google";

type Status = "idle" | "recording" | "thinking" | "speaking";

interface Message {
  id: number;
  role: "aura" | "user";
  text: string;
}

const GREETING = "Hi, I'm Aura from aurevon. How can I help you today?";
const SESSION_STORAGE_KEY = "aurevon_voice_session_id";
const MAX_RECORDING_MS = 30_000;
const REQUEST_TIMEOUT_MS = 40_000;
const ERROR_MESSAGE = "Sorry, something went wrong. Please try again.";
const MIC_DENIED_MESSAGE =
  "I can't hear you — please allow microphone access in your browser and try again.";
const UNSUPPORTED_MESSAGE =
  "Voice recording isn't supported in this browser. Please try Chrome, Edge, or Safari.";
const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const SILENT_MP3_DATA_URI =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF]/;

const urduFont = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-urdu",
});

function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_PATTERN.test(text);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function pickMimeType(): string | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }
  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function SpeakingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      {muted ? (
        <>
          <line x1="22" x2="16" y1="9" y2="15" />
          <line x1="16" x2="22" y1="9" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function VoiceWidget() {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [status, setStatusState] = useState<Status>("idle");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "aura", text: GREETING },
  ]);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const statusRef = useRef<Status>("idle");
  const mutedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const speechUnlockedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioUnlockedRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const messageIdRef = useRef(1);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const pickEnglishVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current.length
      ? voicesRef.current
      : window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    return (
      voices.find((v) => v.lang === "en-US") ??
      voices.find((v) => v.lang === "en-GB") ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
      null
    );
  }, []);

  const ensureAudioElement = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return null;
    }
    if (!audioRef.current) {
      const element = new Audio();
      element.preload = "auto";
      audioRef.current = element;
    }
    return audioRef.current;
  }, []);

  const releaseAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const haltAudio = useCallback(() => {
    const element = audioRef.current;
    if (element) {
      element.onended = null;
      element.onerror = null;
      try {
        element.pause();
        element.currentTime = 0;
      } catch {
        // audio element unavailable
      }
      try {
        element.removeAttribute("src");
        element.load();
      } catch {
        // audio element unavailable
      }
    }
    releaseAudioUrl();
  }, [releaseAudioUrl]);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    const element = ensureAudioElement();
    if (!element) return;
    audioUnlockedRef.current = true;
    try {
      element.src = SILENT_MP3_DATA_URI;
      element.volume = 0;
      const finish = () => {
        try {
          if (element.src.startsWith("data:")) {
            element.pause();
            element.currentTime = 0;
          }
        } catch {
          // audio element unavailable
        }
        element.volume = 1;
      };
      const attempt = element.play();
      if (attempt && typeof attempt.then === "function") {
        attempt.then(finish).catch(finish);
      } else {
        finish();
      }
    } catch {
      element.volume = 1;
    }
  }, [ensureAudioElement]);

  const speakWithBrowser = useCallback(
    (text: string) => {
      const synth =
        typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth || mutedRef.current) {
        setStatus("idle");
        return;
      }
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (statusRef.current === "speaking") setStatus("idle");
      };
      utterance.onerror = () => {
        if (statusRef.current === "speaking") setStatus("idle");
      };
      setStatus("speaking");
      synth.speak(utterance);
    },
    [pickEnglishVoice, setStatus],
  );

  const playReply = useCallback(
    (
      text: string,
      lang: "en" | "ur",
      audio: string | null,
      audioMime: string | null,
    ) => {
      if (mutedRef.current) {
        setStatus("idle");
        return;
      }
      const fallback = () => {
        if (lang === "en") {
          speakWithBrowser(text);
        } else if (statusRef.current === "speaking") {
          setStatus("idle");
        }
      };
      const element = audio ? ensureAudioElement() : null;
      if (audio && element) {
        try {
          const buffer = base64ToBuffer(audio);
          const blob = new Blob([buffer], {
            type: audioMime || "audio/wav",
          });
          element.onended = () => {
            releaseAudioUrl();
            if (statusRef.current === "speaking") setStatus("idle");
          };
          element.onerror = () => {
            haltAudio();
            fallback();
          };
          const nextUrl = URL.createObjectURL(blob);
          element.src = nextUrl;
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = nextUrl;
          element.volume = 1;
          setStatus("speaking");
          const attempt = element.play();
          if (attempt && typeof attempt.then === "function") {
            attempt.catch(() => {
              haltAudio();
              fallback();
            });
          }
          return;
        } catch {
          haltAudio();
        }
      }
      fallback();
    },
    [ensureAudioElement, haltAudio, releaseAudioUrl, setStatus, speakWithBrowser],
  );

  const sendAudio = useCallback(
    async (blob: Blob, extension: "webm" | "mp4") => {
      setStatus("thinking");
      const file = new File([blob], `audio.${extension}`, {
        type: blob.type || (extension === "mp4" ? "audio/mp4" : "audio/webm"),
      });
      const form = new FormData();
      form.append("audio", file, file.name);
      form.append("sessionId", getSessionId());

      const controller = new AbortController();
      const timer = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch("/api/voice", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          transcript?: unknown;
          reply?: unknown;
          lang?: unknown;
          audio?: unknown;
          audioMime?: unknown;
        } | null;
        if (
          !response.ok ||
          !data ||
          typeof data.reply !== "string"
        ) {
          throw new Error("voice request failed");
        }
        const transcript =
          typeof data.transcript === "string" ? data.transcript.trim() : "";
        const reply = data.reply;
        const lang = data.lang === "ur" ? "ur" : "en";
        const audio =
          typeof data.audio === "string" && data.audio ? data.audio : null;
        const audioMime =
          audio && typeof data.audioMime === "string"
            ? data.audioMime
            : audio
              ? "audio/wav"
              : null;
        setMessages((prev) => {
          const next = [...prev];
          if (transcript) {
            next.push({
              id: messageIdRef.current++,
              role: "user",
              text: transcript,
            });
          }
          next.push({
            id: messageIdRef.current++,
            role: "aura",
            text: reply,
          });
          return next;
        });
        setOpen(true);
        playReply(reply, lang, audio, audioMime);
      } catch {
        setNotice(ERROR_MESSAGE);
        setStatus("idle");
      } finally {
        window.clearTimeout(timer);
      }
    },
    [playReply, setStatus],
  );

  const handleRecorderStop = useCallback(() => {
    clearAutoStopTimer();
    const discarded = discardRef.current;
    discardRef.current = false;

    const recorder = recorderRef.current;
    const stream = streamRef.current;
    const chunks = chunksRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];

    stream?.getTracks().forEach((track) => track.stop());

    if (discarded) {
      setStatus("idle");
      return;
    }
    if (!recorder || chunks.length === 0) {
      setStatus("idle");
      return;
    }

    const usedMimeType = recorder.mimeType || "audio/webm";
    const extension = usedMimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: usedMimeType });
    void sendAudio(blob, extension);
  }, [clearAutoStopTimer, sendAudio, setStatus]);

  const startRecording = useCallback(async () => {
    setNotice(null);

    if (
      typeof window.MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setNotice(UNSUPPORTED_MESSAGE);
      return;
    }

    haltAudio();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // speechSynthesis unavailable
    }
    if (statusRef.current === "speaking") setStatus("idle");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice(MIC_DENIED_MESSAGE);
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setNotice(UNSUPPORTED_MESSAGE);
      return;
    }

    chunksRef.current = [];
    discardRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = handleRecorderStop;

    try {
      recorder.start();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setNotice(UNSUPPORTED_MESSAGE);
      return;
    }

    recorderRef.current = recorder;
    streamRef.current = stream;
    autoStopTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        discardRef.current = false;
        try {
          recorderRef.current.stop();
        } catch {
          handleRecorderStop();
        }
      }
    }, MAX_RECORDING_MS);
    setStatus("recording");
  }, [haltAudio, handleRecorderStop, setStatus]);

  const stopRecording = useCallback(
    (discard: boolean) => {
      clearAutoStopTimer();
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        if (discard) handleRecorderStop();
        return;
      }
      discardRef.current = discard;
      try {
        recorder.stop();
      } catch {
        handleRecorderStop();
      }
    },
    [clearAutoStopTimer, handleRecorderStop],
  );

  const stopSpeaking = useCallback(() => {
    haltAudio();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // speechSynthesis unavailable
    }
    if (statusRef.current === "speaking") setStatus("idle");
  }, [haltAudio, setStatus]);

  const abortActivity = useCallback(() => {
    stopSpeaking();
    stopRecording(true);
  }, [stopSpeaking, stopRecording]);

  const unlockSpeech = useCallback(() => {
    if (speechUnlockedRef.current) return;
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      speechUnlockedRef.current = true;
    } catch {
      // speechSynthesis unavailable
    }
  }, []);

  const handleMicClick = () => {
    unlockSpeech();
    unlockAudio();
    const current = statusRef.current;

    if (current === "recording") {
      stopRecording(false);
      return;
    }
    if (current === "thinking") return;
    if (current === "speaking") {
      stopSpeaking();
      void startRecording();
      return;
    }
    if (!open) {
      setNotice(null);
      setOpen(true);
      return;
    }
    void startRecording();
  };

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopSpeaking();
  }, [stopSpeaking]);

  const closePanel = useCallback(() => {
    abortActivity();
    setNotice(null);
    setOpen(false);
    micButtonRef.current?.focus();
  }, [abortActivity]);

  const normalizedPath = pathname
    ? pathname.length > 1
      ? pathname.replace(/\/+$/, "")
      : pathname
    : "";
  const hidden =
    normalizedPath === "/login" ||
    normalizedPath === "/signup" ||
    normalizedPath.startsWith("/dashboard");

  const [wasHidden, setWasHidden] = useState(hidden);
  if (wasHidden !== hidden) {
    setWasHidden(hidden);
    if (hidden) {
      setOpen(false);
      setNotice(null);
    }
  }

  useEffect(() => {
    if (!hidden) return;
    abortActivity();
  }, [hidden, abortActivity]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [messages, status]);

  useEffect(() => {
    return () => {
      discardRef.current = true;
      haltAudio();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // speechSynthesis unavailable
      }
      if (autoStopTimerRef.current !== null) {
        window.clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // recorder already stopped
        }
      }
    };
  }, [haltAudio]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  if (hidden) return null;

  const statusLabel =
    status === "recording"
      ? "Listening…"
      : status === "thinking"
        ? "Thinking…"
        : status === "speaking"
          ? "Speaking…"
          : "Ready to help";

  const micLabel =
    status === "recording"
      ? "Stop recording and send"
      : status === "thinking"
        ? "Aura is processing your message"
        : status === "speaking"
          ? "Interrupt Aura and start recording"
          : open
            ? "Start recording a voice message"
            : "Open voice support";

  const footerHint =
    status === "recording"
      ? "Listening… tap the mic to send"
      : status === "thinking"
        ? "Aura is thinking…"
        : status === "speaking"
          ? "Tap the mic to interrupt Aura"
          : "Tap the mic to talk to Aura";

  return (
    <>
      <button
        ref={micButtonRef}
        type="button"
        onClick={handleMicClick}
        aria-label={micLabel}
        aria-expanded={open}
        disabled={status === "thinking"}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 outline-none ring-1 ring-accent/30 transition-colors hover:bg-accent-deep focus-visible:ring-4 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "recording" && (
          <span
            className="absolute -inset-1.5 rounded-full border-2 border-accent motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}
        <span className="relative flex items-center justify-center">
          {status === "recording" ? (
            <StopIcon />
          ) : status === "speaking" ? (
            <span className="motion-safe:animate-pulse">
              <SpeakingIcon />
            </span>
          ) : status === "thinking" ? (
            <span
              className="block size-6 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <MicIcon />
          )}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Aura voice support"
          className="fixed bottom-24 right-5 z-50 flex max-h-[calc(100dvh-7.5rem)] w-[calc(100vw-2.5rem)] max-w-sm flex-col rounded-3xl bg-white p-4 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.35)] outline-none ring-1 ring-navy/[0.08]"
        >
          <div className="flex items-center gap-3 border-b border-navy/[0.06] pb-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-white">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy">Aura</p>
              <p className="text-xs text-slate-500">{statusLabel}</p>
            </div>
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Unmute Aura" : "Mute Aura"}
              className="rounded-full p-2 text-slate-500 outline-none transition-colors hover:bg-mist hover:text-navy focus-visible:ring-4 focus-visible:ring-accent/30"
            >
              <SpeakerIcon muted={muted} />
            </button>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close voice support"
              className="rounded-full p-2 text-slate-500 outline-none transition-colors hover:bg-mist hover:text-navy focus-visible:ring-4 focus-visible:ring-accent/30"
            >
              <CloseIcon />
            </button>
          </div>

          <p className="pt-2 text-xs text-slate-500">
            Speak in English or Urdu
          </p>

          <ul
            ref={scrollRef}
            aria-live="polite"
            className="flex min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain py-3"
          >
            {messages.map((message) => {
              const isRtl = containsArabicScript(message.text);
              const roleClass =
                message.role === "aura"
                  ? "max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-mist px-3.5 py-2 text-sm leading-snug text-navy"
                  : "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-navy px-3.5 py-2 text-sm leading-snug text-white";
              return (
                <li
                  key={message.id}
                  dir={isRtl ? "rtl" : undefined}
                  lang={isRtl ? "ur" : undefined}
                  className={[
                    roleClass,
                    isRtl ? "text-right" : "",
                    isRtl ? urduFont.className : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {message.text}
                </li>
              );
            })}
            {status === "thinking" && (
              <li className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm bg-mist px-4 py-3">
                <span className="sr-only">Aura is thinking</span>
                <span
                  className="size-1.5 rounded-full bg-navy/40 motion-safe:animate-bounce"
                  style={{ animationDelay: "0ms" }}
                  aria-hidden="true"
                />
                <span
                  className="size-1.5 rounded-full bg-navy/40 motion-safe:animate-bounce"
                  style={{ animationDelay: "120ms" }}
                  aria-hidden="true"
                />
                <span
                  className="size-1.5 rounded-full bg-navy/40 motion-safe:animate-bounce"
                  style={{ animationDelay: "240ms" }}
                  aria-hidden="true"
                />
              </li>
            )}
          </ul>

          {notice && (
            <p className="rounded-2xl bg-blush px-3.5 py-2 text-sm text-accent-deep">
              {notice}
            </p>
          )}

          <p className="pt-2 text-center text-xs text-slate-500">
            {footerHint}
          </p>
        </div>
      )}
    </>
  );
}
