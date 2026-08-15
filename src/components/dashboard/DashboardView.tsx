import type { DashboardCoreData } from "@/types";
import { DashboardPageContent } from "@/components/dashboard/DashboardPageContent";

interface DashboardViewProps {
  core: DashboardCoreData;
}

export function DashboardView({ core }: DashboardViewProps) {
  return <DashboardPageContent core={core} />;
}
