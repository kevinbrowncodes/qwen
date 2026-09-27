import { historyStore } from "@/lib/history-store";
import { isCreateJobResponse } from "@/lib/job-api";
import { badGateway, errorResponse, forward, guarded, readJson, relayError, scriptQuery } from "@/lib/model-client";
import { validateReferences } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

interface Sent {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly referenceImages: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** After the server accepted the job, it is recorded in history BEFORE the browser hears back (CLAUDE.md §4c). */
async function recorded(response: Response, sent: Sent): Promise<Response> {
  if (response.status !== 202) return relayError(response);
  const body = await readJson(response);
  if (!isCreateJobResponse(body)) return badGateway("create did not answer with a job");
  historyStore().add({ id: body.id, ...sent, createdAt: new Date().toISOString() });
  return Response.json(body, { status: 202 });
}

/** POST /api/jobs: create a job, JSON or multipart with up to ten `referenceImage` files, checked before forwarding. */
export function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const contentType = request.headers.get("content-type") ?? "";
    const path = `/jobs${scriptQuery(request)}`;

    if (contentType.startsWith("application/json")) {
      const text = await request.text();
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        // the server validates and answers 400
      }
      const fields = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? new Map(Object.entries(parsed)) : new Map<string, unknown>();
      const sent: Sent = { prompt: str(fields.get("prompt")).trim(), ratio: str(fields.get("ratio")) || null, model: str(fields.get("model")), referenceImages: 0 };
      return recorded(await forward(path, { method: "POST", headers: { "content-type": "application/json" }, body: text }), sent);
    }
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const files = form.getAll("referenceImage").filter((v): v is File => v instanceof File);
      const candidates = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, head: new Uint8Array(await f.slice(0, 16).arrayBuffer()) })));
      const verdict = validateReferences(candidates);
      if (!verdict.ok) return errorResponse(verdict);
      const out = new FormData();
      for (const [key, value] of form.entries()) if (key !== "referenceImage" && typeof value === "string") out.set(key, value);
      for (const file of files) out.append("referenceImage", file, file.name);
      const sent: Sent = {
        prompt: str(form.get("prompt")).trim(),
        // An edit's ratio is recorded when it names one (contract v1.1, STORY_017).
        ratio: files.length > 0 && str(form.get("ratio")) === "match" ? null : str(form.get("ratio")) || null,
        model: str(form.get("model")),
        referenceImages: files.length,
      };
      return recorded(await forward(path, { method: "POST", body: out }), sent);
    }
    return errorResponse({ status: 415, code: "unsupported_media_type", message: "Send application/json or multipart/form-data." });
  });
}
