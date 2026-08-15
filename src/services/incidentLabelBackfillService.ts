import { prisma } from "@/lib/prisma";
import { generateRuleBasedIncidentLabel } from "@/lib/incidentLabelGenerator";
import { incidentLabelService } from "@/services/incidentLabelService";

export interface IncidentLabelBackfillResult {
  total: number;
  updated: number;
  failed: number;
  errors: string[];
}

export class IncidentLabelBackfillService {
  async backfillMissingLabels(options?: {
    limit?: number;
    useAi?: boolean;
  }): Promise<IncidentLabelBackfillResult> {
    const limit = options?.limit ?? 500;
    const reports = await prisma.report.findMany({
      where: {
        incidentLabel: null,
        priorityAssessment: { isNot: null },
      },
      include: {
        priorityAssessment: true,
        extractedEntities: {
          where: {
            entityType: {
              in: ["CRISIS_TYPE", "LOCATION"],
            },
          },
        },
        crisis: {
          include: {
            humanitarianNeeds: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const result: IncidentLabelBackfillResult = {
      total: reports.length,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const report of reports) {
      try {
        const crisisType =
          report.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")
            ?.value ?? report.crisis?.crisisType ?? null;
        const location =
          report.extractedEntities.find((entity) => entity.entityType === "LOCATION")
            ?.value ?? null;

        const labelInput = {
          headline: report.title,
          content: report.content,
          crisisType,
          location,
          country: report.segmentCountry,
          humanitarianNeeds: report.crisis?.humanitarianNeeds.map((need) => need.needType) ?? [],
          priorityLevel: report.priorityAssessment?.priorityLevel ?? null,
        };

        const label = options?.useAi
          ? await incidentLabelService.generateLabel(labelInput)
          : generateRuleBasedIncidentLabel(labelInput);

        await prisma.report.update({
          where: { id: report.id },
          data: { incidentLabel: label },
        });
        result.updated += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          `${report.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }
}

export const incidentLabelBackfillService = new IncidentLabelBackfillService();
