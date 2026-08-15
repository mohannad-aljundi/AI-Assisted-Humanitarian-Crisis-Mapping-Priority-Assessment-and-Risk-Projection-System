import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface AnalysisReportPageProps {
  params: Promise<{ reportId: string }>;
}

/** Canonical incident intelligence lives at /incidents/[reportId]. */
export default async function AnalysisReportPage({ params }: AnalysisReportPageProps) {
  const { reportId } = await params;
  redirect(`/incidents/${reportId}`);
}
