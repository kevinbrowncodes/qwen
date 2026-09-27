/**
 * Contract v1 request validation for the model server (STORY_015). The rules are the stub's; both suites run the
 * shared vectors in docs/contracts/validation-vectors.json so they cannot drift.
 */
import type { MultipartFile } from "./multipart.ts";
import type { JobRequest } from "./jobs.ts";

export interface Capabilities {
  readonly models: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly ratios: ReadonlyArray<{ readonly id: string; readonly width: number; readonly height: number }>;
  readonly defaultRatio: string;
  readonly prompt: { readonly maxChars: number };
  readonly referenceImages: { readonly max: number; readonly maxBytes: number; readonly types: readonly string[] };
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const MAX_SEED = 4294967295;

export function validateRequest(caps: Capabilities, fields: Record<string, unknown>, uploads: readonly MultipartFile[], drawSeed: () => number): JobRequest {
  const prompt = fields["prompt"];
  if (typeof prompt !== "string" || prompt.trim().length === 0) throw new HttpError(400, "validation", "prompt is required", "prompt");
  if (prompt.trim().length > caps.prompt.maxChars) throw new HttpError(400, "validation", `prompt is longer than ${String(caps.prompt.maxChars)} characters`, "prompt");

  const refs = uploads.filter((u) => u.field === "referenceImage");
  if (refs.length > caps.referenceImages.max) throw new HttpError(400, "validation", `at most ${String(caps.referenceImages.max)} reference images`, "referenceImage");
  for (const ref of refs) {
    if (!caps.referenceImages.types.includes(ref.contentType)) throw new HttpError(415, "unsupported_media_type", `${ref.filename} is ${ref.contentType}; send PNG, JPEG or WebP`, "referenceImage");
  }

  let ratio: string | null = null;
  const raw = fields["ratio"];
  if (refs.length === 0) {
    if (typeof raw !== "string" || raw === "") throw new HttpError(400, "validation", "ratio is required", "ratio");
    if (!caps.ratios.some((r) => r.id === raw)) throw new HttpError(400, "unsupported_option", `ratio ${raw} is not offered by this server`, "ratio");
    ratio = raw;
  } else if (raw !== undefined && raw !== null && raw !== "" && raw !== "match") {
    // Contract v1.1 (STORY_017): an edit may name a ratio; absent or "match" keeps the reference's shape.
    if (typeof raw !== "string" || !caps.ratios.some((r) => r.id === raw)) throw new HttpError(400, "unsupported_option", typeof raw === "string" ? `ratio ${raw} is not offered by this server` : "ratio must be a string", "ratio");
    ratio = raw;
  }

  const rawModel = fields["model"];
  const first = caps.models[0]?.id ?? "";
  const model = rawModel === undefined || rawModel === "" ? first : rawModel;
  if (typeof model !== "string") throw new HttpError(400, "validation", "model must be a string", "model");
  if (!caps.models.some((m) => m.id === model)) throw new HttpError(400, "unsupported_option", `model ${model} is not offered by this server`, "model");

  const rawSeed = fields["seed"];
  let seed: number;
  if (rawSeed === undefined || rawSeed === "" || rawSeed === null) seed = drawSeed();
  else {
    const n = typeof rawSeed === "string" ? Number(rawSeed) : rawSeed;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_SEED) throw new HttpError(400, "validation", `seed must be an integer from 0 to ${String(MAX_SEED)}`, "seed");
    seed = n;
  }
  return { prompt: prompt.trim(), ratio, model, seed, referenceImages: refs.length };
}
