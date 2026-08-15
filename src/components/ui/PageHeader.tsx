import { pageSubtitle, pageTitle } from "@/lib/uiClasses";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">
            {eyebrow}
          </p>
        )}
        <h1 className={pageTitle}>{title}</h1>
        {description && <p className={pageSubtitle}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
