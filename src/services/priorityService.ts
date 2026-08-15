import type { PriorityLevel } from "@prisma/client";
import type { NLPAnalysisResult, PriorityResult } from "@/types";
import { priorityAssessmentEngine } from "@/services/priorityAssessmentEngine";

/** @deprecated Use priorityAssessmentEngine directly */
export class PriorityService {
  assess(
    nlpResult: NLPAnalysisResult,
    reliabilityFinalScore: number,
    content: string
  ): PriorityResult {
    return priorityAssessmentEngine.assess(nlpResult, content, reliabilityFinalScore);
  }
}

export const priorityService = new PriorityService();
