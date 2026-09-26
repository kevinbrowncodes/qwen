import { historyStore } from "@/lib/history-store";
import { guarded } from "@/lib/model-client";

export const dynamic = "force-dynamic";

/** GET /api/history: every generation, newest first, with its last known status (STORY_007). */
export function GET(): Promise<Response> {
  return guarded(() => Promise.resolve(Response.json({ entries: historyStore().list() })));
}
