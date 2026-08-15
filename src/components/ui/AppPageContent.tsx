interface AppPageContentProps {
  children: React.ReactNode;
  className?: string;
  as?: "main" | "div";
}

/**
 * Page body below the app shell header. Header height is published to
 * `--app-header-height`; use scroll-padding on anchors when needed.
 * Normal document flow places this block directly under the sticky header.
 */
export function AppPageContent({
  children,
  className,
  as: Tag = "main",
}: AppPageContentProps) {
  const classes = ["app-page-content", "min-w-0", "w-full", "flex-1", className]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}
