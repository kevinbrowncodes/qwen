import { historyStore } from "@/lib/history-store";
import { errorResponse, guarded } from "@/lib/model-client";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }> };

/** DELETE /api/history/:id: removes a finished entry; a running job must be cancelled first (STORY_007). */
export function DELETE(_request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    const outcome = historyStore().remove(id);
    if (outcome.removed) return Response.json({ id, removed: true });
    if (outcome.refused === "running") return errorResponse({ status: 409, code: "not_finished", message: "Cancel the generation before removing it." });
    return errorResponse({ status: 404, code: "not_found", message: `no history entry ${id}` });
  });
}
