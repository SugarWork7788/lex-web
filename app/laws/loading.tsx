export default function LawsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="h-9 w-40 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
      <div className="mt-2 h-4 w-32 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />

      <nav className="mt-6 flex flex-wrap gap-2">
        {[80, 110, 90, 120, 100, 95, 140].map((w, i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.06]"
            style={{ width: w }}
          />
        ))}
      </nav>

      <ul className="mt-8 divide-y divide-black/[0.08] dark:divide-white/[0.08] border-y border-black/[0.08] dark:border-white/[0.08]">
        {Array.from({ length: 12 }).map((_, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-4 px-2 py-3"
          >
            <div
              className="h-4 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]"
              style={{ width: `${40 + ((i * 13) % 45)}%` }}
            />
            <div className="h-3 w-24 shrink-0 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
          </li>
        ))}
      </ul>
    </div>
  );
}
