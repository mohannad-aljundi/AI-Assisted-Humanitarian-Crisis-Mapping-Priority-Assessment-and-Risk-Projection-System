import { countConnectedSources, getIngestionSourcesStatus } from "@/lib/ingestionSourceRegistry";
import { getAiConfig, isAiConfigured, testAiConnection } from "@/lib/aiResolver";
import { prisma } from "@/lib/prisma";
import { ingestionSyncStateRepository } from "@/repositories/ingestionSyncStateRepository";
import { loadSyncSettings } from "@/lib/syncSettingsStore";
import { sourceHealthService } from "@/services/sourceHealthService";

export type HealthStatus = "healthy" | "warning" | "offline";

export interface ComponentHealth {
  id: string;
  label: string;
  status: HealthStatus;
  message: string;
  checkedAt: string;
}

export interface SystemHealthReport {
  components: ComponentHealth[];
  overall: HealthStatus;
  checkedAt: string;
}

export interface DiagnosticsReport extends SystemHealthReport {
  details: Record<string, unknown>;
  durationMs: number;
}

function deriveOverall(components: ComponentHealth[]): HealthStatus {
  if (components.some((c) => c.status === "offline")) return "offline";
  if (components.some((c) => c.status === "warning")) return "warning";
  return "healthy";
}

function component(
  id: string,
  label: string,
  status: HealthStatus,
  message: string
): ComponentHealth {
  return { id, label, status, message, checkedAt: new Date().toISOString() };
}

export class SystemHealthService {
  async checkDatabase(): Promise<ComponentHealth> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return component("database", "Database", "healthy", "PostgreSQL connection verified");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Database connection failed";
      return component("database", "Database", "offline", message);
    }
  }

  async checkAiProvider(): Promise<ComponentHealth> {
    if (!isAiConfigured()) {
      return component(
        "ai-provider",
        "AI Provider",
        "warning",
        "No AI keys configured — rule-based NLP active"
      );
    }

    const config = getAiConfig();
    try {
      const result = await testAiConnection();
      if (result.success) {
        return component(
          "ai-provider",
          "AI Provider",
          "healthy",
          `${result.provider ?? config.provider} responding (${config.model})`
        );
      }
      return component(
        "ai-provider",
        "AI Provider",
        "warning",
        result.error ?? "AI connection test failed"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI check failed";
      return component("ai-provider", "AI Provider", "offline", message);
    }
  }

  async checkNewsApis(): Promise<ComponentHealth> {
    const sources = getIngestionSourcesStatus();
    const connected = countConnectedSources();
    const total = sources.length;

    if (connected === 0) {
      return component(
        "news-apis",
        "News APIs",
        "offline",
        "No ingestion APIs configured"
      );
    }

    const stats = await sourceHealthService.getStatistics();
    const recentFailures = stats.sources.filter((s) => s.failedRequests > 0).length;

    if (connected < total / 2) {
      return component(
        "news-apis",
        "News APIs",
        "warning",
        `${connected}/${total} sources available — some APIs missing keys`
      );
    }

    if (recentFailures > 0) {
      return component(
        "news-apis",
        "News APIs",
        "warning",
        `${connected}/${total} sources online — ${recentFailures} with recent failures`
      );
    }

    return component(
      "news-apis",
      "News APIs",
      "healthy",
      `${connected}/${total} ingestion sources operational`
    );
  }

  async checkGeocoder(): Promise<ComponentHealth> {
    const geoNamesUser = process.env.GEONAMES_USERNAME?.trim();

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", "Geneva");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "AI-Assisted-Humanitarian-Crisis-Mapping/1.0 (health-check)",
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        return component(
          "geocoder",
          "Geocoder",
          geoNamesUser ? "warning" : "offline",
          `Nominatim unreachable (${response.status})${geoNamesUser ? " — GeoNames fallback available" : ""}`
        );
      }

      const payload = (await response.json()) as unknown[];
      if (!Array.isArray(payload) || payload.length === 0) {
        return component(
          "geocoder",
          "Geocoder",
          "warning",
          "Geocoder responded but returned no results"
        );
      }

      return component(
        "geocoder",
        "Geocoder",
        "healthy",
        geoNamesUser
          ? "Nominatim + GeoNames fallback available"
          : "Nominatim geocoder available"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Geocoder check failed";
      return component(
        "geocoder",
        "Geocoder",
        geoNamesUser ? "warning" : "offline",
        geoNamesUser ? `${message} — GeoNames fallback configured` : message
      );
    }
  }

  async checkScheduler(): Promise<ComponentHealth> {
    try {
      const [settings, syncState] = await Promise.all([
        loadSyncSettings(),
        ingestionSyncStateRepository.get(),
      ]);

      if (!settings.autoSyncEnabled) {
        return component(
          "scheduler",
          "Scheduler",
          "warning",
          "Auto sync disabled in settings"
        );
      }

      if (syncState.isRunning) {
        return component("scheduler", "Scheduler", "healthy", "Sync currently running");
      }

      if (syncState.lastError) {
        return component(
          "scheduler",
          "Scheduler",
          "warning",
          `Last sync error: ${syncState.lastError.slice(0, 120)}`
        );
      }

      const nextAt = syncState.nextScheduledSyncAt;
      if (nextAt) {
        const delayMin = Math.round(
          (new Date(nextAt).getTime() - Date.now()) / 60_000
        );
        return component(
          "scheduler",
          "Scheduler",
          "healthy",
          delayMin > 0
            ? `Next sync in ~${delayMin} min (every ${settings.syncIntervalMinutes} min)`
            : `Sync due now (interval ${settings.syncIntervalMinutes} min)`
        );
      }

      return component(
        "scheduler",
        "Scheduler",
        "healthy",
        `Auto sync enabled every ${settings.syncIntervalMinutes} min`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduler check failed";
      return component("scheduler", "Scheduler", "offline", message);
    }
  }

  async checkTimelineService(): Promise<ComponentHealth> {
    try {
      const [eventCount, orphanRows] = await Promise.all([
        prisma.crisisTimelineEvent.count(),
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint AS count
          FROM "CrisisTimelineEvent" e
          WHERE e."reportId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "Report" r WHERE r.id = e."reportId"
            )
        `,
      ]);

      const orphanCount = Number(orphanRows[0]?.count ?? 0);

      if (orphanCount > 0) {
        return component(
          "timeline-service",
          "Timeline Service",
          "warning",
          `${orphanCount} timeline events reference missing reports`
        );
      }

      return component(
        "timeline-service",
        "Timeline Service",
        "healthy",
        `${eventCount} timeline events indexed`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Timeline service check failed";
      return component("timeline-service", "Timeline Service", "offline", message);
    }
  }

  async getHealth(): Promise<SystemHealthReport> {
    const components = await Promise.all([
      this.checkDatabase(),
      this.checkAiProvider(),
      this.checkNewsApis(),
      this.checkGeocoder(),
      this.checkScheduler(),
      this.checkTimelineService(),
    ]);

    return {
      components,
      overall: deriveOverall(components),
      checkedAt: new Date().toISOString(),
    };
  }

  async runDiagnostics(): Promise<DiagnosticsReport> {
    const started = Date.now();
    const [health, dataSources, syncState, settings] = await Promise.all([
      this.getHealth(),
      sourceHealthService.getStatistics(),
      ingestionSyncStateRepository.get(),
      loadSyncSettings(),
    ]);

    return {
      ...health,
      durationMs: Date.now() - started,
      details: {
        syncSettings: settings,
        syncState: {
          isRunning: syncState.isRunning,
          lastError: syncState.lastError,
          lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt,
          nextScheduledSyncAt: syncState.nextScheduledSyncAt,
          lastSavedCount: syncState.lastSavedCount,
        },
        ingestionSources: dataSources.sources.map((s) => ({
          name: s.name,
          status: s.status,
          failedRequests: s.failedRequests,
          totalFetched: s.totalFetched,
          lastError: s.lastError,
        })),
      },
    };
  }
}

export const systemHealthService = new SystemHealthService();
