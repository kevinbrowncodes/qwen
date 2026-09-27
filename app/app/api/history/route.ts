import { historyStore } from "@/lib/history-store";
import { isJobStatusResponse, isTerminal } from "@/lib/job-api";
import { forward, guarded, readJson } from "@/lib/model-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/history: every generation, newest first. Entries still queued or running are asked of the generation
 * server first, so a generation nobody is watching still reaches its real state (BUG_006).
 */
export function GET(): Promise<Response> {
  return guarded(async () => {
    const store = historyStore();
    const open = store.list().filter((e) => !isTerminal(e.status));
    await Promise.all(
      open.map(async (e) => {
        const response = await forward(`/jobs/${encodeURIComponent(e.id)}`);
        if (response.status !== 200) return;
        const body = await readJson(response);
        if (isJobStatusResponse(body)) store.recordStatus(body);
      }),
    );
    return Response.json({ entries: store.list() });
  });
}
