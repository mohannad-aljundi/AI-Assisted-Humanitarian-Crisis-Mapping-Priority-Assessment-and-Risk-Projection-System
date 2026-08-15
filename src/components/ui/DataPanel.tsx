import { DashboardCard } from "./DashboardCard";

interface DataPanelProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  className?: string;
}

export function DataPanel({
  label,
  value,
  subValue,
  className = "",
}: DataPanelProps) {
  return (
    <DashboardCard className={`p-4 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {subValue && (
        <div className="mt-1 text-xs text-slate-400">{subValue}</div>
      )}
    </DashboardCard>
  );
}
