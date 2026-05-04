import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuditFindingById } from "@/lib/queries";
import { VoteButton } from "../../vote-button";

type Props = { params: Promise<{ id: string }> };

const SEV_BADGE: Record<string, string> = {
  "КРИТИЧНО": "bg-red-700 text-white",
  "СЕРИОЗНО": "bg-orange-600 text-white",
  "УМЕРЕНО":  "bg-yellow-500 text-yellow-950",
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const f = await getAuditFindingById(id);
  if (!f) return { title: "Не е намерена находка" };
  return {
    title: f.title,
    description: f.description.slice(0, 160),
  };
}

export default async function AuditFindingPage({ params }: Props) {
  const { id } = await params;
  const f = await getAuditFindingById(id);
  if (!f) notFound();

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3 print:hidden">
          <Link href="/audit" className="hover:underline">← Национален правен одит</Link>
        </nav>

        <div className="audit-watermark hidden print:block">
          LEX.BRAIN — Национален правен одит
        </div>

        <header className="border-b border-stone-800 pb-5">
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
          <h1 className="mt-3 font-serif text-2xl sm:text-3xl font-semibold tracking-tight">
            {f.title}
          </h1>
        </header>

        <article className="mt-6 space-y-5 text-sm leading-relaxed">
          <p className="text-stone-100 text-base">{f.description}</p>

          {f.affected_laws.length > 0 && (
            <Block label="Засегнати закони" items={f.affected_laws} />
          )}
          {f.affected_articles.length > 0 && (
            <Block label="Засегнати членове" items={f.affected_articles} />
          )}
          {f.court_decisions_proof.length > 0 && (
            <Block label="Доказателство от съдебна практика" items={f.court_decisions_proof} />
          )}
          {f.proposed_fix && <Para label="Какво трябва да се промени" body={f.proposed_fix} />}
          {f.why_not_fixable && <Para label="Защо е трудно за поправка" body={f.why_not_fixable} />}
          {f.who_must_act.length > 0 && (
            <Block label="Кой трябва да действа" items={f.who_must_act} />
          )}
          {f.reform_steps.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-500">Стъпки за реформа</div>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-stone-200">
                {f.reform_steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
        </article>

        <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
          <VoteButton findingId={f.id} initialCount={f.vote_count} />
          <span className="text-xs text-stone-500">Cmd/Ctrl + P за PDF</span>
        </div>

        <p className="mt-10 text-xs text-stone-500">
          Анализът е извършен от AI на основата на публични данни и съхранени AI находки.
          Резултатите са ориентировъчни. Не представляват правен съвет.
        </p>
      </div>
    </div>
  );
}

function Block({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-200">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
function Para({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <p className="mt-1 text-stone-200">{body}</p>
    </div>
  );
}

