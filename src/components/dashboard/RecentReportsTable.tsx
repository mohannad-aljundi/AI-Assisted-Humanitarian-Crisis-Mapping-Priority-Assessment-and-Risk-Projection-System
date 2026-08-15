import Link from "next/link";
import type { DashboardRecentReport } from "@/types";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { StatusBadge } from "@/components/ui/badges";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";
import { tableCell, tableHead } from "@/lib/uiClasses";

interface RecentReportsTableProps {
  reports: DashboardRecentReport[];
}

export function RecentReportsTable({ reports }: RecentReportsTableProps) {
  return (
    <SectionCard
      title="Recent Reports"
      description="Latest analysed humanitarian reports with priority and reliability scores."
    >
      {reports.length === 0 ? (
        <p className="text-sm text-slate-500">No analysed reports yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={`${tableHead} px-4 pb-3`}>Report</th>
                <th className={`${tableHead} px-4 pb-3`}>Crisis / Location</th>
                <th className={`${tableHead} px-4 pb-3`}>Priority</th>
                <th className={`${tableHead} px-4 pb-3`}>Reliability</th>
                <th className={`${tableHead} px-4 pb-3 text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-white/[0.02]">
                  <td className={tableCell}>
                    <div className="font-medium text-white">{report.title}</div>
                    <div className="text-xs text-slate-500">{report.sourceName}</div>
                  </td>
                  <td className={tableCell}>
                    <CrisisTypeBadge crisisType={report.crisisType ?? "Unknown"} />
                    <div className="text-xs text-slate-500">
                      {report.location ? (
                        <LocationWithFlag location={report.location} />
                      ) : (
                        "No location"
                      )}
                    </div>
                  </td>
                  <td className={tableCell}>
                    <StatusBadge level={report.priorityLevel} />
                  </td>
                  <td className={tableCell}>
                    {Math.round(report.reliabilityScore * 100)}%
                  </td>
                  <td className={`${tableCell} text-right`}>
                    <Link
                      href={`/incidents/${report.id}`}
                      className="font-medium text-blue-400 hover:text-blue-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
