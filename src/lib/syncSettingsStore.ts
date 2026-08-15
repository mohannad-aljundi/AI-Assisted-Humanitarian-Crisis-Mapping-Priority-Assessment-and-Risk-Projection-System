import { promises as fs } from "node:fs";
import path from "node:path";
import type { IngestionProviderId } from "@/types";
import {
  FALLBACK_SOURCE_ORDER,
  getOperationalProviderIds,
} from "@/lib/ingestionSourceRegistry";

export interface SyncSettings {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  maxReportsPerSync: number;
  enabledProviders: IngestionProviderId[];
}

export const SYNC_INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

function defaultEnabledProviders(): IngestionProviderId[] {
  const operational = getOperationalProviderIds();
  return operational.length > 0 ? operational : ["GDELT", "NEWSAPI", "RSS"];
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoSyncEnabled: true,
  syncIntervalMinutes: 15,
  maxReportsPerSync: 10,
  enabledProviders: defaultEnabledProviders(),
};

const SETTINGS_PATH = path.join(process.cwd(), "data", "sync-settings.json");

let memoryCache: SyncSettings | null = null;

function sanitizeSettings(raw: Partial<SyncSettings>): SyncSettings {
  const interval = SYNC_INTERVAL_OPTIONS.includes(
    raw.syncIntervalMinutes as (typeof SYNC_INTERVAL_OPTIONS)[number]
  )
    ? raw.syncIntervalMinutes!
    : DEFAULT_SYNC_SETTINGS.syncIntervalMinutes;

  const max = Math.min(Math.max(raw.maxReportsPerSync ?? 10, 1), 50);

  const operational = new Set(getOperationalProviderIds());
  const enabled =
    Array.isArray(raw.enabledProviders) && raw.enabledProviders.length > 0
      ? raw.enabledProviders.filter(
          (p): p is IngestionProviderId =>
            FALLBACK_SOURCE_ORDER.includes(p as IngestionProviderId) &&
            operational.has(p as IngestionProviderId)
        )
      : defaultEnabledProviders();

  return {
    autoSyncEnabled: raw.autoSyncEnabled ?? DEFAULT_SYNC_SETTINGS.autoSyncEnabled,
    syncIntervalMinutes: interval,
    maxReportsPerSync: max,
    enabledProviders:
      enabled.length > 0 ? enabled : defaultEnabledProviders(),
  };
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  if (memoryCache) return memoryCache;

  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    memoryCache = sanitizeSettings(parsed);
    return memoryCache;
  } catch {
    memoryCache = { ...DEFAULT_SYNC_SETTINGS };
    return memoryCache;
  }
}

export async function saveSyncSettings(
  partial: Partial<SyncSettings>
): Promise<SyncSettings> {
  const current = await loadSyncSettings();
  const next = sanitizeSettings({ ...current, ...partial });
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
  memoryCache = next;
  return next;
}
