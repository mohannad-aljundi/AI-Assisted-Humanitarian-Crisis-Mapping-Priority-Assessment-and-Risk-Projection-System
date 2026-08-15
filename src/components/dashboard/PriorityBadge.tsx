import type { PriorityLevel } from "@prisma/client";
import { StatusBadge } from "@/components/ui/badges";

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  return <StatusBadge level={level} />;
}
