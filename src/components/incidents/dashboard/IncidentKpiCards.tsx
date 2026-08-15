"use client";

import type { AssessmentOverview } from "@/lib/incidentEnrichment";
import type { PersistedAnalysisView } from "@/types";
import {
  INCIDENT_METRIC_ICONS,
  IncidentMetricCard,
} from "@/components/incidents/dashboard/IncidentMetricCard";

interface IncidentKpiCardsProps {
  overview: AssessmentOverview;
  analysis: PersistedAnalysisView;
}

function reliabilityDisplay(score: number): { level: string; badge: string } {
  if (score >= 0.8) return { level: "Low", badge: "Trusted" };
  if (score >= 0.6) return { level: "Medium", badge: "Moderate" };
  return { level: "Critical", badge: "Uncertain" };
}

export function IncidentKpiCards({ overview, analysis }: IncidentKpiCardsProps) {
  const priorityScore = Math.round(analysis.priorityAssessment.severityScore * 100);
  const reliability = reliabilityDisplay(overview.reliability);
  const impactScore = overview.disasterSeverity
    ? overview.disasterSeverity.score
    : priorityScore / 10;
  const impactLevel =
    overview.disasterSeverity?.level ??
    (priorityScore >= 75 ? "Critical" : priorityScore >= 50 ? "High" : priorityScore >= 25 ? "Medium" : "Low");
  const impactPercent = overview.disasterSeverity
    ? Math.round((overview.disasterSeverity.score / 10) * 100)
    : priorityScore;

  const cards = [
    {
      label: "Priority",
      value: overview.priority,
      sub: `Score ${priorityScore}/100`,
      level: overview.priority,
      scorePercent: priorityScore,
      confidenceLabel: "Priority score",
      icon: INCIDENT_METRIC_ICONS.priority,
    },
    {
      label: "Reliability",
      value: `${Math.round(overview.reliability * 100)}%`,
      sub: "Source trust",
      level: reliability.level,
      badgeLabel: reliability.badge,
      scorePercent: overview.reliability * 100,
      confidenceLabel: "Reliability index",
      icon: INCIDENT_METRIC_ICONS.reliability,
    },
    {
      label: "Risk",
      value: overview.risk,
      sub: `Trend: ${overview.trend}`,
      level: overview.risk,
      scorePercent:
        overview.risk === "Critical"
          ? 92
          : overview.risk === "High"
            ? 72
            : overview.risk === "Medium"
              ? 48
              : 28,
      confidenceLabel: "Risk level",
      icon: INCIDENT_METRIC_ICONS.risk,
    },
    {
      label: "Impact Score",
      value: overview.disasterSeverity
        ? `${impactScore.toFixed(1)}/10`
        : `${impactScore.toFixed(1)}`,
      sub: overview.disasterSeverity ? `${overview.disasterSeverity.level} impact` : `${priorityScore}/100 proxy`,
      level: impactLevel,
      scorePercent: impactPercent,
      confidenceLabel: "Impact severity",
      icon: INCIDENT_METRIC_ICONS.impact,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
      {cards.map((card) => (
        <IncidentMetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
