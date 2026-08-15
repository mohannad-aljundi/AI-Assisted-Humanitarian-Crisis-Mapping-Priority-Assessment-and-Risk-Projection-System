import { NextResponse } from "next/server";
import { getOperationalProviderIds } from "@/lib/ingestionSourceRegistry";
import { SYNC_INTERVAL_OPTIONS } from "@/lib/syncSettingsStore";
import { syncMonitoringService } from "@/services/syncMonitoringService";
import type { IngestionProviderId } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await syncMonitoringService.getSettings();
  const status = await syncMonitoringService.getStatusAsync();
  return NextResponse.json({ settings, status });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const partial: {
      autoSyncEnabled?: boolean;
      syncIntervalMinutes?: number;
      maxReportsPerSync?: number;
      enabledProviders?: IngestionProviderId[];
    } = {};

    if (typeof body.autoSyncEnabled === "boolean") {
      partial.autoSyncEnabled = body.autoSyncEnabled;
    }

    if (typeof body.syncIntervalMinutes === "number") {
      if (
        !SYNC_INTERVAL_OPTIONS.includes(
          body.syncIntervalMinutes as (typeof SYNC_INTERVAL_OPTIONS)[number]
        )
      ) {
        return NextResponse.json(
          { error: "Invalid sync interval. Use 5, 15, 30, or 60 minutes." },
          { status: 400 }
        );
      }
      partial.syncIntervalMinutes = body.syncIntervalMinutes;
    }

    if (typeof body.maxReportsPerSync === "number") {
      partial.maxReportsPerSync = Math.min(
        Math.max(body.maxReportsPerSync, 1),
        50
      );
    }

    if (Array.isArray(body.enabledProviders)) {
      const allowed = new Set(getOperationalProviderIds());
      const providers = body.enabledProviders.filter(
        (p): p is IngestionProviderId =>
          typeof p === "string" && allowed.has(p as IngestionProviderId)
      );
      if (providers.length > 0) {
        partial.enabledProviders = providers;
      }
    }

    const { settings, status } =
      await syncMonitoringService.updateSettings(partial);

    return NextResponse.json({ settings, status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update settings",
      },
      { status: 500 }
    );
  }
}
