export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
        <div className="h-10 w-64 animate-pulse rounded bg-white/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
