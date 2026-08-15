import type { CrisisIconKey } from "@/lib/crisisIcons";
import { CrisisRegistryIcon } from "@/lib/crisisIcons";

interface CrisisLucideIconProps {
  iconKey: CrisisIconKey;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** @deprecated Prefer CrisisRegistryIcon — kept for existing imports. */
export function CrisisLucideIcon(props: CrisisLucideIconProps) {
  return <CrisisRegistryIcon {...props} />;
}
