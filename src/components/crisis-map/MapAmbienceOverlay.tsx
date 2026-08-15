"use client";

import { memo } from "react";

interface MapAmbienceOverlayProps {
  className?: string;
}

export const MapAmbienceOverlay = memo(function MapAmbienceOverlay({
  className = "",
}: MapAmbienceOverlayProps) {
  return (
    <div className={`map-ambience pointer-events-none ${className}`} aria-hidden>
      <div className="map-ambience__vignette" />
      <div className="map-ambience__clouds" />
      <div className="map-ambience__stars">
        {STAR_OFFSETS.map((star, i) => (
          <span
            key={i}
            className="map-ambience__star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              animationDelay: `${star.delay}s`,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>
    </div>
  );
});

const STAR_OFFSETS = [
  { x: 8, y: 12, delay: 0, opacity: 0.35 },
  { x: 22, y: 28, delay: 1.2, opacity: 0.25 },
  { x: 41, y: 8, delay: 2.4, opacity: 0.3 },
  { x: 63, y: 18, delay: 0.8, opacity: 0.22 },
  { x: 78, y: 34, delay: 3.1, opacity: 0.28 },
  { x: 91, y: 14, delay: 1.8, opacity: 0.2 },
  { x: 15, y: 52, delay: 2.2, opacity: 0.18 },
  { x: 55, y: 44, delay: 4, opacity: 0.24 },
  { x: 84, y: 58, delay: 0.5, opacity: 0.2 },
  { x: 33, y: 72, delay: 3.6, opacity: 0.16 },
  { x: 70, y: 78, delay: 2.8, opacity: 0.22 },
  { x: 48, y: 86, delay: 1.4, opacity: 0.15 },
];
