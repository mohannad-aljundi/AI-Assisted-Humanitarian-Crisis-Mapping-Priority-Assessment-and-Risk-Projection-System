export function IncidentPageLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#060a12]">
      <div className="h-14 animate-pulse border-b border-white/5 bg-slate-900/50" />
      <div className="app-page-content mx-auto w-full max-w-7xl space-y-8 px-4 py-8 pb-20 sm:px-6 lg:px-8">
        <div className="flex justify-between gap-3">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-white/5" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-white/5" />
        </div>
        <header className="space-y-3 border-b border-white/[0.06] pb-8">
          <div className="h-3 w-48 animate-pulse rounded bg-blue-500/20" />
          <div className="h-10 w-3/4 max-w-2xl animate-pulse rounded-xl bg-white/10" />
          <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
        </header>
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="grid gap-4 sm:grid-cols-2 xl:col-span-8 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[22px] bg-white/5" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-[22px] bg-white/5 xl:col-span-4" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-[22px] bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function IncidentDeferredSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-[22px] bg-white/5" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-[22px] bg-white/5" />
      <div className="h-64 animate-pulse rounded-[22px] bg-white/5" />
      <div className="h-48 animate-pulse rounded-[22px] bg-white/5" />
    </div>
  );
}

export function SectionSkeleton({ className = "h-48" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[22px] bg-white/5 ${className}`} />;
}
