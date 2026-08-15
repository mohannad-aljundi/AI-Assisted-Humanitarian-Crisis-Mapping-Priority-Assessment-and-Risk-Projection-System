import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { NLPAnalysisResult } from "@/types";

const TITLE_SIMILARITY_THRESHOLD = 0.78;
const DAY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function normaliseLocation(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(",")
    .pop()
    ?.trim() ?? name.toLowerCase();
}

export function buildContentFingerprint(title: string, content: string): string {
  const normalised = `${title}\n${content}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

export interface DuplicateMatch {
  reportId: string;
  crisisId?: string | null;
  reason: string;
  similarity: number;
}

export class IncidentDeduplicationService {
  async findDuplicate(params: {
    title: string;
    content: string;
    reportDate: Date;
    nlp: NLPAnalysisResult;
    articleUrl?: string;
    externalArticleId?: string;
    contentFingerprint?: string;
  }): Promise<DuplicateMatch | null> {
    const fingerprint =
      params.contentFingerprint ?? buildContentFingerprint(params.title, params.content);

    if (params.externalArticleId) {
      const byExternal = await prisma.report.findFirst({
        where: { externalArticleId: params.externalArticleId },
        select: { id: true },
      });
      if (byExternal) {
        const crisis = await prisma.crisis.findFirst({
          where: { reportId: byExternal.id },
          select: { id: true },
        });
        return {
          reportId: byExternal.id,
          crisisId: crisis?.id ?? null,
          reason: "Same external article identifier",
          similarity: 1,
        };
      }
    }

    if (params.articleUrl) {
      const byUrl = await prisma.report.findFirst({
        where: { articleUrl: params.articleUrl },
        select: { id: true },
      });
      if (byUrl) {
        const crisis = await prisma.crisis.findFirst({
          where: { reportId: byUrl.id },
          select: { id: true },
        });
        return {
          reportId: byUrl.id,
          crisisId: crisis?.id ?? null,
          reason: "Same article URL",
          similarity: 1,
        };
      }
    }

    const byFingerprint = await prisma.report.findFirst({
      where: { contentFingerprint: fingerprint },
      select: { id: true },
    });
    if (byFingerprint) {
      const crisis = await prisma.crisis.findFirst({
        where: { reportId: byFingerprint.id },
        select: { id: true },
      });
      return {
        reportId: byFingerprint.id,
        crisisId: crisis?.id ?? null,
        reason: "Identical content fingerprint",
        similarity: 1,
      };
    }

    const location =
      params.nlp.locations[0]?.name ?? params.nlp.crisisType ?? "";
    const country = normaliseLocation(location);
    const crisisType = (params.nlp.crisisType ?? "unknown").toLowerCase();
    const windowStart = new Date(params.reportDate.getTime() - DAY_WINDOW_MS);
    const windowEnd = new Date(params.reportDate.getTime() + DAY_WINDOW_MS);

    const candidates = await prisma.report.findMany({
      where: {
        reportDate: { gte: windowStart, lte: windowEnd },
        crisis: { isNot: null },
      },
      include: {
        crisis: true,
        extractedEntities: true,
      },
      take: 200,
      orderBy: { reportDate: "desc" },
    });

    const titleTokens = tokenize(params.title);

    for (const candidate of candidates) {
      const candidateCrisis = candidate.crisis?.crisisType?.toLowerCase() ?? "";
      if (candidateCrisis && crisisType && candidateCrisis !== crisisType) continue;

      const candidateLocation = candidate.extractedEntities.find(
        (entity) => entity.entityType === "LOCATION" || entity.entityType === "GEOGRAPHIC"
      )?.value;
      const candidateCountry = normaliseLocation(candidateLocation ?? "");

      if (country && candidateCountry) {
        const locationMatch =
          country === candidateCountry ||
          country.includes(candidateCountry) ||
          candidateCountry.includes(country);
        if (!locationMatch) continue;
      }

      const similarity = jaccardSimilarity(titleTokens, tokenize(candidate.title));
      if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
        const crisis = await prisma.crisis.findFirst({
          where: { reportId: candidate.id },
          select: { id: true },
        });
        return {
          reportId: candidate.id,
          crisisId: crisis?.id ?? candidate.crisis?.id ?? null,
          reason: `Similar crisis report (${Math.round(similarity * 100)}% title overlap, same region/type)`,
          similarity,
        };
      }
    }

    return null;
  }
}

export const incidentDeduplicationService = new IncidentDeduplicationService();
