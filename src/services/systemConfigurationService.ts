import { countConnectedSources, getIngestionSourcesStatus } from "@/lib/ingestionSourceRegistry";
import { getAiConfig, isAiConfigured } from "@/lib/aiResolver";
import { prisma } from "@/lib/prisma";
import { sourceHealthService } from "@/services/sourceHealthService";
import type { SourceStatisticsDashboard } from "@/types";

export type ComponentStatus = "operational" | "degraded" | "offline" | "not_configured";

export interface SystemConfigurationStatus {
  ai: {
    status: ComponentStatus;
    model: string;
    message: string;
  };
  api: {
    status: ComponentStatus;
    connectedSources: number;
    totalSources: number;
    message: string;
  };
  dataSources: SourceStatisticsDashboard;
  database: {
    status: ComponentStatus;
    message: string;
  };
  ingestion: {
    status: ComponentStatus;
    totalFetched: number;
    failedRequests: number;
    lastSuccessAt: string | null;
    message: string;
  };
}

export class SystemConfigurationService {
  async getStatus(): Promise<SystemConfigurationStatus> {
    const [dataSources, dbOk] = await Promise.all([
      sourceHealthService.getStatistics(),
      this.checkDatabase(),
    ]);

    const aiConfigured = isAiConfigured();
    const aiConfig = getAiConfig();
    const sources = getIngestionSourcesStatus();
    const connected = countConnectedSources();
    const totalFailed = dataSources.sources.reduce(
      (sum, s) => sum + s.failedRequests,
      0
    );
    const totalFetched = dataSources.sources.reduce(
      (sum, s) => sum + s.totalFetched,
      0
    );
    const lastSuccess = dataSources.sources
      .map((s) => s.lastSuccessAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    const apiStatus: ComponentStatus =
      connected === 0
        ? "not_configured"
        : connected < sources.length / 2
          ? "degraded"
          : "operational";

    const ingestionStatus: ComponentStatus =
      totalFetched === 0 && totalFailed > 0
        ? "offline"
        : totalFailed > 0
          ? "degraded"
          : "operational";

    return {
      ai: {
        status: aiConfigured ? "operational" : "not_configured",
        model: aiConfig.model,
        message: aiConfigured
          ? `AI analysis pipeline enabled (${aiConfig.provider})`
          : "AI provider not configured — rule-based NLP active",
      },
      api: {
        status: apiStatus,
        connectedSources: connected,
        totalSources: sources.length,
        message: `${connected} of ${sources.length} ingestion APIs available`,
      },
      dataSources,
      database: {
        status: dbOk ? "operational" : "offline",
        message: dbOk
          ? "PostgreSQL connection verified"
          : "Database connection failed",
      },
      ingestion: {
        status: ingestionStatus,
        totalFetched,
        failedRequests: totalFailed,
        lastSuccessAt: lastSuccess,
        message:
          totalFetched > 0
            ? `${totalFetched} articles ingested across all sources`
            : "No ingestion runs recorded yet",
      },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

export const systemConfigurationService = new SystemConfigurationService();
