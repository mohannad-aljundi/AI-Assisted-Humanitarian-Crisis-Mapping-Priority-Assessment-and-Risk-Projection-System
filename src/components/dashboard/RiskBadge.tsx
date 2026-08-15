import type { RiskLevel } from "@prisma/client";
import { RiskBadge as BaseRiskBadge } from "@/components/ui/badges";

export function RiskBadge({
  level,
  className,
}: {
  level: RiskLevel;
  className?: string;
}) {
  return <BaseRiskBadge level={level} className={className} />;
}
