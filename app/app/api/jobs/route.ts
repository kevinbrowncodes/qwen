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
  /** The add-on named (contract v1.2, STORY_019); "none" and absent are null. */
  readonly lora: string | null;
  /** The chat to join (STORY_031): the app's own field, recorded here and never forwarded. */
  readonly chat: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const loraOf = (v: unknown): string | null => (str(v) === "none" ? null : str(v) || null);

/**
 * After the server accepted the job, it is recorded in history BEFORE the browser hears back (CLAUDE.md §4c). It joins
 * the chat it names when that chat exists, and otherwise starts its own, under its own id (STORY_031).
 */
async function recorded(response: Response, sent: Sent): Promise<Response> {
  if (response.status !== 202) return relayError(response);
  const body = await readJson(response);
  if (!isCreateJobResponse(body)) return badGateway("create did not answer with a job");
  const store = historyStore();
  const { chat, ...fields } = sent;
  // A chat's id, or the id of any of its turns (a page opened at a later turn sends that turn's id before it knows).
  const list = chat === null ? [] : store.list();
  const chatId = list.find((e) => e.chatId === chat)?.chatId ?? list.find((e) => e.id === chat)?.chatId ?? body.id;
  store.add({ id: body.id, chatId, ...fields, createdAt: new Date().toISOString() });
  return Response.json(body, { status: 202 });
}

/** The JSON body without the app's `chat` field (STORY_031), so the job API contract is unchanged. */
function withoutChat(text: string, parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("chat" in parsed)) return text;
  const rest: Record<string, unknown> = { ...parsed };
  delete rest["chat"];
  return JSON.stringify(rest);
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
      const sent: Sent = { prompt: str(fields.get("prompt")).trim(), ratio: str(fields.get("ratio")) || null, model: str(fields.get("model")), referenceImages: 0, lora: loraOf(fields.get("lora")), chat: str(fields.get("chat")) || null };
      return recorded(await forward(path, { method: "POST", headers: { "content-type": "application/json" }, body: withoutChat(text, parsed) }), sent);
    }
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const files = form.getAll("referenceImage").filter((v): v is File => v instanceof File);
      const candidates = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, head: new Uint8Array(await f.slice(0, 16).arrayBuffer()) })));
      const verdict = validateReferences(candidates);
      if (!verdict.ok) return errorResponse(verdict);
      const out = new FormData();
      for (const [key, value] of form.entries()) if (key !== "referenceImage" && key !== "chat" && typeof value === "string") out.set(key, value);
      for (const file of files) out.append("referenceImage", file, file.name);
      const sent: Sent = {
        prompt: str(form.get("prompt")).trim(),
        // An edit's ratio is recorded when it names one (contract v1.1, STORY_017).
        ratio: files.length > 0 && str(form.get("ratio")) === "match" ? null : str(form.get("ratio")) || null,
        model: str(form.get("model")),
        referenceImages: files.length,
        lora: loraOf(form.get("lora")),
        chat: str(form.get("chat")) || null,
      };
      return recorded(await forward(path, { method: "POST", body: out }), sent);
    }
    return errorResponse({ status: 415, code: "unsupported_media_type", message: "Send application/json or multipart/form-data." });
  });
}
