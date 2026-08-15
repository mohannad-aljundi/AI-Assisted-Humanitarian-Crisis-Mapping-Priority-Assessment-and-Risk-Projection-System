import type { DashboardAffectedLocation } from "@/types";
import { formatLocationDisplay } from "@/lib/locationDisplay";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";
import { tableCell, tableHead } from "@/lib/uiClasses";

interface AffectedLocationsTableProps {
  locations: DashboardAffectedLocation[];
}

export function AffectedLocationsTable({ locations }: AffectedLocationsTableProps) {
  return (
    <SectionCard
      title="Top Affected Locations"
      description="Locations with highest cumulative affected population."
    >
      {locations.length === 0 ? (
        <p className="text-sm text-slate-500">No location data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={`${tableHead} pb-3 pr-4`}>Location</th>
                <th className={`${tableHead} pb-3 pr-4`}>Incidents</th>
                <th className={`${tableHead} pb-3`}>Affected Population</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {locations.map((location) => (
                <tr key={location.name}>
                  <td className={`${tableCell} font-medium text-white`}>
                    <LocationWithFlag location={formatLocationDisplay(location.name)} />
                  </td>
                  <td className={tableCell}>{location.incidentCount}</td>
                  <td className={tableCell}>
                    {location.totalAffectedPopulation.toLocaleString()}
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
