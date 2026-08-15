"use client";

import { memo } from "react";

/** Command-center radar diameter (px). */
export const RADAR_SIZE = 170;
export const RADAR_INSET = 14;

interface AiRadarWidgetProps {
  active?: boolean;
  position?: "top-right" | "bottom-right";
}

/** Five concentric ring radii as fraction of max disc radius. */
const RING_RATIOS = [0.2, 0.4, 0.6, 0.8, 1] as const;

export const AiRadarWidget = memo(function AiRadarWidget({
  active = false,
  position = "top-right",
}: AiRadarWidgetProps) {
  const center = RADAR_SIZE / 2;
  const maxRadius = center - 6;

  return (
    <div
      className={`ai-radar-widget ai-radar-widget--${position} ${
        active ? "ai-radar-widget--active" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label={
        active
          ? "AI actively scanning humanitarian feeds worldwide"
          : "AI continuously monitoring humanitarian feeds worldwide"
      }
    >
      <div className="ai-radar-widget__shadow" aria-hidden />

      <div className="ai-radar-widget__assembly" aria-hidden>
        <div className="ai-radar-widget__bloom" />

        <svg
          className="ai-radar-widget__svg"
          width={RADAR_SIZE}
          height={RADAR_SIZE}
          viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
        >
          <line
            x1={center}
            y1={10}
            x2={center}
            y2={RADAR_SIZE - 10}
            className="ai-radar-widget__hair"
          />
          <line
            x1={10}
            y1={center}
            x2={RADAR_SIZE - 10}
            y2={center}
            className="ai-radar-widget__hair"
          />
          <line
            x1={center - maxRadius * 0.707}
            y1={center - maxRadius * 0.707}
            x2={center + maxRadius * 0.707}
            y2={center + maxRadius * 0.707}
            className="ai-radar-widget__hair ai-radar-widget__hair--diag"
          />
          <line
            x1={center + maxRadius * 0.707}
            y1={center - maxRadius * 0.707}
            x2={center - maxRadius * 0.707}
            y2={center + maxRadius * 0.707}
            className="ai-radar-widget__hair ai-radar-widget__hair--diag"
          />

          {RING_RATIOS.map((ratio, index) => (
            <circle
              key={ratio}
              cx={center}
              cy={center}
              r={maxRadius * ratio}
              className={`ai-radar-widget__ring ai-radar-widget__ring--${index + 1}`}
            />
          ))}
        </svg>

        <div className="ai-radar-widget__sweep-mask">
          <div className="ai-radar-widget__sweep" />
          <div className="ai-radar-widget__sweep-trail" />
        </div>

        <div className="ai-radar-widget__core-wrap">
          <div className="ai-radar-widget__core-glow" />
          <div className="ai-radar-widget__core" />
        </div>
      </div>

      <p
        className={`ai-radar-widget__label ${
          active ? "ai-radar-widget__label--scanning" : "ai-radar-widget__label--idle"
        }`}
      >
        {active ? (
          <>
            <span className="ai-radar-widget__label-dot" aria-hidden />
            AI SCANNING
            <span className="ai-radar-widget__ellipsis" aria-hidden>
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </>
        ) : (
          <>
            <span
              className="ai-radar-widget__label-dot ai-radar-widget__label-dot--idle"
              aria-hidden
            />
            LIVE MONITOR
          </>
        )}
      </p>
    </div>
  );
});
