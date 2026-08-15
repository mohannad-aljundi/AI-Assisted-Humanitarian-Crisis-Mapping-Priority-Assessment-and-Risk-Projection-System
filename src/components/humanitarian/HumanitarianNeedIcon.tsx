import {
  formatHumanitarianNeedWithIcon,
  getHumanitarianNeedIcon,
} from "@/lib/humanitarianNeedIcons";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";

interface HumanitarianNeedIconProps {
  needType: string;
  className?: string;
  title?: string;
}

export function HumanitarianNeedIcon({
  needType,
  className = "text-base leading-none",
  title,
}: HumanitarianNeedIconProps) {
  const icon = getHumanitarianNeedIcon(needType);
  return (
    <span
      className={className}
      role="img"
      aria-label={needType}
      title={title ?? needType}
    >
      {icon}
    </span>
  );
}

interface HumanitarianNeedLabelProps {
  needType: string;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
}

export function HumanitarianNeedLabel({
  needType,
  className = "inline-flex items-center gap-1.5",
  iconClassName,
  labelClassName = "font-medium text-white",
}: HumanitarianNeedLabelProps) {
  const canonical = normaliseNeedName(needType);
  return (
    <span className={className}>
      <HumanitarianNeedIcon needType={canonical} className={iconClassName} />
      <span className={labelClassName}>{canonical}</span>
    </span>
  );
}

export function HumanitarianNeedInlineText({ needType }: { needType: string }) {
  const canonical = normaliseNeedName(needType);
  return <>{formatHumanitarianNeedWithIcon(canonical)}</>;
}
