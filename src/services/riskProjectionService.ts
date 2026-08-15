import type { RiskLevel, RiskTrend } from "@prisma/client";
import type { NLPAnalysisResult, PriorityResult, RiskProjectionResult } from "@/types";
import { riskProjectionEngine } from "@/services/riskProjectionEngine";

/** @deprecated Use riskProjectionEngine directly */
export class RiskProjectionService {
  project(
    nlpResult: NLPAnalysisResult,
    priorityResult: PriorityResult,
    content: string
  ): RiskProjectionResult {
    return riskProjectionEngine.project(nlpResult, priorityResult, content);
  }
}

export const riskProjectionService = new RiskProjectionService();
