import type { AgreementLevel } from "@prisma/client";
import { roundTo } from "@/lib/utils";
import { resolveLocationParts } from "@/lib/locationDisplay";
import { verificationRepository } from "@/repositories/verificationRepository";
import type { SourceVerificationSummary } from "@/types";

const DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ReportProfile {
  reportId: string;
  sourceName: string;
  country: string;
  city: string;
  crisisType: string;
  affectedPopulation: number | null;
  humanitarianNeeds: string[];
  reportDate: Date;
}

function normalizeCrisisType(value: string | null): string {
  if (!value) return "Unclassified";
  return value.trim();
}

function normalizeSourceName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("reliefweb")) return "ReliefWeb";
  if (lower.includes("gdelt")) return "GDELT";
  if (lower.includes("news")) return "NewsAPI";
  return name.trim();
}

function jaccardSimilarity(a: string[], b: string[]): number {
  // Compare overlap of need/type label sets reported across independent sources.
  const setA = new Set(a.map((item) => item.toLowerCase()));
  const setB = new Set(b.map((item) => item.toLowerCase()));
  const intersection = [...setA].filter((item) => setB.has(item)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function populationAgreement(values: number[]): number {
  if (values.length <= 1) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 1;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, 1 - cv);
}

function mapAgreementLevel(score: number): AgreementLevel {
  if (score >= 0.75) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

export class MultiSourceVerificationService {
  async verifyAfterReport(reportId: string): Promise<SourceVerificationSummary | null> {
    const reports = await verificationRepository.getAnalysedReportsWithinDays(7);
    const profiles = reports
      .map((report) => this.toProfile(report))
      .filter((profile): profile is ReportProfile => profile !== null);

    const target = profiles.find((profile) => profile.reportId === reportId);
    if (!target) return null;

    const group = profiles.filter(
      (profile) =>
        profile.country.toLowerCase() === target.country.toLowerCase() &&
        profile.city.toLowerCase() === target.city.toLowerCase() &&
        profile.crisisType.toLowerCase() === target.crisisType.toLowerCase() &&
        Math.abs(profile.reportDate.getTime() - target.reportDate.getTime()) <=
          DAY_WINDOW_MS
    );

    const uniqueSources = [
      ...new Set(group.map((profile) => normalizeSourceName(profile.sourceName))),
    ];

    if (uniqueSources.length < 2) {
      return null;
    }

    const crisisTypeMatches =
      group.filter(
        (profile) =>
          profile.crisisType.toLowerCase() === target.crisisType.toLowerCase()
      ).length / group.length;

    const populations = group
      .map((profile) => profile.affectedPopulation)
      .filter((value): value is number => value !== null && value > 0);
    const populationAgreementScore =
      populations.length > 1 ? populationAgreement(populations) : 1;

    let needsAgreementTotal = 0;
    let needsComparisons = 0;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        needsAgreementTotal += jaccardSimilarity(
          group[i].humanitarianNeeds,
          group[j].humanitarianNeeds
        );
        needsComparisons += 1;
      }
    }
    const needsAgreementScore =
      needsComparisons > 0 ? needsAgreementTotal / needsComparisons : 1;

    const informationConsistencyScore = roundTo(
      (crisisTypeMatches + populationAgreementScore + needsAgreementScore) / 3
    );

    const sourceAgreementScore = roundTo(
      uniqueSources.length / Math.max(group.length, uniqueSources.length)
    );

    const sourceConsensusPercentage = roundTo(informationConsistencyScore * 100);
    const consensusScore = roundTo(sourceConsensusPercentage);
    const finalConfidenceScore = roundTo(
      consensusScore * 0.6 + sourceAgreementScore * 100 * 0.4
    );
    const agreementLevel = mapAgreementLevel(informationConsistencyScore);

    const saved = await verificationRepository.upsertVerification({
      country: target.country,
      city: target.city,
      crisisType: target.crisisType,
      consensusScore,
      agreementLevel,
      sourceAgreementScore: roundTo(sourceAgreementScore * 100),
      informationConsistencyScore: roundTo(informationConsistencyScore * 100),
      sourceConsensusPercentage,
      finalConfidenceScore,
      comparedSources: uniqueSources.length,
      sourceNames: uniqueSources,
      reportIds: group.map((profile) => profile.reportId),
    });

    return {
      id: saved.id,
      consensusScore,
      agreementLevel,
      comparedSources: uniqueSources.length,
      sourceNames: uniqueSources,
      sourceAgreementScore: roundTo(sourceAgreementScore * 100),
      informationConsistencyScore: roundTo(informationConsistencyScore * 100),
      sourceConsensusPercentage,
      finalConfidenceScore,
      country: target.country,
      city: target.city,
      crisisType: target.crisisType,
      verificationStatus: this.resolveVerificationStatus(
        uniqueSources.length,
        informationConsistencyScore
      ),
      sourceDiversity: roundTo(uniqueSources.length / Math.max(group.length, 1)),
      sourceReliability: roundTo(
        group.reduce((sum, p) => {
          const report = reports.find((r) => r.id === p.reportId);
          return sum + (report?.reliabilityAssessment?.finalScore ?? 0.5);
        }, 0) / group.length
      ),
      totalSources: group.length,
    };
  }

  private resolveVerificationStatus(
    uniqueSourceCount: number,
    consistencyScore: number
  ): SourceVerificationSummary["verificationStatus"] {
    if (uniqueSourceCount < 2) return "Single Source";
    if (consistencyScore >= 0.75) return "Verified";
    if (consistencyScore >= 0.5) return "Partially Corroborated";
    return "Conflicting Sources";
  }

  private toProfile(
    report: Awaited<
      ReturnType<typeof verificationRepository.getAnalysedReportsWithinDays>
    >[number]
  ): ReportProfile | null {
    const locationEntity = report.extractedEntities.find(
      (entity) => entity.entityType === "LOCATION"
    );
    if (!locationEntity) return null;

    const parts = resolveLocationParts(locationEntity.value);
    const crisisType = normalizeCrisisType(
      report.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")
        ?.value ?? null
    );
    const populationEntity = report.extractedEntities.find(
      (entity) => entity.entityType === "AFFECTED_POPULATION"
    );

    return {
      reportId: report.id,
      sourceName: report.source.name,
      country: parts.country,
      city: parts.city,
      crisisType,
      affectedPopulation: populationEntity
        ? parseInt(populationEntity.value, 10) || null
        : null,
      humanitarianNeeds: report.extractedEntities
        .filter((entity) => entity.entityType === "HUMANITARIAN_NEED")
        .map((entity) => entity.value),
      reportDate: report.reportDate,
    };
  }
}

export const multiSourceVerificationService = new MultiSourceVerificationService();
