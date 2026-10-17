/**
 * Creating a generation from the browser (STORY_012): JSON without references, multipart with them (files in order,
 * no ratio: an edit takes its size from the reference). The answer is the job's id, or the server's message.
 */
import { MATCH_REFERENCE, NO_LORA, type ComposerState } from "./composer-state";
import { isApiError, isCreateJobResponse } from "./job-api";

export interface GenerationRequest {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  /** The add-on (STORY_019), or null for none. */
  readonly lora: string | null;
  readonly references: readonly File[];
  /** "Same seed again" (STORY_024) sends this generation's seed; absent, the server draws one (Regenerate). */
  readonly seed?: number;
  /** The chat this image joins (STORY_031); absent from the home page, where the send starts a chat. */
  readonly chat?: string;
}

export type SubmitOutcome = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string };

export function requestFrom(state: ComposerState): GenerationRequest {
  const references = state.references.map((r) => r.file);
  // An edit sends a ratio only when one was chosen (contract v1.1, STORY_017); "match" sends none.
  const ratio = references.length === 0 ? state.ratio : state.editRatio === MATCH_REFERENCE ? null : state.editRatio;
  return { prompt: state.text.trim(), ratio, model: state.model, lora: state.lora === NO_LORA ? null : state.lora, references };
}

export function buildBody(req: GenerationRequest): { readonly body: BodyInit; readonly headers: Record<string, string> } {
  if (req.references.length === 0) {
    // No add-on sends no `lora` field (contract v1.2, STORY_019).
    const json = { prompt: req.prompt, ratio: req.ratio, model: req.model, ...(req.lora === null ? {} : { lora: req.lora }), ...(req.seed === undefined ? {} : { seed: req.seed }), ...(req.chat === undefined ? {} : { chat: req.chat }) };
    return { body: JSON.stringify(json), headers: { "content-type": "application/json" } };
  }
  const form = new FormData();
  form.set("prompt", req.prompt);
  form.set("model", req.model);
  if (req.ratio !== null) form.set("ratio", req.ratio);
  if (req.lora !== null) form.set("lora", req.lora);
  if (req.seed !== undefined) form.set("seed", String(req.seed));
  if (req.chat !== undefined) form.set("chat", req.chat);
  for (const file of req.references) form.append("referenceImage", file, file.name);
  return { body: form, headers: {} };
}

export const SUBMIT_FAILED = "The generation could not be started.";

export async function submitGeneration(req: GenerationRequest, fetchImpl: typeof fetch = fetch): Promise<SubmitOutcome> {
  const { body, headers } = buildBody(req);
  let response: Response;
  try {
    response = await fetchImpl("/api/jobs", { method: "POST", body, headers });
  } catch {
    return { ok: false, message: SUBMIT_FAILED };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.status === 202 && isCreateJobResponse(payload)) return { ok: true, id: payload.id };
  if (isApiError(payload)) return { ok: false, message: payload.error.message };
  return { ok: false, message: SUBMIT_FAILED };
}

/** What a send of several images got (STORY_025): the jobs created, in order, and the refusal that stopped it. */
export interface BatchOutcome {
  readonly ids: readonly string[];
  /** The server's message when a create was refused; the rest were not sent. Null when every one was created. */
  readonly message: string | null;
}

/**
 * Creates `count` jobs from one request, one after another, each answered before the next is sent, so the server
 * sees them in order and a full queue stops the rest rather than racing them. No seed is added: the server draws one
 * for each, so the images differ. A count of 1 is exactly one `submitGeneration`. A send that names no chat starts one
 * with its first image, and the rest of the send joins it (STORY_031).
 */
export async function submitBatch(req: GenerationRequest, count: number, submitOne: (req: GenerationRequest) => Promise<SubmitOutcome> = submitGeneration): Promise<BatchOutcome> {
  const ids: string[] = [];
  let next = req;
  for (let i = 0; i < count; i++) {
    const outcome = await submitOne(next);
    if (!outcome.ok) return { ids, message: outcome.message };
    ids.push(outcome.id);
    if (next.chat === undefined) next = { ...next, chat: outcome.id };
  }
  return { ids, message: null };
}

/** The line under the composer for a refused send (STORY_025): a count stopped part-way says how many went. */
export function batchMessage(outcome: BatchOutcome, count: number): string | null {
  if (outcome.message === null) return null;
  return outcome.ids.length === 0 ? outcome.message : `Queued ${String(outcome.ids.length)} of ${String(count)}. ${outcome.message}`;
}
