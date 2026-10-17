import { historyStore } from "@/lib/history-store";
import { errorResponse, guarded } from "@/lib/model-client";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }> };

/** DELETE /api/chats/:id: removes every image of a chat (STORY_031); any turn still running must be stopped first. */
export function DELETE(_request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    const outcome = historyStore().removeChat(id);
    if (outcome.refused === "running") return errorResponse({ status: 409, code: "not_finished", message: "Stop the chat's running images before removing it." });
    if (outcome.removed === 0) return errorResponse({ status: 404, code: "not_found", message: `no chat ${id}` });
    return Response.json({ id, removed: outcome.removed });
  });
}
