export default function EuLoading() {
  return (
    <div>
      {/* Approximate the EuBanner strip (yellow status bar + label). */}
      <div className="border-b border-yellow-200 dark:border-yellow-800/60 bg-yellow-50/60 dark:bg-yellow-950/20 px-6 py-3">
        <div className="mx-auto max-w-5xl flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-yellow-500/60 animate-pulse" />
          <div className="h-3 w-32 animate-pulse rounded bg-yellow-300/30" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <div className="h-10 w-72 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          {[100, 110, 110, 95].map((w, i) => (
            <div
              key={i}
              className="h-8 animate-pulse rounded-full bg-black/[0.05] dark:bg-white/[0.05]"
              style={{ width: w }}
            />
          ))}
        </div>

        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 py-4 -mx-2 px-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <div className="h-5 w-24 animate-pulse rounded bg-yellow-300/40 dark:bg-yellow-700/40" />
                  <div className="h-3 w-20 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                  <div className="ml-auto h-3 w-20 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                </div>
                <div
                  className="h-4 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]"
                  style={{ width: `${55 + ((i * 11) % 35)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
