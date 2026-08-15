import { cache } from "react";
import { getCached, setCached, invalidateCache } from "@/lib/simpleCache";
import type { IncidentIntelligenceData } from "@/services/incidentService";

const INCIDENT_CACHE_TTL_MS = 5 * 60 * 1000;

export function incidentCacheKey(reportId: string): string {
  return `incident:${reportId}`;
}

export function getCachedIncident(reportId: string): IncidentIntelligenceData | null {
  return getCached<IncidentIntelligenceData>(incidentCacheKey(reportId));
}

export function setCachedIncident(
  reportId: string,
  data: IncidentIntelligenceData
): void {
  setCached(incidentCacheKey(reportId), data, INCIDENT_CACHE_TTL_MS);
}

export function invalidateIncidentCache(reportId?: string): void {
  if (reportId) {
    invalidateCache(incidentCacheKey(reportId));
    return;
  }
  invalidateCache("incident:");
}

/** Dedupes incident fetches within a single server request. */
export const getRequestCachedIncident = cache(
  async (reportId: string): Promise<IncidentIntelligenceData | null> => {
    const { incidentService } = await import("@/services/incidentService");
    return incidentService.fetchIncidentByReportId(reportId);
  }
);

/** Dedupes read-only analysis reads within a single server request. */
export const getRequestCachedAnalysisView = cache(
  async (reportId: string) => {
    const { analysisService } = await import("@/services/analysisService");
    return analysisService.getByReportIdForView(reportId);
  }
);

/** Dedupes analysis reads within a single server request. */
export const getRequestCachedAnalysis = cache(
  async (reportId: string) => {
    const { analysisService } = await import("@/services/analysisService");
    return analysisService.getByReportId(reportId);
  }
);
