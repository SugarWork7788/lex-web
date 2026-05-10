import Link from "next/link";
import { getAuditFindings, getAuditStats, type AuditFinding } from "@/lib/queries";
import { VoteButton } from "./vote-button";
import { DownloadPdfButton } from "./download-pdf-button";

export const revalidate = 60;
export const metadata = {
  title: "Национален правен одит",
  description: "Критичен анализ на българската правна система от AI главен прокурор.",
};

const SEV_BADGE: Record<string, string> = {
  "КРИТИЧНО": "bg-red-700 text-white",
  "СЕРИОЗНО": "bg-orange-600 text-white",
  "УМЕРЕНО":  "bg-yellow-500 text-yellow-950",
};
const SEV_CARD: Record<string, string> = {
  "КРИТИЧНО": "border-red-700/50 bg-red-950/20",
  "СЕРИОЗНО": "border-orange-700/40 bg-orange-950/15",
  "УМЕРЕНО":  "border-yellow-700/30 bg-yellow-950/10",
};
const SEV_DOT: Record<string, string> = {
  "КРИТИЧНО": "bg-red-500",
  "СЕРИОЗНО": "bg-orange-500",
  "УМЕРЕНО":  "bg-yellow-400",
};

type TimelineBucketId = "short" | "medium" | "long" | "other";
type TimelineBucket = { id: TimelineBucketId; label: string; sublabel: string; items: AuditFinding[] };

function bucketByTimeline(findings: AuditFinding[]): TimelineBucket[] {
  const b: Record<TimelineBucketId, AuditFinding[]> = { short: [], medium: [], long: [], other: [] };
  for (const f of findings) {
    const t = (f.reform_timeline ?? "").toLowerCase();
    if (/6\s*месеца|^месец|до\s*1\s*год/.test(t)) b.short.push(f);
    else if (/1-2|1\s*до\s*2|2-3|3\s*год/.test(t)) b.medium.push(f);
    else if (/5\+|5\s*год|6\s*год|10\s*год/.test(t)) b.long.push(f);
    else b.other.push(f);
  }
  const out: TimelineBucket[] = [
    { id: "short",  label: "Краткосрочно", sublabel: "≤ 6 месеца",  items: b.short  },
    { id: "medium", label: "Средносрочно", sublabel: "1–2 години",  items: b.medium },
    { id: "long",   label: "Дългосрочно",  sublabel: "5+ години",   items: b.long   },
  ];
  if (b.other.length) out.push({ id: "other", label: "Без срок", sublabel: "не е дефинирано", items: b.other });
  return out;
}

function countSeverity(items: AuditFinding[]) {
  return {
    КРИТИЧНО: items.filter((f) => f.severity === "КРИТИЧНО").length,
    СЕРИОЗНО: items.filter((f) => f.severity === "СЕРИОЗНО").length,
    УМЕРЕНО:  items.filter((f) => f.severity === "УМЕРЕНО").length,
  };
}

type Props = { searchParams: Promise<{ domain?: string; severity?: string }> };

export default async function AuditPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [findings, stats] = await Promise.all([
    getAuditFindings(sp.domain, sp.severity),
    getAuditStats(),
  ]);
  const allFindings = await getAuditFindings();
  const allDomains = [...new Set(allFindings.map((f) => f.domain))];
  const timelineBuckets = bucketByTimeline(allFindings);

  // group by domain in stable domain_order
  const groups = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    if (!groups.has(f.domain)) groups.set(f.domain, []);
    groups.get(f.domain)!.push(f);
  }

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <header className="border-b border-stone-800 pb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
            Национален правен одит
          </p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
            Критичен анализ на българската правна система
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-stone-300">
            AI прокурор анализира {stats.domains.toLocaleString("bg-BG")} правни домейна,
            всички закони, съдебна практика и съхранените AI находки. Резултатите са ориентировъчни.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Stat n={stats.КРИТИЧНО} label="критични" tone="red" />
            <Stat n={stats.СЕРИОЗНО} label="сериозни" tone="orange" />
            <Stat n={stats.УМЕРЕНО}  label="умерени" tone="yellow" />
            <Stat n={stats.domains}  label="домейни" tone="stone" />
            <Stat n={stats.total}    label="общо находки" tone="stone" />
          </ul>
          <DownloadPdfButton className="print:hidden" />
        </div>

        <TimelineRoadmap buckets={timelineBuckets} />

        {/* Domain filter */}
        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          <FilterPill href="/audit" active={!sp.domain}>Всички домейни</FilterPill>
          {allDomains.map((d) => (
            <FilterPill key={d}
              href={`/audit?domain=${encodeURIComponent(d)}${sp.severity ? `&severity=${encodeURIComponent(sp.severity)}` : ""}`}
              active={sp.domain === d}>
              {d}
            </FilterPill>
          ))}
        </div>

        {/* Severity filter */}
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {(["КРИТИЧНО","СЕРИОЗНО","УМЕРЕНО"] as const).map((s) => (
            <FilterPill key={s}
              href={`/audit?${sp.domain ? `domain=${encodeURIComponent(sp.domain)}&` : ""}severity=${encodeURIComponent(s)}`}
              active={sp.severity === s} severity={s}>
              {s}
            </FilterPill>
          ))}
          <FilterPill
            href={`/audit${sp.domain ? `?domain=${encodeURIComponent(sp.domain)}` : ""}`}
            active={!sp.severity}>
            Всички сериозности
          </FilterPill>
        </div>

        {findings.length === 0 ? (
          <p className="mt-12 text-sm text-stone-500">
            Все още няма генерирани находки за този филтър.
            Одитът се изпълнява във фон — провери след няколко минути.
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            {[...groups.entries()].sort((a, b) =>
              (a[1][0]?.domain_order ?? 0) - (b[1][0]?.domain_order ?? 0)
            ).map(([domain, items]) => (
              <section key={domain} className="break-inside-avoid">
                <h2 className="font-serif text-xl font-semibold text-red-300 border-b border-stone-800 pb-2">
                  {domain} <span className="text-xs uppercase tracking-wider text-stone-500 ml-2">{items.length}</span>
                </h2>
                <ul className="mt-4 space-y-4">
                  {items.sort((a, b) => sevWeight(a.severity) - sevWeight(b.severity)).map((f) => (
                    <li key={f.id} className={`rounded-lg border p-5 ${SEV_CARD[f.severity]}`}>
                      <FindingCard f={f} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineRoadmap({ buckets }: { buckets: TimelineBucket[] }) {
  return (
    <section className="mt-7 rounded-xl border border-stone-800 bg-stone-900/40 p-5 sm:p-6 print:break-after-page print:mt-4 print:border-stone-300 print:bg-transparent">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-lg font-semibold">График на реформите</h2>
        <span className="text-[11px] uppercase tracking-wider text-stone-500">
          всеки квадрат = 1 находка · кликнете за детайли
        </span>
      </div>
      <div className="mt-5 space-y-5">
        {buckets.map((b) => {
          const c = countSeverity(b.items);
          return (
            <div key={b.id}>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-base font-semibold">{b.label}</span>
                <span className="text-xs text-stone-500">{b.sublabel}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums">
                  {b.items.length.toLocaleString("bg-BG")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.items.length === 0 ? (
                  <span className="text-xs text-stone-600">— няма реформи в този хоризонт —</span>
                ) : (
                  b.items
                    .slice()
                    .sort((a, x) => sevWeight(a.severity) - sevWeight(x.severity))
                    .map((f) => (
                      <Link
                        key={f.id}
                        href={`/audit/finding/${f.id}`}
                        title={`${f.title} — ${f.severity}`}
                        aria-label={f.title}
                        className={`block h-2.5 w-2.5 rounded-[2px] transition-transform hover:scale-150 ${SEV_DOT[f.severity]}`}
                      />
                    ))
                )}
              </div>
              {b.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
                  <span><span className="font-semibold text-red-400">{c.КРИТИЧНО}</span> критични</span>
                  <span><span className="font-semibold text-orange-400">{c.СЕРИОЗНО}</span> сериозни</span>
                  <span><span className="font-semibold text-yellow-400">{c.УМЕРЕНО}</span> умерени</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FindingCard({ f }: { f: AuditFinding }) {
  return (
    <details>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide ${SEV_BADGE[f.severity]}`}>
            {f.severity}
          </span>
          <span className="rounded-full bg-stone-800 px-2.5 py-0.5 text-stone-300">{f.domain}</span>
          {f.authority_level && (
            <span className="rounded-full bg-stone-800/60 px-2.5 py-0.5 text-stone-400">{f.authority_level}</span>
          )}
          {f.reform_timeline && (
            <span className="ml-auto text-stone-500">⏱ {f.reform_timeline}</span>
          )}
        </div>
        <h3 className="mt-2 font-serif text-lg font-semibold leading-snug">{f.title}</h3>
        <p className="mt-2 text-sm text-stone-200 leading-relaxed">{f.description}</p>
        {f.affected_laws.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <span className="text-stone-500 uppercase tracking-wider">Закони:</span>
            {f.affected_laws.slice(0, 5).map((l, i) => (
              <span key={i} className="rounded bg-stone-800 px-1.5 py-0.5 text-stone-300">{l}</span>
            ))}
          </div>
        )}
        {f.who_must_act.length > 0 && (
          <div className="mt-1.5 text-[11px] text-stone-400">
            <span className="uppercase tracking-wider text-stone-500">Кой действа: </span>
            {f.who_must_act.join(" · ")}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs">
          <span className="text-red-400 hover:underline cursor-pointer">▼ Виж пълен анализ</span>
          <Link href={`/audit/finding/${f.id}`} className="text-stone-400 hover:text-stone-100 hover:underline">
            🔗 Сподели
          </Link>
          <div className="ml-auto"><VoteButton findingId={f.id} initialCount={f.vote_count} /></div>
        </div>
      </summary>
      <div className="mt-4 space-y-3 border-t border-stone-800 pt-3 text-sm">
        {f.affected_articles.length > 0 && (
          <Section label="Засегнати членове" items={f.affected_articles} />
        )}
        {f.court_decisions_proof.length > 0 && (
          <Section label="Доказателство от съдебна практика" items={f.court_decisions_proof} />
        )}
        {f.proposed_fix && <Block label="Какво трябва да се промени" body={f.proposed_fix} />}
        {f.why_not_fixable && <Block label="Защо е трудно за поправка" body={f.why_not_fixable} />}
        {f.reform_steps.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-stone-500">Стъпки за реформа</div>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-stone-200">
              {f.reform_steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}

function Section({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-200">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <p className="mt-1 text-stone-200 leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "red" | "orange" | "yellow" | "stone" }) {
  const dot = tone === "red" ? "bg-red-500" : tone === "orange" ? "bg-orange-500" :
              tone === "yellow" ? "bg-yellow-400" : "bg-stone-500";
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <strong className="font-semibold tabular-nums">{n.toLocaleString("bg-BG")}</strong>
      <span className="text-stone-400">{label}</span>
    </li>
  );
}

function FilterPill({
  href, active, children, severity,
}: {
  href: string; active: boolean; children: React.ReactNode; severity?: string;
}) {
  const sevTint = severity ? SEV_BADGE[severity] : "";
  return (
    <Link href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? `border-red-500 ${severity ? sevTint : "bg-red-900/40 text-red-100"}`
          : "border-stone-700 bg-stone-900 text-stone-300 hover:border-red-500"
      }`}>
      {children}
    </Link>
  );
}

function sevWeight(s: string): number {
  return s === "КРИТИЧНО" ? 0 : s === "СЕРИОЗНО" ? 1 : 2;
}
