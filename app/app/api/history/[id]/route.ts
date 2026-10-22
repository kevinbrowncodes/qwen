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

/** The star a PATCH asks for, or undefined for a body that is not `{ "favorite": boolean }`. */
function askedFavorite(body: unknown): boolean | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !("favorite" in body)) return undefined;
  return typeof body.favorite === "boolean" ? body.favorite : undefined;
}

/** PATCH /api/history/:id with `{ "favorite": true | false }`: stars or unstars a finished image (STORY_039). */
export function PATCH(request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const favorite = askedFavorite(body);
    if (favorite === undefined) return errorResponse({ status: 400, code: "invalid_request", message: 'Send { "favorite": true } or { "favorite": false }.', field: "favorite" });
    const result = historyStore().setFavorite(id, favorite);
    if (result.outcome === "set") return Response.json(result.entry);
    if (result.outcome === "not-finished") return errorResponse({ status: 409, code: "not_finished", message: "Only a finished image can be starred." });
    return errorResponse({ status: 404, code: "not_found", message: `no history entry ${id}` });
  });
}
