// File: app/admin/dashboard-client.tsx
//
// Client-side dashboard renderer. Fetches /api/admin/stats every 30s and
// renders four panels: scrapers, database growth, platform health, recent
// activity. Stays on the previous snapshot during a refetch so the UI
// doesn't flicker between "—" placeholders.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Scraper = {
  name: string;
  table: string;
  running: boolean;
  pids: number[];
  logPath: string;
  logExists: boolean;
  lastModified: string | null;
  sizeBytes: number | null;
  rowCount: number | null;
  recentLines: string[];
};

type Stats = {
  generatedAt: string;
  scrapers: Scraper[];
  database: Record<string, number | null>;
  platform: {
    vercel: {
      sha: string | null;
      ref: string | null;
      msg: string | null;
      author: string | null;
      env: string | null;
      url: string | null;
      deployedAt: string | null;
    };
    ci: {
      status: string | null;
      conclusion: string | null;
      updatedAt: string | null;
      url: string | null;
      name: string | null;
    } | null;
    users: number | null;
    aiCallsToday: number | null;
  };
  recent: {
    prs: { number: number; title: string; mergedAt: string | null; url: string; author: string | null }[] | null;
    inserts: { table: string; rows: { id: unknown; title: unknown; createdAt: string | null }[] }[];
  };
};

const REFRESH_MS = 30_000;

const tzFormatter = new Intl.DateTimeFormat("bg-BG", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  timeZone: "Europe/Sofia",
});

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  try { return tzFormatter.format(new Date(ts)); } catch { return ts; }
}

function relTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (Number.isNaN(diff)) return "—";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("bg-BG");
}

export function AdminDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      const j = (await r.json()) as Stats;
      setStats(j);
      setError(null);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch deferred to a microtask so the effect body itself stays
    // free of synchronous setState — keeps react-hooks/set-state-in-effect
    // happy without changing observable behavior.
    queueMicrotask(() => { void fetchStats(); });
    timer.current = setInterval(() => { void fetchStats(); }, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchStats]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <header className="flex items-baseline justify-between border-b border-stone-800 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
              LEX.BRAIN · operations
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
              Admin dashboard
            </h1>
          </div>
          <div className="text-right text-xs text-stone-500 tabular-nums">
            <div>auto-refresh · 30s</div>
            <div>last fetch: {lastFetched ? fmt(lastFetched.toISOString()) : (loading ? "loading…" : "—")}</div>
            {error && <div className="text-red-400 mt-0.5">⚠ {error}</div>}
          </div>
        </header>

        <ScrapersPanel scrapers={stats?.scrapers} />
        <DatabasePanel db={stats?.database} />
        <PlatformPanel platform={stats?.platform} />
        <RecentPanel recent={stats?.recent} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 font-serif text-lg font-semibold text-stone-200 border-b border-stone-800 pb-2">
      {children}
    </h2>
  );
}

function ScrapersPanel({ scrapers }: { scrapers: Scraper[] | undefined }) {
  return (
    <>
      <SectionTitle>1 · Scrapers</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(scrapers ?? Array(6).fill(null)).map((s, i) => (
          <ScraperCard key={s?.name ?? i} s={s} />
        ))}
      </div>
    </>
  );
}

function ScraperCard({ s }: { s: Scraper | null }) {
  if (!s) {
    return <div className="rounded-lg border border-stone-800 bg-stone-900/40 p-4 h-32 animate-pulse" />;
  }
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm font-semibold text-stone-100">{s.name}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            s.running
              ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
              : "bg-stone-800 text-stone-400 border border-stone-700"
          }`}
        >
          {s.running ? `running · pid ${s.pids[0]}` : "stopped"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-stone-400">
        <dt>table</dt><dd className="text-stone-300 font-mono">{s.table}</dd>
        <dt>rows</dt><dd className="text-stone-300 tabular-nums">{fmtNumber(s.rowCount)}</dd>
        <dt>last log</dt><dd className="text-stone-300">{relTime(s.lastModified)}</dd>
        <dt>log size</dt><dd className="text-stone-300">{fmtBytes(s.sizeBytes)}</dd>
      </dl>
      {!s.logExists && (
        <div className="mt-2 text-[11px] text-amber-400/80">log file not found</div>
      )}
      {s.recentLines.length > 0 && (
        <pre className="mt-3 max-h-20 overflow-hidden rounded bg-stone-950 p-2 text-[10px] leading-snug text-stone-500 font-mono">
          {s.recentLines.map((l) => l.slice(0, 140)).join("\n")}
        </pre>
      )}
    </div>
  );
}

function DatabasePanel({ db }: { db: Record<string, number | null> | undefined }) {
  const entries = db ? Object.entries(db) : [];
  return (
    <>
      <SectionTitle>2 · Database growth</SectionTitle>
      <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {(entries.length > 0 ? entries : Array(12).fill(["…", null])).map(([t, count], i) => (
          <li key={t + i} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
            <div className="text-2xl font-semibold tabular-nums text-red-300">{fmtNumber(count)}</div>
            <div className="mt-0.5 text-xs text-stone-400 font-mono">{t}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

function PlatformPanel({ platform }: { platform: Stats["platform"] | undefined }) {
  return (
    <>
      <SectionTitle>3 · Platform health</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500">Vercel deployment</div>
          {!platform?.vercel?.sha ? (
            <div className="mt-2 text-sm text-stone-400">No Vercel build env detected (local dev?).</div>
          ) : (
            <dl className="mt-2 grid grid-cols-3 gap-y-1 text-xs">
              <dt className="text-stone-500">env</dt>
              <dd className="col-span-2 text-stone-200 font-mono">{platform.vercel.env ?? "—"}</dd>
              <dt className="text-stone-500">commit</dt>
              <dd className="col-span-2 text-stone-200 font-mono">{platform.vercel.sha?.slice(0, 7)} ({platform.vercel.ref})</dd>
              <dt className="text-stone-500">message</dt>
              <dd className="col-span-2 text-stone-200 truncate">{platform.vercel.msg ?? "—"}</dd>
              <dt className="text-stone-500">author</dt>
              <dd className="col-span-2 text-stone-200">{platform.vercel.author ?? "—"}</dd>
              <dt className="text-stone-500">url</dt>
              <dd className="col-span-2 text-stone-200 truncate">{platform.vercel.url ?? "—"}</dd>
            </dl>
          )}
        </div>

        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500">GitHub Actions · last run</div>
          {!platform?.ci ? (
            <div className="mt-2 text-sm text-stone-400">
              Set <code className="text-stone-300">GITHUB_REPO</code> (and optionally <code className="text-stone-300">GITHUB_TOKEN</code>) to enable.
            </div>
          ) : (
            <div className="mt-2 text-xs space-y-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[10px] uppercase ${
                    platform.ci.conclusion === "success"
                      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                      : platform.ci.conclusion === "failure"
                      ? "bg-red-900/60 text-red-300 border border-red-700/50"
                      : "bg-stone-800 text-stone-300 border border-stone-700"
                  }`}
                >
                  {platform.ci.conclusion ?? platform.ci.status}
                </span>
                <span className="text-stone-300 font-mono truncate">{platform.ci.name}</span>
              </div>
              <div className="text-stone-500">{fmt(platform.ci.updatedAt)} · {relTime(platform.ci.updatedAt)}</div>
              {platform.ci.url && (
                <a href={platform.ci.url} target="_blank" rel="noreferrer" className="text-red-300 hover:underline">
                  open run →
                </a>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500">Registered users</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-red-300">
            {fmtNumber(platform?.users)}
          </div>
        </div>

        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500">AI calls today (agent_memory)</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-red-300">
            {fmtNumber(platform?.aiCallsToday)}
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">since UTC midnight</div>
        </div>
      </div>
    </>
  );
}

function RecentPanel({ recent }: { recent: Stats["recent"] | undefined }) {
  return (
    <>
      <SectionTitle>4 · Recent activity</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Last 5 merged PRs</div>
          {!recent?.prs ? (
            <div className="text-sm text-stone-400">
              Set <code className="text-stone-300">GITHUB_REPO</code> + <code className="text-stone-300">GITHUB_TOKEN</code> to enable.
            </div>
          ) : recent.prs.length === 0 ? (
            <div className="text-sm text-stone-400">No merged PRs found.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.prs.map((p) => (
                <li key={p.number} className="border-l-2 border-stone-800 pl-3">
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-stone-100 hover:text-red-300">
                    <span className="text-stone-500">#{p.number}</span> {p.title}
                  </a>
                  <div className="text-[11px] text-stone-500">
                    {p.author ?? "—"} · {relTime(p.mergedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Last 5 inserts per table</div>
          {!recent?.inserts ? (
            <div className="text-sm text-stone-400">—</div>
          ) : (
            <div className="space-y-3">
              {recent.inserts.map((g) => (
                <div key={g.table}>
                  <div className="font-mono text-[11px] text-red-300 mb-1">{g.table}</div>
                  {g.rows.length === 0 ? (
                    <div className="text-xs text-stone-500">no rows</div>
                  ) : (
                    <ul className="text-xs space-y-0.5">
                      {g.rows.map((r, i) => (
                        <li key={String(r.id) + i} className="flex items-baseline gap-2 text-stone-300">
                          <span className="text-stone-500 tabular-nums whitespace-nowrap">{relTime(r.createdAt)}</span>
                          <span className="truncate">{r.title ? String(r.title) : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
