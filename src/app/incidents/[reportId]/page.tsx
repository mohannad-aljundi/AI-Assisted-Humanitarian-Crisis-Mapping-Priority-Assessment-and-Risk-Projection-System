import { notFound } from "next/navigation";
import { incidentService } from "@/services/incidentService";
import { IncidentIntelligenceView } from "@/components/incidents/IncidentIntelligenceView";
import { createPerfTrace, endPerfTrace, perfStageTimed } from "@/lib/perfTrace";
import { getAiConfig, getAiProviderSummary } from "@/lib/aiResolver";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ reportId: string }>;
}

export default async function IncidentPage({ params }: PageProps) {
  const { reportId } = await params;
  const traceId = createPerfTrace("/incidents/[reportId]", reportId);

  const data = await perfStageTimed(traceId, "server:getIncidentByReportId", () =>
    incidentService.getIncidentByReportId(reportId)
  );

  if (!data) {
    endPerfTrace(traceId, "/incidents/[reportId]", { found: false });
    notFound();
  }

  endPerfTrace(traceId, "/incidents/[reportId]", {
    found: true,
    timelineDeferred: data.timeline.length === 0,
  });

  const config = getAiConfig();
  const summary = getAiProviderSummary();

  return (
    <IncidentIntelligenceView
      data={data}
      aiRuntime={{
        openAiConfigured: Boolean(config.openAiApiKey),
        primaryProvider: summary.activeProvider,
        model: summary.activeModel,
      }}
    />
  );
}
