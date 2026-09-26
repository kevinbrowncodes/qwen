/**
 * The stub generation server (STORY_006): implements docs/contracts/job-api.md v1 exactly, with outcomes chosen by
 * name (src/scripts.ts) and test hooks under /__stub/. Zero runtime dependencies. Everything is in memory; the result
 * is always the committed fixture PNG (CLAUDE.md §6 rule 10: no test may depend on a generated image).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_BODY_BYTES, MAX_FILE_BYTES, MultipartError, boundaryOf, parseMultipart, type MultipartFile } from "./multipart.ts";
import { pngSize } from "./png.ts";
import { DEFAULT_SCRIPT, isScriptName, isTerminal, rejectsUpload, stepFor, type JobError, type JobStatus, type ScriptName } from "./scripts.ts";

export const VERSION = "1.0.0";

/**
 * Sizes are placeholders: the original Qwen-Image's recommended size per ratio, until EPIC_004 reads Qwen-Image-2.1's.
 * The order is the reference's (docs/recon/2026-09-26/interactions.md).
 */
export const CAPABILITIES = {
  models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }],
  ratios: [
    { id: "1:1", width: 1328, height: 1328 },
    { id: "2:3", width: 1056, height: 1584 },
    { id: "3:2", width: 1584, height: 1056 },
    { id: "3:4", width: 1140, height: 1472 },
    { id: "4:3", width: 1472, height: 1140 },
    { id: "16:9", width: 1664, height: 928 },
    { id: "9:16", width: 928, height: 1664 },
  ],
  defaultRatio: "16:9",
  prompt: { maxChars: 4000 },
  referenceImages: { max: 10, maxBytes: MAX_FILE_BYTES, types: ["image/png", "image/jpeg", "image/webp"] },
} as const;

const MAX_SEED = 4294967295;

export interface JobRequest {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly seed: number;
  readonly referenceImages: number;
}
export interface ReceivedUpload {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
}
interface Job {
  readonly id: string;
  readonly script: ScriptName;
  readonly request: JobRequest;
  readonly uploads: readonly ReceivedUpload[];
  readonly createdAt: string;
  updatedAt: string;
  pollCount: number;
  cancelledAt?: { readonly progress: number };
}
interface JobState {
  readonly status: JobStatus;
  readonly progress: number;
  readonly error?: JobError;
}

export interface StubOptions {
  /** Directory holding result.png. */
  readonly fixturesDir?: string;
  /** When set, every contract call must carry `Authorization: Bearer <apiKey>`. Hooks never need it. */
  readonly apiKey?: string;
}
export interface StubServer {
  readonly server: Server;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
  reset(): void;
  /** While busy, POST /jobs answers 503 busy. */
  setBusy(busy: boolean): void;
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

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURES_DIR = path.resolve(here, "..", "fixtures");

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "too_large", `request body exceeds ${String(MAX_BODY_BYTES)} bytes`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What the contract says about the request's fields and uploads; throws HttpError naming the field. */
export function validateRequest(fields: Record<string, unknown>, uploads: readonly MultipartFile[]): JobRequest {
  const prompt = fields["prompt"];
  if (typeof prompt !== "string" || prompt.trim().length === 0) throw new HttpError(400, "validation", "prompt is required", "prompt");
  const { maxChars } = CAPABILITIES.prompt;
  if (prompt.trim().length > maxChars) throw new HttpError(400, "validation", `prompt is longer than ${String(maxChars)} characters`, "prompt");

  const refs = uploads.filter((u) => u.field === "referenceImage");
  if (refs.length > CAPABILITIES.referenceImages.max) {
    throw new HttpError(400, "validation", `at most ${String(CAPABILITIES.referenceImages.max)} reference images`, "referenceImage");
  }
  for (const ref of refs) {
    if (!(CAPABILITIES.referenceImages.types as readonly string[]).includes(ref.contentType)) {
      throw new HttpError(415, "unsupported_media_type", `${ref.filename} is ${ref.contentType}; send PNG, JPEG or WebP`, "referenceImage");
    }
  }

  let ratio: string | null = null;
  if (refs.length === 0) {
    const raw = fields["ratio"];
    if (typeof raw !== "string" || raw === "") throw new HttpError(400, "validation", "ratio is required", "ratio");
    if (!CAPABILITIES.ratios.some((r) => r.id === raw)) throw new HttpError(400, "unsupported_option", `ratio ${raw} is not offered by this server`, "ratio");
    ratio = raw;
  }

  const rawModel = fields["model"];
  const model = rawModel === undefined || rawModel === "" ? CAPABILITIES.models[0].id : rawModel;
  if (typeof model !== "string") throw new HttpError(400, "validation", "model must be a string", "model");
  if (!CAPABILITIES.models.some((m) => m.id === model)) throw new HttpError(400, "unsupported_option", `model ${model} is not offered by this server`, "model");

  const rawSeed = fields["seed"];
  let seed: number;
  if (rawSeed === undefined || rawSeed === "" || rawSeed === null) {
    seed = Math.floor(Math.random() * (MAX_SEED + 1));
  } else {
    const n = typeof rawSeed === "string" ? Number(rawSeed) : rawSeed;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_SEED) {
      throw new HttpError(400, "validation", `seed must be an integer from 0 to ${String(MAX_SEED)}`, "seed");
    }
    seed = n;
  }
  return { prompt: prompt.trim(), ratio, model, seed, referenceImages: refs.length };
}

export function createStubServer(options: StubOptions = {}): StubServer {
  const fixturesDir = options.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  const result = readFileSync(path.join(fixturesDir, "result.png"));
  const resultSize = pngSize(result);
  const jobs = new Map<string, Job>();
  let busy = false;

  const stateOf = (job: Job): JobState => {
    const step = stepFor(job.script, job.pollCount);
    if (job.cancelledAt) return { status: "cancelled", progress: job.cancelledAt.progress };
    return step;
  };

  const jobOr404 = (id: string): Job => {
    const job = jobs.get(id);
    if (!job) throw new HttpError(404, "not_found", `no job ${id}`);
    return job;
  };

  const statusBody = (job: Job, state: JobState): Record<string, unknown> => ({
    id: job.id,
    status: state.status,
    progress: state.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    request: job.request,
    ...(state.error ? { error: state.error } : {}),
    ...(state.status === "done"
      ? { result: { url: `/jobs/${job.id}/result`, mimeType: "image/png", width: resultSize.width, height: resultSize.height, sizeBytes: result.length } }
      : {}),
  });

  const createJob = async (req: IncomingMessage, url: URL): Promise<Job> => {
    const contentType = req.headers["content-type"];
    const body = await readBody(req);
    let fields: Record<string, unknown>;
    let uploads: readonly MultipartFile[] = [];
    if (contentType?.startsWith("application/json") === true) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        throw new HttpError(400, "validation", "body is not valid JSON");
      }
      if (!isRecord(parsed)) throw new HttpError(400, "validation", "body must be a JSON object");
      fields = parsed;
    } else {
      const boundary = boundaryOf(contentType);
      if (boundary === undefined) throw new HttpError(415, "unsupported_media_type", "send application/json or multipart/form-data");
      try {
        const parsed = parseMultipart(body, boundary);
        fields = parsed.fields;
        uploads = parsed.files;
      } catch (error) {
        if (error instanceof MultipartError) {
          throw error.code === "too_large" ? new HttpError(413, "too_large", error.message, "referenceImage") : new HttpError(400, "validation", error.message);
        }
        throw error;
      }
    }
    const scriptName = req.headers["x-stub-script"]?.toString() ?? url.searchParams.get("script") ?? DEFAULT_SCRIPT;
    if (!isScriptName(scriptName)) throw new HttpError(400, "validation", `unknown stub script ${scriptName}`, "script");
    const request = validateRequest(fields, uploads);
    if (request.referenceImages > 0 && rejectsUpload(scriptName)) {
      throw new HttpError(400, "validation", "reference images are refused (scripted rejects-upload)", "referenceImage");
    }
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      script: scriptName,
      request,
      uploads: uploads
        .filter((u) => u.field === "referenceImage")
        .map((u) => ({ filename: u.filename, contentType: u.contentType, size: u.data.length, sha256: createHash("sha256").update(u.data).digest("hex") })),
      createdAt: now,
      updatedAt: now,
      pollCount: 0,
    };
    jobs.set(job.id, job);
    return job;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://stub");
    const method = req.method ?? "GET";
    const p = url.pathname;
    const hook = p.startsWith("/__stub/");

    if (!hook && options.apiKey !== undefined) {
      const header = req.headers.authorization ?? "";
      if (header !== `Bearer ${options.apiKey}`) throw new HttpError(401, "unauthorized", "missing or wrong bearer token");
    }

    let m: RegExpExecArray | null;
    if (method === "GET" && p === "/health") {
      sendJson(res, 200, { ok: true, server: "stub", version: VERSION });
      return;
    }
    if (method === "GET" && p === "/capabilities") {
      sendJson(res, 200, CAPABILITIES);
      return;
    }
    if (method === "POST" && p === "/jobs") {
      if (busy) throw new HttpError(503, "busy", "The generation server is busy (scripted); try again later.");
      const job = await createJob(req, url);
      sendJson(res, 202, { id: job.id, status: "queued", progress: 0 });
      return;
    }
    if ((m = /^\/jobs\/([^/]+)$/.exec(p)) && m[1] !== undefined) {
      const job = jobOr404(m[1]);
      if (method === "GET") {
        if (!job.cancelledAt && !isTerminal(stateOf(job).status)) job.pollCount += 1;
        job.updatedAt = new Date().toISOString();
        sendJson(res, 200, statusBody(job, stateOf(job)));
        return;
      }
      if (method === "DELETE") {
        const state = stateOf(job);
        if (isTerminal(state.status)) throw new HttpError(409, "already_terminal", `job ${job.id} is already ${state.status}`);
        job.cancelledAt = { progress: state.progress };
        job.updatedAt = new Date().toISOString();
        sendJson(res, 202, { id: job.id, status: "cancelled", progress: state.progress });
        return;
      }
    }
    if (method === "GET" && (m = /^\/jobs\/([^/]+)\/result$/.exec(p)) && m[1] !== undefined) {
      const job = jobOr404(m[1]);
      const state = stateOf(job);
      if (state.status !== "done") throw new HttpError(409, "not_done", `job ${job.id} is ${state.status}`);
      res.writeHead(200, { "content-type": "image/png", "content-length": result.length });
      res.end(result);
      return;
    }
    if (method === "POST" && p === "/__stub/reset") {
      jobs.clear();
      busy = false;
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && p === "/__stub/busy") {
      const raw = (await readBody(req)).toString("utf8");
      let parsed: unknown = {};
      try {
        parsed = raw === "" ? {} : JSON.parse(raw);
      } catch {
        throw new HttpError(400, "validation", "body is not valid JSON");
      }
      busy = isRecord(parsed) && parsed["busy"] === true;
      sendJson(res, 200, { busy });
      return;
    }
    if (method === "GET" && p === "/__stub/jobs") {
      sendJson(res, 200, { jobs: [...jobs.values()].map((job) => ({ id: job.id, script: job.script, ...stateOf(job) })) });
      return;
    }
    if (method === "GET" && (m = /^\/__stub\/jobs\/([^/]+)\/received$/.exec(p)) && m[1] !== undefined) {
      const job = jobOr404(m[1]);
      sendJson(res, 200, { id: job.id, script: job.script, request: job.request, uploads: job.uploads });
      return;
    }
    throw new HttpError(404, "not_found", `no route ${method} ${p}`);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message, ...(error.field === undefined ? {} : { field: error.field }) } });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: { code: "internal", message } });
    });
  });

  return {
    server,
    listen: (port = 0, host = "127.0.0.1") =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const address = server.address();
          resolve(typeof address === "object" && address !== null ? (address satisfies AddressInfo).port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    reset: () => {
      jobs.clear();
      busy = false;
    },
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}
