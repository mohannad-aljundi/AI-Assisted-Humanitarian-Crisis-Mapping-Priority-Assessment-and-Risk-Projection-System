import { getCrisisTypeBadgeStyles, getCrisisTypeColor } from "@/lib/crisisTypeColors";

interface CrisisTypeBadgeProps {
  crisisType: string | null | undefined;
  className?: string;
  showDot?: boolean;
}

export function CrisisTypeBadge({
  crisisType,
  className = "",
  showDot = true,
}: CrisisTypeBadgeProps) {
  const label = crisisType?.trim() || "Unknown";
  const styles = getCrisisTypeBadgeStyles(crisisType);
  const dotColor = getCrisisTypeColor(crisisType);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium ${className}`}
      style={styles}
    >
      {showDot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}
