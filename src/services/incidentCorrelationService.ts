import { resolveLocationParts } from "@/lib/locationDisplay";
import {
  computeCorrelationScore,
  computeDynamicPriorityScore,
  computeEvidenceStrength,
  computeSourceAgreement,
  computeTimelineConsistency,
  CORRELATION_MERGE_THRESHOLD,
  type CorrelationProfile,
} from "@/lib/incidentCorrelationScoring";
import {
  isTrustedSource,
  resolveCorrelationVerificationStatus,
  scoreToPriorityLevel,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import { roundTo } from "@/lib/utils";
import { masterIncidentRepository, type MasterIncidentWithMembers } from "@/repositories/masterIncidentRepository";
import type { PriorityLevel } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const CORRELATION_WINDOW_DAYS = 14;
const BACKFILL_TIME_WINDOW_DAYS = 60;

export interface MasterIncidentSummary {
  id: string;
  canonicalReportId: string;
  title: string;
  summary: string | null;
  crisisType: string;
  country: string;
  city: string;
  supportingReportCount: number;
  independentSourceCount: number;
  sourceAgreementPercent: number;
  timelineConsistency: number;
  confidenceScore: number;
  evidenceStrength: number;
  correlationVerificationStatus: CorrelationVerificationStatus;
  dynamicPriorityScore: number;
  dynamicPriorityLevel: PriorityLevel;
  sourceNames: string[];
  linkedReports: Array<{
    reportId: string;
    title: string;
    sourceName: string;
    reportDate: string;
    similarityScore: number;
    isCanonical: boolean;
  }>;
}

function normalizeSource(name: string): string {
  return name.trim().toLowerCase();
}

function buildProfile(
  report: NonNullable<Awaited<ReturnType<typeof masterIncidentRepository.getReportProfile>>>
): CorrelationProfile {
  const locationEntity = report.extractedEntities.find((e) => e.entityType === "LOCATION");
  const parts = locationEntity
    ? resolveLocationParts(locationEntity.value)
    : { city: "", country: "", display: "" };

  const crisisType =
    report.extractedEntities.find((e) => e.entityType === "CRISIS_TYPE")?.value ??
    report.crisis?.crisisType ??
    "Unclassified";

  const populationEntity = report.extractedEntities.find(
    (e) => e.entityType === "AFFECTED_POPULATION"
  );

  return {
    reportId: report.id,
    title: report.title,
    content: report.content,
    reportDate: report.reportDate,
    sourceName: report.source.name,
    sourceCredibility: report.source.credibilityScore,
    crisisType,
    country: parts.country || parts.display,
    city: parts.city,
    latitude: report.crisis?.location?.latitude ?? locationEntity?.latitude ?? null,
    longitude: report.crisis?.location?.longitude ?? locationEntity?.longitude ?? null,
    affectedPopulation: populationEntity
      ? parseInt(populationEntity.value.replace(/\D/g, ""), 10) || null
      : null,
    entityValues: report.extractedEntities.map((e) => e.value),
    situationSummary: report.insight?.situationSummary ?? null,
    aiSeverityScore: report.priorityAssessment?.severityScore ?? 0.5,
    reliabilityScore: report.reliabilityAssessment?.finalScore ?? 0.5,
  };
}

function masterToSummary(
  master: MasterIncidentWithMembers | null | undefined
): MasterIncidentSummary | null {
  if (!master) return null;
  return {
    id: master.id,
    canonicalReportId: master.canonicalReportId,
    title: master.title,
    summary: master.summary,
    crisisType: master.crisisType,
    country: master.country,
    city: master.city,
    supportingReportCount: master.supportingReportCount,
    independentSourceCount: master.independentSourceCount,
    sourceAgreementPercent: master.sourceAgreementPercent,
    timelineConsistency: master.timelineConsistency,
    confidenceScore: master.confidenceScore,
    evidenceStrength: master.evidenceStrength,
    correlationVerificationStatus:
      master.correlationVerificationStatus as CorrelationVerificationStatus,
    dynamicPriorityScore: master.dynamicPriorityScore,
    dynamicPriorityLevel: master.dynamicPriorityLevel,
    sourceNames: Array.isArray(master.sourceNames)
      ? (master.sourceNames as string[])
      : [],
    linkedReports: master.members.map((m) => ({
      reportId: m.reportId,
      title: m.report.title,
      sourceName: m.report.source.name,
      reportDate: m.report.reportDate.toISOString(),
      similarityScore: m.similarityScore,
      isCanonical: m.isCanonical,
    })),
  };
}

export class IncidentCorrelationService {
  async correlateReport(
    reportId: string,
    options?: { backfill?: boolean; deferIntelligence?: boolean }
  ): Promise<MasterIncidentSummary | null> {
    const report = await masterIncidentRepository.getReportProfile(reportId);
    if (!report?.priorityAssessment) return null;

    if (report.masterIncidentMember) {
      return this.refreshCluster(report.masterIncidentMember.masterIncidentId, options);
    }

    const profile = buildProfile(report);
    const windowStart = new Date(
      Date.now() - CORRELATION_WINDOW_DAYS * DAY_MS
    );

    const candidates = await masterIncidentRepository.findCandidates({
      crisisType: profile.crisisType,
      country: profile.country,
      windowStart,
      backfill: options?.backfill,
    });

    let bestMatch: { id: string; score: number } | null = null;
    const scoreOptions = options?.backfill
      ? { timeWindowDays: BACKFILL_TIME_WINDOW_DAYS }
      : undefined;

    for (const candidate of candidates) {
      const canonicalMember =
        candidate.members.find((m) => m.isCanonical) ?? candidate.members[0];
      if (!canonicalMember) continue;

      const canonicalReport = await masterIncidentRepository.getReportProfile(
        canonicalMember.reportId
      );
      if (!canonicalReport) continue;

      const canonicalProfile = buildProfile(canonicalReport);
      const score = computeCorrelationScore(profile, canonicalProfile, scoreOptions);
      if (score >= CORRELATION_MERGE_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: candidate.id, score };
      }
    }

    if (bestMatch) {
      await masterIncidentRepository.addMember({
        masterIncidentId: bestMatch.id,
        reportId,
        similarityScore: roundTo(bestMatch.score),
      });
      return this.refreshCluster(bestMatch.id, options);
    }

    const metrics = this.computeClusterMetrics([profile]);
    await masterIncidentRepository.createMasterIncident({
      canonicalReportId: reportId,
      title: report.title,
      summary: report.insight?.situationSummary ?? null,
      crisisType: profile.crisisType,
      country: profile.country,
      city: profile.city,
      latitude: profile.latitude,
      longitude: profile.longitude,
      ...metrics,
    });

    const created = await masterIncidentRepository.findByReportId(reportId);
    return masterToSummary(created?.masterIncident ?? null);
  }

  async getForReport(reportId: string): Promise<MasterIncidentSummary | null> {
    const member = await masterIncidentRepository.findByReportId(reportId);
    if (!member) return null;
    return masterToSummary(member.masterIncident);
  }

  async refreshCluster(
    masterIncidentId: string,
    options?: { deferIntelligence?: boolean }
  ): Promise<MasterIncidentSummary | null> {
    const cluster = await masterIncidentRepository.findById(masterIncidentId);
    if (!cluster) return null;

    const profiles: CorrelationProfile[] = [];
    for (const member of cluster.members) {
      const report = await masterIncidentRepository.getReportProfile(member.reportId);
      if (report) profiles.push(buildProfile(report));
    }

    if (profiles.length === 0) return null;

    const metrics = this.computeClusterMetrics(profiles);
    const canonical = this.pickCanonical(profiles, cluster.canonicalReportId);

    await masterIncidentRepository.updateMasterIncident(masterIncidentId, {
      canonicalReportId: canonical.reportId,
      title: canonical.title,
      summary: canonical.situationSummary,
      crisisType: canonical.crisisType,
      country: canonical.country,
      city: canonical.city,
      latitude: canonical.latitude,
      longitude: canonical.longitude,
      ...metrics,
    });

    await prismaSetCanonicalFlags(masterIncidentId, canonical.reportId, cluster.members);

    if (!options?.deferIntelligence) {
      try {
        const { masterIncidentIntelligenceService } = await import(
          "@/services/masterIncidentIntelligenceService"
        );
        const { masterIncidentPropagationService } = await import(
          "@/services/masterIncidentPropagationService"
        );
        await masterIncidentIntelligenceService.synthesizeIfNeeded(
          masterIncidentId,
          profiles.length
        );
        await masterIncidentPropagationService.propagateFromIntelligence(masterIncidentId);
      } catch (error) {
        console.error(
          `[IncidentCorrelation] master intelligence synthesis failed for ${masterIncidentId}:`,
          error
        );
      }
    }

    const refreshed = await masterIncidentRepository.findByReportId(canonical.reportId);
    return masterToSummary(refreshed?.masterIncident ?? null);
  }

  private pickCanonical(
    profiles: CorrelationProfile[],
    currentCanonicalId: string
  ): CorrelationProfile {
    const current = profiles.find((p) => p.reportId === currentCanonicalId);
    if (current && profiles.length <= 2) return current;

    return profiles.reduce((best, profile) => {
      const score =
        profile.reliabilityScore * 0.45 +
        profile.aiSeverityScore * 0.35 +
        profile.sourceCredibility * 0.2;
      const bestScore =
        best.reliabilityScore * 0.45 +
        best.aiSeverityScore * 0.35 +
        best.sourceCredibility * 0.2;
      return score > bestScore ? profile : best;
    });
  }

  private computeClusterMetrics(profiles: CorrelationProfile[]) {
    const sourceMap = new Map<string, { name: string; credibility: number }>();
    for (const profile of profiles) {
      const key = normalizeSource(profile.sourceName);
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          name: profile.sourceName,
          credibility: profile.sourceCredibility,
        });
      }
    }

    const sourceNames = [...sourceMap.values()].map((s) => s.name);
    const independentSourceCount = sourceNames.length;
    const trustedIndependentCount = [...sourceMap.values()].filter((s) =>
      isTrustedSource(s.name, s.credibility)
    ).length;

    const sourceAgreementPercent = computeSourceAgreement(profiles);
    const timelineConsistency = computeTimelineConsistency(
      profiles.map((p) => p.reportDate)
    );
    const avgReliability =
      profiles.reduce((sum, p) => sum + p.reliabilityScore, 0) / profiles.length;

    const evidenceStrength = computeEvidenceStrength({
      independentSourceCount,
      sourceAgreementPercent,
      timelineConsistency,
      avgReliability,
    });

    const correlationVerificationStatus = resolveCorrelationVerificationStatus({
      independentSourceCount,
      trustedIndependentCount,
      sourceAgreementPercent,
      evidenceStrength,
    });

    const confidenceScore = roundTo(
      evidenceStrength * 0.55 + (sourceAgreementPercent / 100) * 0.45
    );

    const maxSeverity = Math.max(...profiles.map((p) => p.aiSeverityScore));
    const recentEscalation =
      profiles.filter(
        (p) => p.reportDate.getTime() >= Date.now() - 3 * DAY_MS
      ).length > 1
        ? 0.15
        : 0;

    const dynamicPriorityScore = roundTo(
      computeDynamicPriorityScore({
        aiSeverityScore: maxSeverity,
        supportingReportCount: profiles.length,
        independentSourceCount,
        avgReliability,
        sourceAgreementPercent,
        evidenceStrength,
        recentEscalation,
      })
    );

    const dynamicPriorityLevel = scoreToPriorityLevel(dynamicPriorityScore);

    return {
      supportingReportCount: profiles.length,
      independentSourceCount,
      sourceAgreementPercent,
      timelineConsistency: roundTo(timelineConsistency),
      confidenceScore,
      evidenceStrength: roundTo(evidenceStrength),
      correlationVerificationStatus,
      dynamicPriorityScore,
      dynamicPriorityLevel,
      sourceNames,
      reportIds: profiles.map((p) => p.reportId),
    };
  }
}

async function prismaSetCanonicalFlags(
  masterIncidentId: string,
  canonicalReportId: string,
  members: Array<{ id: string; reportId: string }>
) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$transaction(
    members.map((member) =>
      prisma.masterIncidentMember.update({
        where: { id: member.id },
        data: { isCanonical: member.reportId === canonicalReportId },
      })
    )
  );
  await prisma.masterIncident.update({
    where: { id: masterIncidentId },
    data: { canonicalReportId },
  });
}

export const incidentCorrelationService = new IncidentCorrelationService();
