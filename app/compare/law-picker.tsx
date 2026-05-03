"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LawListItem = { slug: string; name_bg: string; category: string };

type RecentEntry = {
  slug1: string;
  name1: string;
  slug2: string;
  name2: string;
  ts: number;
};

const RECENT_KEY = "lex-compare-recent";

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function LawPicker({ laws }: { laws: LawListItem[] }) {
  const router = useRouter();
  const [pick1, setPick1] = useState<LawListItem | null>(null);
  const [pick2, setPick2] = useState<LawListItem | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  const canCompare = pick1 && pick2 && pick1.slug !== pick2.slug;

  const submit = () => {
    if (!canCompare) return;
    const entry: RecentEntry = {
      slug1: pick1!.slug,
      name1: pick1!.name_bg,
      slug2: pick2!.slug,
      name2: pick2!.name_bg,
      ts: Date.now(),
    };
    if (typeof window !== "undefined") {
      const dedup = recents.filter(
        (r) =>
          !(
            (r.slug1 === entry.slug1 && r.slug2 === entry.slug2) ||
            (r.slug1 === entry.slug2 && r.slug2 === entry.slug1)
          ),
      );
      const next = [entry, ...dedup].slice(0, 8);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    }
    router.push(`/compare/${pick1!.slug}/${pick2!.slug}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <Combobox
          label="Първи закон"
          laws={laws}
          value={pick1}
          onChange={setPick1}
          excludeSlug={pick2?.slug}
        />
        <div className="hidden text-center text-2xl font-light text-amber-700 dark:text-amber-400 md:block">
          ⟺
        </div>
        <Combobox
          label="Втори закон"
          laws={laws}
          value={pick2}
          onChange={setPick2}
          excludeSlug={pick1?.slug}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={submit}
          disabled={!canCompare}
          className="rounded-md bg-amber-700 px-5 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          Сравни →
        </button>
      </div>

      {recents.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wide font-medium text-black/55 dark:text-white/55">
            Последни сравнения
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {recents.map((r) => (
              <li key={`${r.slug1}::${r.slug2}::${r.ts}`}>
                <a
                  href={`/compare/${r.slug1}/${r.slug2}`}
                  className="hover:underline"
                >
                  <span className="text-black/85 dark:text-white/85">
                    {r.name1}
                  </span>
                  <span className="mx-2 text-black/40 dark:text-white/40">⟺</span>
                  <span className="text-black/85 dark:text-white/85">
                    {r.name2}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Combobox({
  label,
  laws,
  value,
  onChange,
  excludeSlug,
}: {
  label: string;
  laws: LawListItem[];
  value: LawListItem | null;
  onChange: (v: LawListItem | null) => void;
  excludeSlug?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) setQuery(value.name_bg);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return laws.slice(0, 30);
    return laws
      .filter((l) => l.slug !== excludeSlug)
      .filter((l) => l.name_bg.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, laws, excludeSlug]);

  return (
    <div className="relative">
      <label className="text-xs uppercase tracking-wide font-medium text-black/55 dark:text-white/55">
        {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Търсете закон по име…"
        className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black focus:border-amber-600 focus:outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-black/15 bg-white shadow-lg dark:border-white/15 dark:bg-stone-900">
          {filtered.map((l) => (
            <li key={l.slug}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(l);
                  setQuery(l.name_bg);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-950/40"
                title={l.name_bg}
              >
                {l.name_bg}
                <span className="ml-2 text-[11px] text-black/45 dark:text-white/45">
                  {l.category}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <p className="mt-1 truncate text-[11px] text-emerald-700 dark:text-emerald-400">
          ✓ Избрано: {value.name_bg}
        </p>
      )}
    </div>
  );
}
