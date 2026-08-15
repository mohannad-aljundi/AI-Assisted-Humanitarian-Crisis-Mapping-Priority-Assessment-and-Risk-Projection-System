"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PROVIDER_LABELS } from "@/lib/ingestionSourceRegistry";
import { formatSyncWarning, groupWarnings } from "@/lib/syncWarningFormatter";
import { SyncWarningsList } from "@/components/configuration/SyncWarningsList";
import { SectionCard } from "@/components/ui/SectionCard";
import { inputDark, selectDark, btnGhost } from "@/lib/uiClasses";
import type {
  IngestionProviderId,
  IngestionSourceInfo,
  SyncStatusSnapshot,
} from "@/types";

interface SyncSettings {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  maxReportsPerSync: number;
  enabledProviders: IngestionProviderId[];
}

const INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

export function SyncSettingsPanel() {
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<IngestionSourceInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolvingLocations, setResolvingLocations] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [settingsRes, sourcesRes] = await Promise.all([
      fetch("/api/ingestion/sync/settings"),
      fetch("/api/ingestion/sources"),
    ]);

    if (settingsRes.ok) {
      const payload = (await settingsRes.json()) as {
        settings: SyncSettings;
        status: SyncStatusSnapshot;
      };
      setSettings(payload.settings);
      setStatus(payload.status);
    }

    if (sourcesRes.ok) {
      const payload = (await sourcesRes.json()) as {
        sources?: IngestionSourceInfo[];
      };
      setSourceStatuses(payload.sources ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const warnings = status?.warnings ?? [];
  const groupedWarnings = useMemo(
    () =>
      groupWarnings(
        warnings.map((warning) => {
          const sourceMatch = /^([A-Z_]+):\s*/.exec(warning);
          const source = sourceMatch?.[1];
          const text = source ? warning.slice(sourceMatch[0].length) : warning;
          return formatSyncWarning(text, source ? { source } : undefined);
        })
      ),
    [warnings]
  );

  async function save(partial: Partial<SyncSettings>) {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/ingestion/sync/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...partial }),
      });

      const payload = (await response.json()) as {
        settings?: SyncSettings;
        status?: SyncStatusSnapshot;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Failed to save settings");
        return;
      }

      if (payload.settings) setSettings(payload.settings);
      if (payload.status) setStatus(payload.status);
      setMessage("Settings saved");
    } catch {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function toggleProvider(id: IngestionProviderId) {
    if (!settings) return;
    const enabled = new Set(settings.enabledProviders);
    if (enabled.has(id)) {
      if (enabled.size <= 1) return;
      enabled.delete(id);
    } else {
      enabled.add(id);
    }
    const next = {
      ...settings,
      enabledProviders: sourceStatuses
        .map((source) => source.id)
        .filter((p) => enabled.has(p)),
    };
    setSettings(next);
    void save(next);
  }

  async function resolvePendingLocations() {
    setResolvingLocations(true);
    setMessage(null);
    try {
      const response = await fetch("/api/locations/resolve-pending", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        resolved?: number;
        stillPending?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Failed to resolve pending locations");
        return;
      }
      setMessage(
        `Resolved ${payload.resolved ?? 0} location(s); ${payload.stillPending ?? 0} still pending`
      );
    } catch {
      setMessage("Failed to resolve pending locations");
    } finally {
      setResolvingLocations(false);
    }
  }

  if (!settings) {
    return (
      <SectionCard title="Monitoring Sync Settings" description="">
        <p className="text-sm text-slate-500">Loading sync settings…</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Monitoring Sync Settings"
      description="Configure automatic humanitarian intelligence synchronization. Warnings from failed sources appear here only."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Auto Sync</p>
              <p className="text-xs text-slate-500">
                Fetch reports automatically in the background
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoSyncEnabled}
              disabled={saving}
              onClick={() => void save({ autoSyncEnabled: !settings.autoSyncEnabled })}
              className={`relative h-7 w-12 rounded-full transition ${
                settings.autoSyncEnabled ? "bg-emerald-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                  settings.autoSyncEnabled ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </label>

          <div>
            <label className="mb-1 block text-xs text-slate-500">Sync Interval</label>
            <select
              className={selectDark}
              value={settings.syncIntervalMinutes}
              disabled={saving}
              onChange={(e) =>
                void save({ syncIntervalMinutes: Number(e.target.value) })
              }
            >
              {INTERVAL_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Maximum reports per sync
            </label>
            <input
              type="number"
              min={1}
              max={50}
              className={inputDark}
              value={settings.maxReportsPerSync}
              disabled={saving}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxReportsPerSync: Number(e.target.value),
                })
              }
              onBlur={() => void save({ maxReportsPerSync: settings.maxReportsPerSync })}
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-white">Source Selection</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {sourceStatuses.map((source) => {
              const enabled = settings.enabledProviders.includes(source.id);
              return (
                <label
                  key={source.id}
                  className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={saving || (enabled && settings.enabledProviders.length <= 1)}
                    onChange={() => toggleProvider(source.id)}
                    className="mt-1 rounded border-white/20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      {PROVIDER_LABELS[source.id] ?? source.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {source.statusMessage}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btnGhost}
          disabled={resolvingLocations}
          onClick={() => void resolvePendingLocations()}
        >
          {resolvingLocations ? "Resolving…" : "Resolve Pending Locations"}
        </button>
        <p className="text-xs text-slate-500">
          Re-runs geocoding for saved reports with pending locations (also runs after each sync).
        </p>
      </div>

      {message && (
        <p className="mt-4 text-sm text-emerald-300">{message}</p>
      )}

      <SyncWarningsList warnings={groupedWarnings} />
    </SectionCard>
  );
}
