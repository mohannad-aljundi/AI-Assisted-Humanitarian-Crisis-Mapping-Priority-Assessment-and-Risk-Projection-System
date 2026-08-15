import { MASTER_INCIDENT_INTELLIGENCE_VERSION } from "@/lib/pipelineVersions";
import { masterIncidentIntelligenceRepository } from "@/repositories/masterIncidentIntelligenceRepository";
import { masterIncidentIntelligenceService } from "@/services/masterIncidentIntelligenceService";
import { invalidateCache } from "@/lib/simpleCache";
import { invalidateIncidentCache } from "@/services/incidentCache";

export interface MasterIncidentIntelligenceMigrationResult {
  total: number;
  synthesised: number;
  failed: number;
  skipped: number;
  alreadyComplete: boolean;
  errors: Array<{ masterIncidentId: string; message: string }>;
  durationMs: number;
  propagation?: Awaited<
    ReturnType<typeof import("@/services/masterIncidentPropagationService").masterIncidentPropagationService.propagateAllLinkedReports>
  >;
}

export class MasterIncidentIntelligenceMigrationService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  async getStatus() {
    const pending = await masterIncidentIntelligenceRepository.countPending(
      MASTER_INCIDENT_INTELLIGENCE_VERSION
    );
    const total = pending;
    return {
      pending,
      complete: pending === 0,
      pipelineVersion: MASTER_INCIDENT_INTELLIGENCE_VERSION,
    };
  }

  async runOneTimeMigration(): Promise<MasterIncidentIntelligenceMigrationResult> {
    if (this.running) {
      throw new Error("Master incident intelligence migration already in progress");
    }

    this.running = true;
    const started = Date.now();
    const errors: MasterIncidentIntelligenceMigrationResult["errors"] = [];
    let synthesised = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const masterIds =
        await masterIncidentIntelligenceRepository.listMasterIdsWithoutIntelligence(
          MASTER_INCIDENT_INTELLIGENCE_VERSION
        );

      if (masterIds.length === 0) {
        const { masterIncidentPropagationService } = await import(
          "@/services/masterIncidentPropagationService"
        );
        const propagation = await masterIncidentPropagationService.propagateAllLinkedReports();

        return {
          total: 0,
          synthesised: 0,
          failed: 0,
          skipped: 0,
          alreadyComplete: true,
          errors: [],
          durationMs: Date.now() - started,
          propagation,
        };
      }

      for (const masterIncidentId of masterIds) {
        try {
          const result = await masterIncidentIntelligenceService.synthesize(masterIncidentId, {
            force: true,
          });
          if (result) {
            synthesised += 1;
            console.log(
              `[MasterIncidentIntelligence migration] ${synthesised}/${masterIds.length} — ${masterIncidentId}`
            );
          } else {
            skipped += 1;
          }
        } catch (error) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : "Unknown synthesis error";
          errors.push({ masterIncidentId, message });
          console.error(
            `[MasterIncidentIntelligence migration] failed ${masterIncidentId}:`,
            message
          );
        }
      }

      invalidateCache("dashboard:");
      invalidateCache("map:");
      invalidateIncidentCache();

      const { masterIncidentPropagationService } = await import(
        "@/services/masterIncidentPropagationService"
      );
      const propagation = await masterIncidentPropagationService.propagateAllLinkedReports();
      console.log(
        `[MasterIncidentIntelligence migration] propagation complete: ${propagation.reportsUpdated} reports synced across ${propagation.propagated} clusters`
      );

      return {
        total: masterIds.length,
        synthesised,
        failed,
        skipped,
        alreadyComplete: false,
        errors,
        durationMs: Date.now() - started,
        propagation,
      };
    } finally {
      this.running = false;
    }
  }
}

export const masterIncidentIntelligenceMigrationService =
  new MasterIncidentIntelligenceMigrationService();
