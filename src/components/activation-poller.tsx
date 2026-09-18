"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ActivationPoller({ message }: { message: string }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex max-w-full items-center gap-3 rounded-2xl bg-sky-50 px-6 py-4 ring-1 ring-sky-200">
      <div
        className="size-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-600"
        aria-hidden
      />
      <p className="text-sm font-semibold text-sky-800">{message}</p>
    </div>
  );
}