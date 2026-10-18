import { TITLE_MAX } from "@/lib/history";
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

/** The name a rename asks for: trimmed text (blank clears it, as null does), or undefined for a body that is not one. */
function askedTitle(body: unknown): string | null | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !("title" in body)) return undefined;
  const { title } = body;
  if (title === null) return null;
  if (typeof title !== "string") return undefined;
  const trimmed = title.trim();
  return trimmed === "" ? null : trimmed;
}

/** PATCH /api/chats/:id with `{ title }`: names a chat, or clears its name with null or blank text (STORY_033). */
export function PATCH(request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const title = askedTitle(body);
    if (title === undefined) return errorResponse({ status: 400, code: "invalid_request", message: "Send { \"title\": string | null }.", field: "title" });
    if (title !== null && title.length > TITLE_MAX) return errorResponse({ status: 400, code: "invalid_request", message: `A chat's name is at most ${String(TITLE_MAX)} characters.`, field: "title" });
    if (historyStore().renameChat(id, title) === 0) return errorResponse({ status: 404, code: "not_found", message: `no chat ${id}` });
    return Response.json({ id, title });
  });
}
