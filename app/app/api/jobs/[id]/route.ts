import { historyStore } from "@/lib/history-store";
import { isJobStatusResponse } from "@/lib/job-api";
import { badGateway, forward, guarded, readJson, relayError } from "@/lib/model-client";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }> };

/** GET /api/jobs/:id: status, with the result URL pointing at our own route; every answer is folded into history. */
export function GET(_request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    const response = await forward(`/jobs/${encodeURIComponent(id)}`);
    if (response.status !== 200) return relayError(response);
    const body = await readJson(response);
    if (!isJobStatusResponse(body)) return badGateway("status is not a job");
    const answer = body.result ? { ...body, result: { ...body.result, url: `/api/jobs/${encodeURIComponent(id)}/result` } } : body;
    historyStore().recordStatus(answer);
    return Response.json(answer);
  });
}

/** DELETE /api/jobs/:id: cancel; history is marked cancelled from the 202 on. */
export function DELETE(_request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    const response = await forward(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.status !== 202) return relayError(response);
    const body = await readJson(response);
    const progress = typeof body === "object" && body !== null && "progress" in body && typeof body.progress === "number" ? body.progress : 0;
    historyStore().cancelled(id, progress);
    return Response.json({ id, status: "cancelled", progress }, { status: 202 });
  });
}
