"use client";

import { useEffect, type RefObject } from "react";

const CSS_VAR = "--app-header-height";

export function useAppHeaderHeight(
  headerRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        CSS_VAR,
        `${element.getBoundingClientRect().height}px`
      );
    };

    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty(CSS_VAR);
    };
  }, [headerRef]);
}

export function readAppHeaderHeightPx(): number {
  if (typeof window === "undefined") return 0;

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(CSS_VAR)
    .trim();

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
