import { systemConfigurationService } from "@/services/systemConfigurationService";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { SystemConfigurationView } from "@/components/configuration/SystemConfigurationView";
import { pageContainer } from "@/lib/uiClasses";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const status = await systemConfigurationService.getStatus();

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="System Configuration" showAddReport={false} />
      <div className={`app-page-content ${pageContainer}`}>
        <SystemConfigurationView status={status} />
      </div>
    </div>
  );
}
