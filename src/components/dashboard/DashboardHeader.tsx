"use client";

import { AppShellHeader } from "@/components/ui/AppShellHeader";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  alertCount?: number;
}

export function DashboardHeader({
  title = "Crisis Intelligence Dashboard",
  subtitle = "AI-Assisted Humanitarian Crisis Mapping, Priority Assessment & Risk Projection",
  alertCount = 0,
}: DashboardHeaderProps) {
  return (
    <AppShellHeader
      showLogo
      title={title}
      subtitle={subtitle}
      alertCount={alertCount}
    />
  );
}
