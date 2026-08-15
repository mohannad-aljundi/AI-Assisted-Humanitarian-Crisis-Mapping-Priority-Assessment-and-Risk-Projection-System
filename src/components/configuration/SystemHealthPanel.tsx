"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { btnPrimary, btnGhost } from "@/lib/uiClasses";
import type { ComponentHealth, DiagnosticsReport, SystemHealthReport } from "@/services/systemHealthService";

const HEALTH_STYLES = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  offline: "border-red-500/30 bg-red-500/10 text-red-300",
} as const;

const HEALTH_LABELS = {
  healthy: "Healthy",
  warning: "Warning",
  offline: "Offline",
} as const;

export function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [correlating, setCorrelating] = useState(false);
  const [migratingIntelligence, setMigratingIntelligence] = useState(false);
  const [propagatingIntelligence, setPropagatingIntelligence] = useState(false);
  const [repairingCoordinates, setRepairingCoordinates] = useState(false);
  const [openAiUpgrading, setOpenAiUpgrading] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState<{
    complete: boolean;
    upgraded: number;
    total: number;
    pending: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshUpgradeStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/system/reanalyze/openai-upgrade", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      setUpgradeStatus({
        complete: Boolean(payload.complete),
        upgraded: Number(payload.upgraded ?? 0),
        total: Number(payload.total ?? 0),
        pending: Number(payload.pending ?? 0),
      });
    } catch {
      // Non-blocking status fetch.
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/health", { cache: "no-store" });
      if (!response.ok) throw new Error("Health check failed");
      const payload = (await response.json()) as SystemHealthReport;
      setHealth(payload);
      await refreshUpgradeStatus();
    } catch {
      setMessage("Failed to refresh health status");
    } finally {
      setLoading(false);
    }
  }, [refreshUpgradeStatus]);

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/diagnostics", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Diagnostics failed");
      const payload = (await response.json()) as DiagnosticsReport;
      setHealth(payload);
      setDiagnostics(payload);
      setMessage(`Diagnostics completed in ${payload.durationMs}ms`);
    } catch {
      setMessage("Diagnostics run failed");
    } finally {
      setDiagnosticsRunning(false);
    }
  }, []);

  const runReanalysis = useCallback(async () => {
    if (!confirm("Re-run complete AI analysis for ALL stored reports? This may take several minutes.")) {
      return;
    }
    setReanalyzing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/reanalyze", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Reanalysis failed");
      setMessage(
        `Reanalysis complete: ${payload.succeeded}/${payload.total} succeeded in ${Math.round(payload.durationMs / 1000)}s` +
          (payload.failed > 0 ? ` (${payload.failed} failed)` : "")
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reanalysis failed");
    } finally {
      setReanalyzing(false);
    }
  }, []);

  const runOpenAiUpgradeReanalysis = useCallback(async () => {
    if (
      !confirm(
        "Re-analyze stored reports once with OpenAI GPT-5 mini for improved risk projection reasoning? Reports already upgraded will be skipped."
      )
    ) {
      return;
    }
    setOpenAiUpgrading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/reanalyze/openai-upgrade", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "OpenAI upgrade reanalysis failed");
      }
      await refreshUpgradeStatus();
      setMessage(
        `OpenAI upgrade reanalysis complete: ${payload.upgraded} upgraded, ${payload.skipped} skipped` +
          (payload.failed > 0 ? `, ${payload.failed} failed` : "") +
          ` in ${Math.round(payload.durationMs / 1000)}s`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "OpenAI upgrade reanalysis failed"
      );
    } finally {
      setOpenAiUpgrading(false);
    }
  }, [refreshUpgradeStatus]);

  const runChleBackfill = useCallback(async () => {
    if (
      !confirm(
        "Sync LearningCase snapshots from existing analysis? This does not call AI or re-run analysis, and is safe to run multiple times."
      )
    ) {
      return;
    }
    setBackfilling(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/chle/backfill", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "CHLE backfill failed");
      setMessage(
        `Learning cases backfilled: ${payload.upserted}/${payload.total} upserted` +
          ` (${payload.created} created, ${payload.updated} updated)` +
          (payload.skipped > 0 ? `, ${payload.skipped} skipped` : "") +
          (payload.failed > 0 ? `, ${payload.failed} failed` : "") +
          ` in ${Math.round(payload.durationMs / 1000)}s`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CHLE backfill failed");
    } finally {
      setBackfilling(false);
    }
  }, []);

  const runCorrelationBackfill = useCallback(async () => {
    if (
      !confirm(
        "Group existing analysed reports into master incidents? This uses stored analysis only and does not call AI."
      )
    ) {
      return;
    }
    setCorrelating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/correlation/backfill", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Correlation backfill failed");
      }
      setMessage(
        `Incident correlation complete: ${payload.correlated}/${payload.total} reports clustered into ${payload.clustersCreated} master incidents` +
          (payload.failed > 0 ? ` (${payload.failed} failed)` : "")
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Correlation backfill failed"
      );
    } finally {
      setCorrelating(false);
    }
  }, []);

  const runMasterIntelligenceMigration = useCallback(async () => {
    if (
      !confirm(
        "Run ONE-TIME master incident intelligence migration? This calls OpenAI once per master incident cluster and stores unified assessments permanently."
      )
    ) {
      return;
    }
    setMigratingIntelligence(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/master-intelligence/migrate", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Master intelligence migration failed");
      }
      if (payload.alreadyComplete) {
        const synced = payload.propagation?.reportsUpdated;
        setMessage(
          synced != null
            ? `Master incident intelligence already complete. Synced ${synced} linked reports to cluster operational truth.`
            : "Master incident intelligence migration already complete."
        );
        return;
      }
      const synced = payload.propagation?.reportsUpdated;
      setMessage(
        `Master incident intelligence: ${payload.synthesised}/${payload.total} clusters synthesised` +
          (payload.failed > 0 ? ` (${payload.failed} failed)` : "") +
          (synced != null ? ` — ${synced} linked reports synced` : "") +
          ` in ${Math.round(payload.durationMs / 1000)}s`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Master intelligence migration failed"
      );
    } finally {
      setMigratingIntelligence(false);
    }
  }, []);

  const runMasterIntelligencePropagation = useCallback(async () => {
    if (
      !confirm(
        "Run ONE-TIME sync so all linked reports inherit master incident operational intelligence (priority, verification, confidence, risk)?"
      )
    ) {
      return;
    }
    setPropagatingIntelligence(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/master-intelligence/propagate", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Master intelligence propagation failed");
      }
      setMessage(
        `Operational sync complete: ${payload.reportsUpdated} reports updated across ${payload.propagated}/${payload.total} master incidents` +
          (payload.errors?.length > 0 ? ` (${payload.errors.length} errors)` : "")
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Master intelligence propagation failed"
      );
    } finally {
      setPropagatingIntelligence(false);
    }
  }, []);

  const runCrisisCoordinateRepair = useCallback(async () => {
    if (
      !confirm(
        "Repair missing crisis map coordinates from report locations? This geocodes unresolved locations once and saves them to the database."
      )
    ) {
      return;
    }
    setRepairingCoordinates(true);
    setMessage(null);
    try {
      const response = await fetch("/api/system/crisis-coordinates/repair", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Crisis coordinate repair failed");
      }
      setMessage(
        `Crisis coordinates repaired: ${payload.repaired}/${payload.total}` +
          (payload.skipped > 0 ? `, ${payload.skipped} skipped` : "") +
          (payload.failed > 0 ? `, ${payload.failed} failed` : "") +
          ` in ${Math.round(payload.durationMs / 1000)}s`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Crisis coordinate repair failed"
      );
    } finally {
      setRepairingCoordinates(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  return (
    <SectionCard
      title="System Health"
      description="Live status for core platform services"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(health?.components ?? []).map((component) => (
          <HealthCard key={component.id} component={component} />
        ))}
        {!health && (
          <p className="col-span-full text-sm text-slate-500">Loading health checks…</p>
        )}
      </div>

      {health?.checkedAt && (
        <p className="mt-3 text-[11px] text-slate-500">
          Last checked: {new Date(health.checkedAt).toLocaleString()}
          {health.overall !== "healthy" && (
            <span className="ml-2 text-amber-300">
              Overall: {HEALTH_LABELS[health.overall]}
            </span>
          )}
        </p>
      )}

      {diagnostics && (
        <details className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">
            Diagnostics summary
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto text-[10px] text-slate-400">
            {JSON.stringify(diagnostics.details, null, 2)}
          </pre>
        </details>
      )}

      {upgradeStatus && !upgradeStatus.complete && (
        <p className="mt-3 text-xs text-amber-300">
          OpenAI upgrade pending: {upgradeStatus.pending}/{upgradeStatus.total} reports
        </p>
      )}

      {message && <p className="mt-3 text-sm text-slate-400">{message}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || openAiUpgrading}
          onClick={() => void refreshHealth()}
        >
          {loading ? "Refreshing…" : "Refresh Health"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || openAiUpgrading}
          onClick={() => void runDiagnostics()}
        >
          {diagnosticsRunning ? "Running diagnostics…" : "Run Diagnostics"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || correlating || openAiUpgrading}
          onClick={() => void runChleBackfill()}
        >
          {backfilling ? "Backfilling learning cases…" : "Backfill Learning Cases"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || correlating || migratingIntelligence || openAiUpgrading}
          onClick={() => void runCorrelationBackfill()}
        >
          {correlating ? "Correlating incidents…" : "Backfill Incident Correlation"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={
            loading ||
            diagnosticsRunning ||
            reanalyzing ||
            backfilling ||
            correlating ||
            migratingIntelligence ||
            propagatingIntelligence ||
            repairingCoordinates ||
            openAiUpgrading
          }
          onClick={() => void runCrisisCoordinateRepair()}
        >
          {repairingCoordinates
            ? "Repairing crisis coordinates…"
            : "Repair Missing Crisis Coordinates"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || correlating || migratingIntelligence || propagatingIntelligence || openAiUpgrading}
          onClick={() => void runMasterIntelligenceMigration()}
        >
          {migratingIntelligence
            ? "Synthesising master intelligence…"
            : "Migrate Master Incident Intelligence"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || correlating || migratingIntelligence || propagatingIntelligence || openAiUpgrading}
          onClick={() => void runMasterIntelligencePropagation()}
        >
          {propagatingIntelligence
            ? "Syncing linked reports…"
            : "Sync Master Intelligence to Reports"}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={
            loading ||
            diagnosticsRunning ||
            reanalyzing ||
            backfilling ||
            correlating ||
            migratingIntelligence ||
            propagatingIntelligence ||
            openAiUpgrading ||
            upgradeStatus?.complete === true
          }
          onClick={() => void runOpenAiUpgradeReanalysis()}
        >
          {upgradeStatus?.complete
            ? "OpenAI Upgrade Complete"
            : openAiUpgrading
              ? "Running OpenAI upgrade reanalysis…"
              : "Run OpenAI Upgrade Reanalysis"}
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={loading || diagnosticsRunning || reanalyzing || backfilling || correlating || migratingIntelligence || propagatingIntelligence || openAiUpgrading}
          onClick={() => void runReanalysis()}
        >
          {reanalyzing ? "Re-analyzing all data…" : "Re-analyze All Data"}
        </button>
      </div>
    </SectionCard>
  );
}

function HealthCard({ component }: { component: ComponentHealth }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">{component.label}</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${HEALTH_STYLES[component.status]}`}
        >
          {HEALTH_LABELS[component.status]}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">{component.message}</p>
    </div>
  );
}
