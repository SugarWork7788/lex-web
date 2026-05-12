"use client";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";

type Props = {
  findingId: string;
  initialCount: number;
  user: Pick<User, "id"> | null;
  currentPath: string;
};

export function VoteButton({ findingId, initialCount, user, currentPath }: Props) {
  const [count, setCount] = useState(initialCount);
  const [state, setState] = useState<"idle" | "busy" | "voted" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);

  const isAnon = user === null;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(currentPath)}`;

  const vote = async () => {
    if (isAnon || state !== "idle") return;
    setState("busy");
    try {
      const r = await fetch("/api/audit/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding_id: findingId }),
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

  const buttonClass = `rounded-md border px-3 py-1 font-medium transition ${
    isAnon
      ? "border-stone-700 bg-stone-900/60 text-stone-500 cursor-not-allowed"
      : state === "voted"
        ? "border-emerald-700 bg-emerald-900/30 text-emerald-200 cursor-default"
        : state === "error"
          ? "border-red-700 bg-red-900/30 text-red-200"
          : "border-stone-600 bg-stone-800 text-stone-100 hover:border-red-500 hover:bg-red-900/30"
  }`;

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={vote}
        disabled={isAnon || state !== "idle"}
        title={isAnon ? "Влезте, за да гласувате" : undefined}
        className={buttonClass}
      >
        {state === "voted" ? "✓ Гласувахте" : state === "busy" ? "…" : "👍 Подкрепи"}
      </button>
      <span className="tabular-nums text-stone-300">
        {count} {count === 1 ? "глас" : "гласа"}
      </span>
      {isAnon && (
        <a
          href={signInHref}
          className="text-emerald-400 hover:underline underline-offset-4"
        >
          · Влез за глас →
        </a>
      )}
      {!isAnon && state === "error" && reason === "rate_limited" && (
        <span className="text-amber-400">лимит 24ч</span>
      )}
    </div>
  );
}
