"use client";

import { useCallback, useMemo, useRef, useState } from "react";

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  className?: string;
  renderRow: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  className = "",
  renderRow,
  overscan = 4,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  const { start, end, offsetY, totalHeight } = useMemo(() => {
    const visible = Math.ceil(height / rowHeight) + overscan;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - Math.floor(overscan / 2));
    const endIndex = Math.min(items.length, startIndex + visible);
    return {
      start: startIndex,
      end: endIndex,
      offsetY: startIndex * rowHeight,
      totalHeight: items.length * rowHeight,
    };
  }, [height, items.length, overscan, rowHeight, scrollTop]);

  const slice = items.slice(start, end);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-auto ${className}`}
      style={{ maxHeight: height }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {slice.map((item, index) => (
            <div key={start + index} style={{ height: rowHeight }}>
              {renderRow(item, start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
