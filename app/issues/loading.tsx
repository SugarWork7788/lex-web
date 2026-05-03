export default function IssuesLoading() {
  return (
    <article className="mx-auto max-w-6xl px-6 py-10">
      <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <div className="h-3 w-20 animate-pulse rounded bg-amber-200/40 dark:bg-amber-700/30" />
        <div className="mt-2 h-10 w-80 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
        <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-4 w-32 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.06]"
            />
          ))}
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-3 w-20 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.06]" />
              {[60, 70, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-7 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.06]"
                  style={{ width: w }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-3 w-12 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.06]" />
              {[120, 140, 100, 130, 110].map((w, i) => (
                <div
                  key={i}
                  className="h-6 animate-pulse rounded-full bg-black/[0.05] dark:bg-white/[0.05]"
                  style={{ width: w }}
                />
              ))}
            </div>
          </div>

          <ul className="mt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-black/[0.07] dark:bg-white/[0.08]" />
                  <div className="h-5 w-32 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.06]" />
                  <div className="ml-auto h-3 w-20 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                </div>
                <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]" />
                <div className="mt-2 space-y-1.5">
                  <div className="h-3 w-full animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                  <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside>
          <div className="rounded-lg border border-black/[0.08] bg-white p-5 dark:border-white/[0.1] dark:bg-white/[0.03]">
            <div className="h-5 w-44 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
            <ol className="mt-4 space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <li key={i}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="h-3 w-3 animate-pulse rounded bg-black/[0.05]" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-black/[0.06]" />
                    <div className="h-3 w-6 animate-pulse rounded bg-black/[0.05]" />
                  </div>
                  <div className="mt-1.5 h-1 w-full animate-pulse rounded-full bg-black/[0.06]" />
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </article>
  );
}
