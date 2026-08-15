"use client";

import type { DashboardAlert } from "@/types";
import { AlertsTicker } from "@/components/ui/AlertsTicker";
import { useDashboardLive } from "@/contexts/DashboardLiveContext";

interface DashboardAlertsTickerLoaderProps {
  initialAlerts: DashboardAlert[];
}

export function DashboardAlertsTickerLoader({
  initialAlerts,
}: DashboardAlertsTickerLoaderProps) {
  const { recentAlerts } = useDashboardLive();
  const alerts = recentAlerts.length > 0 ? recentAlerts : initialAlerts;
  return <AlertsTicker alerts={alerts} />;
}
