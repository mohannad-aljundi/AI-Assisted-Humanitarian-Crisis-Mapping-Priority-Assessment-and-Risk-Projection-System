export default function CrisisMapLoading() {
  return (
    <div className="map-command-center flex h-screen flex-col overflow-hidden bg-[#04070e]">
      <div className="h-12 shrink-0 animate-pulse border-b border-white/5 bg-white/[0.03]" />
      <div className="grid min-h-0 flex-1 grid-cols-[3rem_1fr_3rem]">
        <div className="animate-pulse border-r border-white/5 bg-white/[0.02]" />
        <div className="animate-pulse bg-[#0a1018]" />
        <div className="animate-pulse border-l border-white/5 bg-white/[0.02]" />
      </div>
      <div className="h-9 shrink-0 animate-pulse border-t border-white/5 bg-white/[0.02]" />
    </div>
  );
}
