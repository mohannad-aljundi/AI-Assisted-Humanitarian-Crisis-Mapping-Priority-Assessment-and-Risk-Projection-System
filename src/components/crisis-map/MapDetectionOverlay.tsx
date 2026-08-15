"use client";

import { memo, type CSSProperties } from "react";

export interface DetectionBeam {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

interface MapDetectionOverlayProps {
  beams: DetectionBeam[];
}

export const MapDetectionOverlay = memo(function MapDetectionOverlay({
  beams,
}: MapDetectionOverlayProps) {
  if (beams.length === 0) return null;

  return (
    <svg className="map-detection-overlay pointer-events-none" aria-hidden>
      <defs>
        <filter id="map-detection-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {beams.map((beam) => (
        <g key={beam.id}>
          <line
            x1={beam.x1}
            y1={beam.y1}
            x2={beam.x2}
            y2={beam.y2}
            className="map-detection-beam-glow"
            style={
              {
                "--beam-length": beam.length,
              } as CSSProperties
            }
          />
          <line
            x1={beam.x1}
            y1={beam.y1}
            x2={beam.x2}
            y2={beam.y2}
            className="map-detection-beam"
            style={
              {
                "--beam-length": beam.length,
              } as CSSProperties
            }
          />
          <circle
            cx={beam.x2}
            cy={beam.y2}
            r="4"
            className="map-detection-impact map-detection-impact--core"
          />
          <circle
            cx={beam.x2}
            cy={beam.y2}
            r="8"
            className="map-detection-impact map-detection-impact--ripple"
          />
          <circle
            cx={beam.x2}
            cy={beam.y2}
            r="14"
            className="map-detection-impact map-detection-impact--ripple map-detection-impact--ripple-delayed"
          />
        </g>
      ))}
    </svg>
  );
});
