export default function CourtsLoading() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] px-6 py-3">
        <div className="mx-auto max-w-5xl flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500/60 animate-pulse" />
          <div className="h-3 w-44 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <div className="h-10 w-72 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
          <div className="mt-2 h-4 w-3/4 max-w-xl animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-6"
            >
              <div className="flex items-start justify-between">
                <div className="h-8 w-8 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]" />
                <div className="h-5 w-12 animate-pulse rounded-full bg-black/[0.07] dark:bg-white/[0.07]" />
              </div>
              <div className="mt-4 h-6 w-48 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.07]" />
              <div className="mt-3 space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="h-3 w-20 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                <div className="h-7 w-16 animate-pulse rounded-md bg-black/[0.07] dark:bg-white/[0.07]" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-4 rounded-xl border border-yellow-200/60 dark:border-yellow-800/40 bg-yellow-50/30 dark:bg-yellow-950/10 px-6 py-5">
          <div className="h-7 w-7 animate-pulse rounded bg-yellow-300/40" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-44 animate-pulse rounded bg-yellow-300/30" />
            <div className="h-3 w-72 animate-pulse rounded bg-yellow-300/20" />
          </div>
          <div className="h-9 w-28 shrink-0 animate-pulse rounded-md bg-yellow-300/40" />
        </div>
      </div>
    </div>
  );
}
