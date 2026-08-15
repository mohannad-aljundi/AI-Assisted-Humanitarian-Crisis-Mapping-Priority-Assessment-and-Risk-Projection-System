import { glassCard } from "@/lib/uiClasses";

interface DashboardCardProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardCard({ children, className = "" }: DashboardCardProps) {
  return <div className={`${glassCard} ${className}`}>{children}</div>;
}
