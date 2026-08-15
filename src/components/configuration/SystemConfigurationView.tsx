import { SyncSettingsPanel } from "@/components/configuration/SyncSettingsPanel";
import { SystemHealthPanel } from "@/components/configuration/SystemHealthPanel";
import type { SystemConfigurationStatus } from "@/services/systemConfigurationService";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";

const STATUS_STYLES = {
  operational: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  degraded: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  offline: "border-red-500/30 bg-red-500/10 text-red-300",
  not_configured: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

const STATUS_LABELS = {
  operational: "Operational",
  degraded: "Degraded",
  offline: "Offline",
  not_configured: "Not Configured",
};

interface SystemConfigurationViewProps {
  status: SystemConfigurationStatus;
}

export function SystemConfigurationView({ status }: SystemConfigurationViewProps) {
  return (
    <div className="space-y-6">
      <SyncSettingsPanel />
      <SystemHealthPanel />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="AI Status"
          status={status.ai.status}
          detail={status.ai.message}
          extra={`Model: ${status.ai.model}`}
        />
        <StatusCard
          title="API Status"
          status={status.api.status}
          detail={status.api.message}
          extra={`${status.api.connectedSources}/${status.api.totalSources} sources`}
        />
        <StatusCard
          title="Database Status"
          status={status.database.status}
          detail={status.database.message}
        />
        <StatusCard
          title="Ingestion Status"
          status={status.ingestion.status}
          detail={status.ingestion.message}
          extra={
            status.ingestion.lastSuccessAt
              ? `Last sync: ${new Date(status.ingestion.lastSuccessAt).toLocaleString()}`
              : undefined
          }
        />
      </div>

      <SectionCard
        title="Data Source Status"
        description="Ingestion provider health for dissertation data pipeline"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-3 pr-4">Source</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Uptime</th>
                <th className="pb-3 pr-4">Retrieved</th>
                <th className="pb-3">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {status.dataSources.sources.map((source) => (
                <tr key={source.providerId} className="text-slate-300">
                  <td className="py-3 pr-4 font-medium text-white">{source.name}</td>
                  <td className="py-3 pr-4">
                    {source.status === "available"
                      ? "Active"
                      : source.status.replace(/_/g, " ")}
                  </td>
                  <td className="py-3 pr-4 w-32">
                    <ScoreBar
                      label=""
                      value={source.uptimeScore}
                      tone={source.uptimeScore >= 0.8 ? "low" : "medium"}
                    />
                  </td>
                  <td className="py-3 pr-4">{source.totalFetched}</td>
                  <td className="py-3 text-red-400">{source.failedRequests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Ingestion Fallback Chain"
        description="Automatic failover across all configured operational sources"
      >
        <p className="text-sm text-slate-400">
          Active providers:{" "}
          {status.dataSources.sources.map((source) => source.name).join(" → ")}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Automatic failover is active. If one source fails, the pipeline continues
          with the next source in the chain.
        </p>
      </SectionCard>
    </div>
  );
}

function StatusCard({
  title,
  status,
  detail,
  extra,
}: {
  title: string;
  status: keyof typeof STATUS_STYLES;
  detail: string;
  extra?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">{title}</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
      {extra && <p className="mt-1 text-[11px] text-slate-500">{extra}</p>}
    </div>
  );
}
