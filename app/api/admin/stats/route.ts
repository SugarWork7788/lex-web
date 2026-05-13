// File: app/api/admin/stats/route.ts
//
// Operations dashboard data feed. Admin-gated. Aggregates four panels:
//   1. SCRAPERS — log-file mtime + PID liveness via `ps`
//   2. DATABASE — Supabase HEAD count() over the major tables
//   3. PLATFORM — Vercel build env + GitHub Actions + AI calls today
//   4. RECENT   — last 5 merged PRs + last 5 inserts per table
//
// All sections degrade gracefully: a section that can't fetch returns
// `null` instead of throwing, so the rest of the dashboard still renders.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execP = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Scrapers
// ─────────────────────────────────────────────────────────────────────────────

type ScraperSpec = {
  name: string;           // Display + identifier used by the UI
  logFile: string;        // Filename inside the logs dir
  scriptHint: string;     // Substring to match in `ps -ax` command lines
  table: string;          // DB table this scraper feeds
};

const SCRAPERS: ScraperSpec[] = [
  { name: "dv-2020-2023",   logFile: "dv-2020-2023.log",  scriptHint: "scrape_dv",  table: "dv_acts" },
  { name: "dv-2016-2019",   logFile: "dv-2016-2019.log",  scriptHint: "scrape_dv",  table: "dv_acts" },
  { name: "eurlex",         logFile: "eurlex_v2.log",     scriptHint: "scrape_eurlex", table: "eu_regulations" },
  { name: "kzk",            logFile: "kzk.log",           scriptHint: "scrape_kzk.py", table: "kzk_decisions" },
  { name: "kzk_historical", logFile: "kzk_historical.log",scriptHint: "scrape_kzk_historical", table: "kzk_decisions" },
  { name: "bnb",            logFile: "bnb.log",           scriptHint: "scrape_bnb",  table: "bnb_decisions" },
];

function logsDir(): string {
  return process.env.LEX_BRAIN_LOGS_DIR?.trim() ||
    join(homedir(), "Desktop", "lex-brain", "logs", "scrapers");
}

async function listRunningProcesses(): Promise<string[]> {
  try {
    // -ww disables column truncation so long Python command lines are intact.
    const { stdout } = await execP("ps -axww -o pid=,command=", { maxBuffer: 4 * 1024 * 1024 });
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function pickMatchingPids(psLines: string[], hint: string, extraHint?: string): number[] {
  const out: number[] = [];
  for (const line of psLines) {
    if (!line.includes(hint)) continue;
    if (extraHint && !line.includes(extraHint)) continue;
    const m = line.match(/^\s*(\d+)\s/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

async function tailLogLines(path: string, n = 5): Promise<string[]> {
  try {
    const text = await fs.readFile(path, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

async function scrapersPanel() {
  const dir = logsDir();
  const psLines = await listRunningProcesses();

  return Promise.all(
    SCRAPERS.map(async (s) => {
      const logPath = join(dir, s.logFile);
      let lastModified: string | null = null;
      let sizeBytes: number | null = null;
      let exists = false;
      try {
        const st = await fs.stat(logPath);
        lastModified = st.mtime.toISOString();
        sizeBytes = st.size;
        exists = true;
      } catch {
        // Log file may not exist yet (e.g. bnb before first run).
      }

      // For dv-2020-2023 vs dv-2016-2019 we share scrape_dv; disambiguate
      // via the year range string in the command line.
      let extraHint: string | undefined;
      if (s.name === "dv-2020-2023") extraHint = "2020";
      else if (s.name === "dv-2016-2019") extraHint = "2016";
      const pids = pickMatchingPids(psLines, s.scriptHint, extraHint);
      const running = pids.length > 0;

      // Row count for the feeder table.
      let rowCount: number | null = null;
      try {
        const { count } = await supabase.from(s.table).select("id", { count: "exact", head: true });
        rowCount = count ?? 0;
      } catch {
        rowCount = null;
      }

      const recentLines = await tailLogLines(logPath, 3);

      return {
        name: s.name,
        table: s.table,
        running,
        pids,
        logPath,
        logExists: exists,
        lastModified,
        sizeBytes,
        rowCount,
        recentLines,
      };
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Database row counts
// ─────────────────────────────────────────────────────────────────────────────

const DB_TABLES = [
  "laws",
  "law_articles",
  "court_decisions",
  "dv_issues",
  "dv_acts",
  "eu_regulations",
  "kzk_decisions",
  "bnb_decisions",
  "sanctioned_entities",
  "offshore_entities",
  "audit_findings",
  "user_profiles",
] as const;

async function databasePanel(): Promise<Record<string, number | null>> {
  const entries = await Promise.all(
    DB_TABLES.map(async (t) => {
      try {
        const { count, error } = await supabase
          .from(t)
          .select("id", { count: "exact", head: true });
        if (error) return [t, null] as const;
        return [t, count ?? 0] as const;
      } catch {
        return [t, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform health (Vercel + GitHub + users + AI calls)
// ─────────────────────────────────────────────────────────────────────────────

type GithubCheckRun = {
  status: string;
  conclusion: string | null;
  updated_at: string;
  html_url: string;
  name: string;
};

async function vercelInfo() {
  // Vercel injects these at build time. They're our best free signal without
  // a VERCEL_TOKEN. https://vercel.com/docs/projects/environment-variables/system-environment-variables
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const msg = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null;
  const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null;
  const env = process.env.VERCEL_ENV ?? null;
  const url = process.env.VERCEL_URL ?? null;
  const deployedAt = process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null;
  return { sha, ref, msg, author, env, url, deployedAt };
}

async function githubCi(): Promise<{
  status: string | null;
  conclusion: string | null;
  updatedAt: string | null;
  url: string | null;
  name: string | null;
} | null> {
  const repo = process.env.GITHUB_REPO?.trim();
  if (!repo) return null;
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "lex-web-admin",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1`,
      { headers, cache: "no-store" },
    );
    if (!r.ok) return null;
    const j: { workflow_runs?: GithubCheckRun[] } = await r.json();
    const run = j.workflow_runs?.[0];
    if (!run) return null;
    return {
      status: run.status,
      conclusion: run.conclusion,
      updatedAt: run.updated_at,
      url: run.html_url,
      name: run.name,
    };
  } catch {
    return null;
  }
}

async function recentMergedPRs() {
  const repo = process.env.GITHUB_REPO?.trim();
  if (!repo) return null;
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "lex-web-admin",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=10`,
      { headers, cache: "no-store" },
    );
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    type PR = { number: number; title: string; merged_at: string | null; html_url: string; user?: { login: string } };
    return (arr as PR[])
      .filter((p) => !!p.merged_at)
      .slice(0, 5)
      .map((p) => ({
        number: p.number,
        title: p.title,
        mergedAt: p.merged_at,
        url: p.html_url,
        author: p.user?.login ?? null,
      }));
  } catch {
    return null;
  }
}

async function totalUsers(): Promise<number | null> {
  try {
    const { count } = await supabase
      .from("user_profiles")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return null;
  }
}

async function aiCallsToday(): Promise<number | null> {
  // agent_memory rows created since UTC midnight today. Counts any agent
  // activity — close enough proxy for "AI calls today". RLS may block the
  // anon key; in that case we get null and the UI shows "—".
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from("agent_memory")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent inserts per table
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_TABLES = [
  { table: "court_decisions", titleField: "case_number" },
  { table: "dv_acts",         titleField: "title" },
  { table: "eu_regulations",  titleField: "title" },
  { table: "kzk_decisions",   titleField: "title" },
  { table: "bnb_decisions",   titleField: "title" },
  { table: "audit_findings",  titleField: "title" },
] as const;

async function recentInserts() {
  return Promise.all(
    RECENT_TABLES.map(async ({ table, titleField }) => {
      try {
        const { data } = await supabase
          .from(table)
          .select(`id, ${titleField}, created_at`)
          .order("created_at", { ascending: false })
          .limit(5);
        return {
          table,
          rows: (data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id,
            title: r[titleField] ?? null,
            createdAt: (r.created_at as string) ?? null,
          })),
        };
      } catch {
        return { table, rows: [] };
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  // Admin gate. Different cookie context than Server Components — we use a
  // route-handler Supabase here. Anonymous + non-admin both get 403 to keep
  // the surface uniform.
  const auth = await createRouteHandlerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [scrapers, database, vercel, ci, prs, users, aiToday, inserts] =
    await Promise.all([
      scrapersPanel(),
      databasePanel(),
      vercelInfo(),
      githubCi(),
      recentMergedPRs(),
      totalUsers(),
      aiCallsToday(),
      recentInserts(),
    ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    scrapers,
    database,
    platform: {
      vercel,
      ci,
      users,
      aiCallsToday: aiToday,
    },
    recent: {
      prs,
      inserts,
    },
  });
}
