import {
  subscribeAnalysisEvents,
  type AnalysisLiveEvent,
} from "@/lib/analysisEventBus";
import { analysisLiveService } from "@/services/analysisLiveService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeSse(event: AnalysisLiveEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalysisLiveEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          // Client disconnected
        }
      };

      try {
        const [queue, recent] = await Promise.all([
          analysisLiveService.getQueueSnapshot(),
          analysisLiveService.getRecentlyCompleted(10),
        ]);

        send({
          type: "queue_snapshot",
          queue,
          at: new Date().toISOString(),
        });

        for (const report of [...recent].reverse()) {
          send({
            type: "analysis_completed",
            report,
            queue,
            at: report.completedAt,
          });
        }
      } catch (error) {
        console.warn(
          "[AnalysisSSE] Initial snapshot failed:",
          error instanceof Error ? error.message : error
        );
      }

      unsubscribe = subscribeAnalysisEvents(send);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // ignore
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
