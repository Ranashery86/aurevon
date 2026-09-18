"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  async function handleLogout() {
    setStatus("loading");
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={status === "loading"}
      className="w-full rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:opacity-50"
    >
      {status === "loading" ? "Logging out\u2026" : "Log out"}
    </button>
  );
}