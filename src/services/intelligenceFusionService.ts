import { prisma } from "@/lib/prisma";
import { crisisRepository } from "@/repositories/crisisRepository";
import { roundTo, clamp } from "@/lib/utils";
import { TIMELINE_EVENT_TYPES } from "@/lib/intelligenceConstants";
import type { SourceVerificationSummary } from "@/types";

export class IntelligenceFusionService {
  /**
   * When multiple sources confirm the same event, boost reliability and record fusion.
   */
  async applyVerificationBoost(
    reportId: string,
    verification: SourceVerificationSummary | null
  ): Promise<void> {
    if (!verification || verification.comparedSources < 2) return;

    const boost = clamp(verification.finalConfidenceScore / 100, 0, 1) * 0.15;

    const reliability = await prisma.reliabilityAssessment.findUnique({
      where: { reportId },
    });
    if (!reliability) return;

    const newScore = roundTo(clamp(reliability.finalScore + boost, 0, 1));

    await prisma.$transaction([
      prisma.reliabilityAssessment.update({
        where: { reportId },
        data: { finalScore: newScore },
      }),
      prisma.report.update({
        where: { id: reportId },
        data: {
          fusedSourceCount: verification.comparedSources,
        },
      }),
    ]);

    const crisis = await crisisRepository.findByReportId(reportId);
    if (crisis) {
      await prisma.crisisTimelineEvent.create({
        data: {
          crisisId: crisis.id,
          reportId,
          eventType: TIMELINE_EVENT_TYPES.SOURCE_FUSION,
          title: "Multi-source confirmation",
          description: `${verification.comparedSources} independent sources (${verification.sourceNames.join(", ")}) corroborate this incident. Confidence increased.`,
          occurredAt: new Date(),
          metadata: {
            sourceNames: verification.sourceNames,
            consensusScore: verification.consensusScore,
            verificationStatus: verification.verificationStatus,
          },
        },
      });
    }
  }

  /**
   * Lower confidence when contradictory sources are detected.
   */
  async applyContradictionPenalty(
    reportId: string,
    verification: SourceVerificationSummary | null
  ): Promise<void> {
    if (!verification || verification.verificationStatus !== "Conflicting Sources") return;

    const reliability = await prisma.reliabilityAssessment.findUnique({
      where: { reportId },
    });
    if (!reliability) return;

    const penalty = 0.12;
    const newScore = roundTo(clamp(reliability.finalScore - penalty, 0, 1));

    await prisma.reliabilityAssessment.update({
      where: { reportId },
      data: { finalScore: newScore },
    });

    const crisis = await crisisRepository.findByReportId(reportId);
    if (crisis) {
      await prisma.crisisTimelineEvent.create({
        data: {
          crisisId: crisis.id,
          reportId,
          eventType: TIMELINE_EVENT_TYPES.VERIFICATION,
          title: "Conflicting sources detected",
          description:
            "Multiple sources report inconsistent details. Reliability adjusted downward pending analyst review.",
          occurredAt: new Date(),
          metadata: {
            verificationStatus: verification.verificationStatus,
            comparedSources: verification.comparedSources,
          },
        },
      });
    }
  }
}

export const intelligenceFusionService = new IntelligenceFusionService();
