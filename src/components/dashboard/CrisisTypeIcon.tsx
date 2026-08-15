import type { RiskLevel } from "@prisma/client";
import type { CrisisIconKey } from "@/lib/crisisIcons";
import { CrisisIcon } from "@/components/crisis/CrisisIcon";

interface CrisisTypeIconProps {
  iconKey: CrisisIconKey;
  crisisType: string | null;
  riskLevel?: RiskLevel | null;
}

export function CrisisTypeIcon({
  iconKey,
  crisisType,
  riskLevel,
}: CrisisTypeIconProps) {
  return (
    <CrisisIcon
      iconKey={iconKey}
      crisisType={crisisType}
      riskLevel={riskLevel}
      size={22}
      className="h-11 w-11 rounded-2xl shadow-[0_0_18px_rgba(15,23,42,0.35)]"
    />
  );
}
