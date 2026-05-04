"use client";
import { useState } from "react";

async function fingerprint(): Promise<string> {
  const ua = navigator.userAgent;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const screen = `${window.screen.width}x${window.screen.height}`;
  const lang = navigator.language;
  const raw = `${ua}|${screen}|${tz}|${lang}`;
  const buf = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function VoteButton({
  findingId, initialCount,
}: { findingId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [state, setState] = useState<"idle" | "busy" | "voted" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);

  const vote = async () => {
    if (state !== "idle") return;
    setState("busy");
    try {
      const fp = await fingerprint();
      const r = await fetch("/api/audit/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding_id: findingId, fingerprint: fp }),
      });
      const data = await r.json();
      if (data.success) {
        setCount(data.new_count ?? count + 1);
        setState("voted");
      } else {
        setState(data.reason === "already_voted" ? "voted" : "error");
        setReason(data.reason ?? null);
      }
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={vote}
        disabled={state !== "idle"}
        className={`rounded-md border px-3 py-1 font-medium transition ${
          state === "voted"
            ? "border-emerald-700 bg-emerald-900/30 text-emerald-200 cursor-default"
            : state === "error"
              ? "border-red-700 bg-red-900/30 text-red-200"
              : "border-stone-600 bg-stone-800 text-stone-100 hover:border-red-500 hover:bg-red-900/30"
        }`}
      >
        {state === "voted" ? "✓ Гласувахте" : state === "busy" ? "…" : "👍 Подкрепи"}
      </button>
      <span className="tabular-nums text-stone-300">{count} {count === 1 ? "глас" : "гласа"}</span>
      {state === "error" && reason === "rate_limited" && (
        <span className="text-amber-400">лимит 24ч</span>
      )}
    </div>
  );
}
