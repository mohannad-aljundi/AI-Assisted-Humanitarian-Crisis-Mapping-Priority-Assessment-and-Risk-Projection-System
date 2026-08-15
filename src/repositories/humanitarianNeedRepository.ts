import type {
  HumanitarianNeed,
  NeedInferenceSource,
  NeedSeverity,
} from "@prisma/client";
import {
  canonicalNeedKey,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

export interface HumanitarianNeedInput {
  needType: string;
  severity: NeedSeverity;
  source?: NeedInferenceSource | null;
  evidence?: string | null;
  reasoning?: string | null;
  confidenceScore?: number | null;
}

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

function dedupeInputs(needs: HumanitarianNeedInput[]): HumanitarianNeedInput[] {
  const byKey = new Map<string, HumanitarianNeedInput>();

  for (const need of needs) {
    const canonical = normaliseNeedName(need.needType);
    if (!canonical) continue;

    const key = canonicalNeedKey(canonical);
    const normalized: HumanitarianNeedInput = {
      ...need,
      needType: canonical,
    };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      continue;
    }

    byKey.set(key, {
      ...existing,
      needType: canonical,
      severity: rankSeverity(existing.severity, normalized.severity),
      source: existing.source === "Observed" || normalized.source === "Observed" ? "Observed" : existing.source ?? normalized.source,
      evidence: existing.evidence ?? normalized.evidence,
      reasoning: existing.reasoning ?? normalized.reasoning,
      confidenceScore: Math.max(
        existing.confidenceScore ?? 0,
        normalized.confidenceScore ?? 0
      ) || null,
    });
  }

  return [...byKey.values()];
}

const SEVERITY_RANK: Record<NeedSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function rankSeverity(a: NeedSeverity, b: NeedSeverity): NeedSeverity {
  return (SEVERITY_RANK[a] ?? 0) >= (SEVERITY_RANK[b] ?? 0) ? a : b;
}

export class HumanitarianNeedRepository {
  async findByCrisisId(crisisId: string): Promise<HumanitarianNeed[]> {
    return prisma.humanitarianNeed.findMany({ where: { crisisId } });
  }

  async create(
    input: HumanitarianNeedInput,
    crisisId: string,
    tx?: PrismaTransactionClient
  ): Promise<HumanitarianNeed> {
    const canonical = normaliseNeedName(input.needType);
    return client(tx).humanitarianNeed.create({
      data: {
        needType: canonical,
        severity: input.severity,
        source: input.source ?? undefined,
        evidence: input.evidence ?? undefined,
        reasoning: input.reasoning ?? undefined,
        confidenceScore: input.confidenceScore ?? undefined,
        crisis: { connect: { id: crisisId } },
      },
    });
  }

  async createMany(
    needs: HumanitarianNeedInput[],
    crisisId: string,
    tx?: PrismaTransactionClient
  ): Promise<HumanitarianNeed[]> {
    const deduped = dedupeInputs(needs);
    const results: HumanitarianNeed[] = [];
    for (const need of deduped) {
      const created = await this.create(need, crisisId, tx);
      results.push(created);
    }
    return results;
  }
}

export const humanitarianNeedRepository = new HumanitarianNeedRepository();
