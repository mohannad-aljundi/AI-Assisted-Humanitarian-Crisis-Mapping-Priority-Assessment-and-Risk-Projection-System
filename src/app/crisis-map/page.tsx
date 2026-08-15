import { CrisisMapView } from "@/components/crisis-map/CrisisMapView";
import { alertService } from "@/services/alertService";
import { mapService } from "@/services/mapService";

export const dynamic = "force-dynamic";

export default async function CrisisMapPage() {
  const [data, alerts] = await Promise.all([
    mapService.getMapPageData(),
    alertService.getRecentAlerts(8),
  ]);

  return <CrisisMapView data={data} alerts={alerts} />;
}
