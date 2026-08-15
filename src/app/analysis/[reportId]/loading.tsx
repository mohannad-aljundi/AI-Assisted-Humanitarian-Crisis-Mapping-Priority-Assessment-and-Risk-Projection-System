export default function AnalysisLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
