import {
  BarChart3,
  Bell,
  ClipboardCheck,
  FileText,
  Globe,
  LayoutDashboard,
  Map,
  Menu,
  SlidersHorizontal,
  Upload,
  type LucideIcon,
} from "lucide-react";

export const ICON_SIZE = 20;
export const ICON_STROKE = 1.75;

export const iconProps = {
  size: ICON_SIZE,
  strokeWidth: ICON_STROKE,
  "aria-hidden": true as const,
};

const NAV_ICON_MAP: Record<string, LucideIcon> = {
  grid: LayoutDashboard,
  doc: FileText,
  chart: BarChart3,
  map: Map,
  bell: Bell,
  upload: Upload,
  evaluate: ClipboardCheck,
  config: SlidersHorizontal,
};

interface AppIconProps {
  name: string;
  className?: string;
  size?: number;
}

export function AppIcon({ name, className, size = ICON_SIZE }: AppIconProps) {
  const Icon = NAV_ICON_MAP[name] ?? Globe;
  return <Icon size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden />;
}

export function AppLogoIcon({ className }: { className?: string }) {
  return <Globe {...iconProps} className={className} />;
}

export function MenuIcon({ className }: { className?: string }) {
  return <Menu {...iconProps} className={className} />;
}
