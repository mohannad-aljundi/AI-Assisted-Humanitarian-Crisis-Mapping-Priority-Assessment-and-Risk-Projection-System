import type { AlertType, RiskLevel, RiskTrend } from "@prisma/client";
import { formatAlertLocation, resolveLocationParts } from "@/lib/locationDisplay";
import { alertRepository } from "@/repositories/alertRepository";
import { dashboardRepository } from "@/repositories/dashboardRepository";
import { masterIncidentRepository } from "@/repositories/masterIncidentRepository";
import { mapIntelligenceRecord } from "@/repositories/masterIncidentIntelligenceRepository";
import {
  operationalPriorityPercent,
  resolveOperationalIntelligence,
} from "@/lib/operationalIntelligenceResolver";
import { extractedEntityRepository } from "@/repositories/extractedEntityRepository";
import { locationRepository } from "@/repositories/locationRepository";
import { priorityAssessmentRepository } from "@/repositories/priorityAssessmentRepository";
import { reportRepository } from "@/repositories/reportRepository";
import { riskRepository } from "@/repositories/riskRepository";
import type { DashboardAlert, SourceVerificationSummary } from "@/types";
import type { Alert } from "@prisma/client";

export class AlertService {
  async listAlerts(params: { page?: number; limit?: number }): Promise<{
    items: DashboardAlert[];
    page: number;
    nextPage: number | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    const result = await alertRepository.findPaginated(params.page, params.limit);
    const items = await this.mapAlerts(result.items);
    return {
      items,
      page: result.page,
      nextPage: result.nextPage,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
    };
  }

  private async mapAlerts(alerts: Alert[]): Promise<DashboardAlert[]> {
    const recentReports = await dashboardRepository.getRecentAnalysedReports(
      Math.min(50, alerts.length * 2)
    );

    const mapped = await Promise.all(
      alerts.map(async (alert) => {
        const matched = recentReports.find(
          (r) =>
            r.title === alert.description ||
            r.extractedEntities.some(
              (e) =>
                e.entityType === "LOCATION" &&
                (alert.city === e.value || alert.description.includes(r.title))
            )
        );

        const locationEntity = matched?.extractedEntities.find(
          (e) => e.entityType === "LOCATION"
        );
        const parts = locationEntity
          ? resolveLocationParts(locationEntity.value)
          : resolveLocationParts(
              [alert.city, alert.country].filter((v) => v && v !== "Unknown").join(", ") ||
                alert.country ||
                alert.city
            );

        const city = parts.city || (alert.city !== "Unknown" ? alert.city : "");
        const country = parts.country || (alert.country !== "Unknown" ? alert.country : "");

        let sourceCount = matched ? 1 : undefined;
        let priorityLevel = matched?.priorityAssessment?.priorityLevel;
        let correlationVerificationStatus: string | undefined;
        let dynamicPriorityScore: number | undefined;

        if (matched?.priorityAssessment) {
          const member = matched.masterIncidentMember;
          const master = member?.masterIncident;
          const intelligence = master?.intelligence
            ? mapIntelligenceRecord(master.intelligence)
            : null;
          const operational = resolveOperationalIntelligence({
            master: master ?? null,
            intelligence,
            reportFallback: {
              priorityLevel: matched.priorityAssessment.priorityLevel,
              priorityScore: matched.priorityAssessment.severityScore,
              verificationStatus: master?.correlationVerificationStatus ?? null,
              confidence: master?.confidenceScore ?? null,
            },
          });

          sourceCount = operational.independentSourceCount;
          priorityLevel = operational.priorityLevel;
          correlationVerificationStatus = operational.verificationStatus;
          dynamicPriorityScore = operational.dynamicPriorityScore;
        }

        return {
          id: alert.id,
          title: alert.title,
          description: alert.description,
          country: country || parts.display,
          city: city || parts.display,
          crisisType: alert.crisisType,
          riskLevel: alert.riskLevel,
          alertType: alert.alertType,
          createdAt: alert.createdAt.toISOString(),
          priorityLevel,
          reliabilityScore: matched?.reliabilityAssessment?.finalScore,
          sourceCount,
          reportId: matched?.id,
          correlationVerificationStatus,
          dynamicPriorityScore,
        };
      })
    );

    return mapped.sort(
      (a, b) =>
        (b.dynamicPriorityScore ?? 0) - (a.dynamicPriorityScore ?? 0) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getRecentAlerts(limit = 10): Promise<DashboardAlert[]> {
    const alerts = await alertRepository.findRecent(limit);
    return this.mapAlerts(alerts);
  }

  async generateForReport(
    reportId: string,
    verification: SourceVerificationSummary | null
  ): Promise<void> {
    const report = await reportRepository.findById(reportId);
    if (!report) return;

    const [entities, priorityAssessment, member] = await Promise.all([
      extractedEntityRepository.findByReportId(reportId),
      priorityAssessmentRepository.findByReportId(reportId),
      masterIncidentRepository.findByReportId(reportId),
    ]);
    if (!priorityAssessment) return;

    const master = member?.masterIncident;
    const intelligence = master?.intelligence
      ? mapIntelligenceRecord(master.intelligence)
      : null;
    const operational = resolveOperationalIntelligence({
      master: master ?? null,
      intelligence,
      reportFallback: {
        priorityLevel: priorityAssessment.priorityLevel,
        priorityScore: priorityAssessment.severityScore,
        verificationStatus: master?.correlationVerificationStatus ?? null,
        confidence: master?.confidenceScore ?? null,
      },
    });

    const priorityScore = operationalPriorityPercent(operational);

    const location = entities.find((entity) => entity.entityType === "LOCATION");
    const crisisType =
      entities.find((entity) => entity.entityType === "CRISIS_TYPE")?.value ??
      "Unclassified";
    const parts = location
      ? resolveLocationParts(location.value)
      : {
          city: "",
          country: "",
          display: formatAlertLocation("", ""),
          verified: false,
        };

    let riskLevel: RiskLevel = "Medium";
    let trend: RiskTrend = "Stable";

    if (location) {
      const savedLocation = await locationRepository.findByName(location.value);
      if (savedLocation) {
        const risk = await riskRepository.findLatestByLocationId(savedLocation.id);
        if (risk) {
          riskLevel = risk.riskLevel;
          trend = risk.trend;
        }
      }
    }

    await this.createIfNew(
      {
        title: `New crisis detected in ${parts.display}`,
        description: `${crisisType} incident identified from ${report.source.name}.`,
        country: parts.country,
        city: parts.city,
        crisisType,
        riskLevel,
        alertType: "NEW_CRISIS",
      },
      48
    );

    const hasCasualties = entities.some(
      (e) =>
        e.entitySubtype === "DEATHS" ||
        (e.entityType === "AFFECTED_POPULATION" && /\d+/.test(e.value))
    );
    const hasHumanitarianEmergency = report.content
      .toLowerCase()
      .includes("humanitarian emergency");
    const criticalNeeds = entities.filter(
      (e) => e.entityType === "HUMANITARIAN_NEED" && e.severity === "Critical"
    );

    if (
      operational.priorityLevel === "Critical" ||
      priorityScore >= 75 ||
      hasCasualties ||
      hasHumanitarianEmergency
    ) {
      await this.createIfNew(
        {
          title: `Critical humanitarian needs detected in ${parts.display}`,
          description: hasHumanitarianEmergency
            ? `Humanitarian emergency declared: ${report.title}`
            : report.title,
          country: parts.country,
          city: parts.city,
          crisisType,
          riskLevel: "Critical",
          alertType: "CRITICAL_PRIORITY",
        },
        24
      );
    } else if (
      operational.priorityLevel === "High" ||
      priorityScore >= 50 ||
      criticalNeeds.length > 0
    ) {
      await this.createIfNew(
        {
          title: `High priority incident in ${parts.display}`,
          description: report.title,
          country: parts.country,
          city: parts.city,
          crisisType,
          riskLevel: riskLevel === "Low" ? "High" : riskLevel,
          alertType: "HIGH_PRIORITY",
        },
        24
      );
    } else if (operational.priorityLevel === "Medium" || priorityScore >= 25) {
      await this.createIfNew(
        {
          title: `Medium priority incident in ${parts.display}`,
          description: `${crisisType} situation requires monitoring: ${report.title.slice(0, 120)}`,
          country: parts.country,
          city: parts.city,
          crisisType,
          riskLevel: "Medium",
          alertType: "HIGH_PRIORITY",
        },
        48
      );
    }

    if (trend === "Increasing") {
      await this.createIfNew(
        {
          title: `Escalation detected in ${parts.city}, ${parts.country}`,
          description: `Risk trend is increasing for ${crisisType.toLowerCase()} conditions.`,
          country: parts.country,
          city: parts.city,
          crisisType,
          riskLevel,
          alertType: "ESCALATION",
        },
        24
      );
    }

    if (
      verification &&
      verification.comparedSources >= 2 &&
      verification.consensusScore >= 70
    ) {
      await this.createIfNew(
        {
          title: `Multiple sources confirm ${crisisType.toLowerCase()} in ${parts.country}`,
          description: `${verification.comparedSources} sources agree with ${verification.consensusScore}% consensus (${verification.sourceNames.join(", ")}).`,
          country: parts.country,
          city: parts.city,
          crisisType,
          riskLevel,
          alertType: "MULTI_SOURCE_CONFIRMATION",
        },
        48
      );
    }
  }

  private async createIfNew(
    data: {
      title: string;
      description: string;
      country: string;
      city: string;
      crisisType: string;
      riskLevel: RiskLevel;
      alertType: AlertType;
    },
    dedupeHours: number
  ) {
    const exists = await alertRepository.existsSimilar(
      data.alertType,
      data.country,
      data.city,
      dedupeHours
    );
    if (exists) return;
    await alertRepository.create(data);
  }
}

export const alertService = new AlertService();
