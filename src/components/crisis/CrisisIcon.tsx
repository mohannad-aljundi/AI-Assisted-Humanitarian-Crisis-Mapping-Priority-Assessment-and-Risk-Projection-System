import type { RiskLevel } from "@prisma/client";
import {
  CrisisHubIcon,
  getCrisisIconKey,
  type CrisisIconKey,
} from "@/lib/crisisIcons";
import type { MapVerificationStatus } from "@/lib/mapMarkers";

interface CrisisIconProps {
  iconKey?: CrisisIconKey;
  crisisType?: string | null;
  riskLevel?: RiskLevel | null;
  verificationStatus?: MapVerificationStatus | string;
  size?: number;
  showBadge?: boolean;
  className?: string;
}

export function CrisisIcon({
  iconKey,
  crisisType,
  riskLevel,
  verificationStatus,
  size = 18,
  showBadge = true,
  className = "",
}: CrisisIconProps) {
  const key = iconKey ?? getCrisisIconKey(crisisType ?? null);
  const label = crisisType ?? "Humanitarian incident";
  const hubSize = size + 16;
  const svgSize = Math.max(16, Math.round(hubSize * 0.52));

  if (!showBadge) {
    return (
      <CrisisHubIcon
        iconKey={key}
        riskLevel={riskLevel}
        verificationStatus={verificationStatus}
        hubSize={hubSize}
        svgSize={svgSize}
        className={className}
      />
    );
  }

  return (
    <span aria-label={label} title={label} className={className}>
      <CrisisHubIcon
        iconKey={key}
        riskLevel={riskLevel}
        verificationStatus={verificationStatus}
        hubSize={hubSize}
        svgSize={svgSize}
      />
    </span>
  );
}
