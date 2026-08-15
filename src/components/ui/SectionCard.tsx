import { panelHeader } from "@/lib/uiClasses";
import { DashboardCard } from "./DashboardCard";

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  fill?: boolean;
}

export function SectionCard({
  title,
  description,
  children,
  className = "",
  action,
  fill = false,
}: SectionCardProps) {
  return (
    <DashboardCard
      className={`p-5 ${fill ? "flex h-full flex-col" : ""} ${className}`}
    >
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>{children}</div>
    </DashboardCard>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={`${panelHeader} mb-3`}>{children}</p>;
}
