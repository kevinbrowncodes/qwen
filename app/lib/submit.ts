/**
 * Creating a generation from the browser (STORY_012): JSON without references, multipart with them (files in order,
 * no ratio: an edit takes its size from the reference). The answer is the job's id, or the server's message.
 */
import { MATCH_REFERENCE, type ComposerState } from "./composer-state";
import { isApiError, isCreateJobResponse } from "./job-api";

export interface GenerationRequest {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly references: readonly File[];
}

export type SubmitOutcome = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string };

export function requestFrom(state: ComposerState): GenerationRequest {
  const references = state.references.map((r) => r.file);
  // An edit sends a ratio only when one was chosen (contract v1.1, STORY_017); "match" sends none.
  const ratio = references.length === 0 ? state.ratio : state.editRatio === MATCH_REFERENCE ? null : state.editRatio;
  return { prompt: state.text.trim(), ratio, model: state.model, references };
}

export function buildBody(req: GenerationRequest): { readonly body: BodyInit; readonly headers: Record<string, string> } {
  if (req.references.length === 0) {
    return { body: JSON.stringify({ prompt: req.prompt, ratio: req.ratio, model: req.model }), headers: { "content-type": "application/json" } };
  }
  const form = new FormData();
  form.set("prompt", req.prompt);
  form.set("model", req.model);
  if (req.ratio !== null) form.set("ratio", req.ratio);
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
