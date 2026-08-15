"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

const DEFAULT_MAX_LINES = 6;

interface ExpandableDescriptionProps {
  text: string;
  maxLines?: number;
  className?: string;
  /** Gradient base for fade overlay when collapsed */
  fadeClassName?: string;
}

export function ExpandableDescription({
  text,
  maxLines = DEFAULT_MAX_LINES,
  className = "",
  fadeClassName = "from-black/75",
}: ExpandableDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const descriptionId = useId();

  const measureOverflow = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    if (expanded) return;

    setHasOverflow(el.scrollHeight > el.clientHeight + 2);
  }, [expanded]);

  useEffect(() => {
    measureOverflow();

    const el = textRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => measureOverflow());
    observer.observe(el);

    return () => observer.disconnect();
  }, [measureOverflow, text, maxLines, expanded]);

  const collapsedClampStyle = expanded
    ? undefined
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical" as const,
        WebkitLineClamp: maxLines,
        overflow: "hidden",
      };

  return (
    <div className={`flex w-full min-w-0 flex-col ${className}`}>
      <div className="relative min-w-0">
        <p
          ref={textRef}
          id={descriptionId}
          dir="auto"
          style={collapsedClampStyle}
          className={[
            "text-sm leading-relaxed text-slate-300/95 text-start",
            "[overflow-wrap:anywhere] [word-break:break-word] [hyphens:auto]",
            "transition-[opacity] duration-300 ease-in-out",
          ].join(" ")}
        >
          {text}
        </p>

        {!expanded && hasOverflow ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t ${fadeClassName} via-black/35 to-transparent`}
            aria-hidden
          />
        ) : null}
      </div>

      {hasOverflow ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={descriptionId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-semibold text-cyan-400/90 transition-colors hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 rounded-sm"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
