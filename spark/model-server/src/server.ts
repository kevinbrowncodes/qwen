/**
 * The model server (STORY_015): docs/contracts/job-api.md v1.3 in front of Qwen-Image-2.1. This process owns the
 * contract (HTTP, validation, the queue, cancel, results on disk); the Python worker (spark/model/worker_mlx.py) owns
 * the pipeline. One job runs at a time. Zero runtime dependencies, like the stub.
 *
 * A watchdog (STORY_026, BUG_011) keeps a silent worker from holding the queue: a stop it has not answered within
 * `cancelGraceMs`, or a running job it has said nothing about for `silenceMs`, gets the worker restarted.
 */
import { randomInt, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { CAPABILITIES, STEPS } from "./capabilities.ts";
import { BusyError, isTerminal, Jobs, type JobRecord, type JobRequest } from "./jobs.ts";
import { MAX_BODY_BYTES, MultipartError, boundaryOf, parseMultipart, type MultipartFile } from "./multipart.ts";
import { loraInfo, withTrigger, type Lora } from "./loras.ts";
import { parametersFor } from "./parameters.ts";
import { progressFor, type FromWorker } from "./protocol.ts";
import { HttpError, validateRequest, type Capabilities } from "./validation.ts";
import { Worker, type ExitReason } from "./worker.ts";

export const VERSION = "1.0.0";
export const WORKER_STOPPED = "The model worker stopped unexpectedly.";
export const WORKER_SILENT = "The model worker stopped responding during this image and was restarted.";
const EXTENSIONS: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export interface ModelServerOptions {
  /** Results, uploads and the job index live here. */
  readonly outputDir: string;
  /** The worker process, e.g. ["uv", "run", …, "python", "spark/model/worker_mlx.py"] (spark/mac/start.sh). */
  readonly workerCommand: readonly string[];
  readonly apiKey?: string;
  readonly maxQueued?: number;
  readonly restartDelayMs?: number;
  readonly log?: (line: string) => void;
  /** The add-ons fetched onto disk (loras.ts); offered once the worker reports them loaded (STORY_019). */
  readonly loras?: readonly Lora[];
  /** The watchdog (STORY_026): how long a stop may go unanswered, how long a running job may go unheard, how often
   * to look, and how long a SIGTERMed worker gets before SIGKILL. Defaults 60 s, 5 min, 5 s, 10 s. */
  readonly cancelGraceMs?: number;
  readonly silenceMs?: number;
  readonly watchdogTickMs?: number;
  readonly killAfterMs?: number;
}

export interface ModelServer {
  readonly server: Server;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
  readonly jobs: Jobs;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createModelServer(options: ModelServerOptions): ModelServer {
  const log = options.log ?? ((line: string) => {
    console.log(line);
  });
  const outputDir = path.resolve(options.outputDir);
  const uploadsDir = path.join(outputDir, "uploads");
  const indexFile = path.join(outputDir, "jobs.json");
  mkdirSync(uploadsDir, { recursive: true });
  const jobs = existsSync(indexFile) ? Jobs.fromIndex(readFileSync(indexFile, "utf8"), options.maxQueued, undefined, uploadsDir) : new Jobs(options.maxQueued);
  // Upload folders whose job is finished or forgotten are left over from an earlier run (BUG_011 found one).
  for (const name of readdirSync(uploadsDir)) {
    const job = jobs.get(name);
    if (!job || isTerminal(job.status)) rmSync(path.join(uploadsDir, name), { recursive: true, force: true });
  }
  /** The job the worker is busy with, until it answers done, failed or cancelled, or exits. */
  let current: string | null = null;
  /** What the watchdog and /health know about `current` (epoch ms). */
  let startedAt = 0;
  let lastHeardAt = 0;
  let stopRequestedAt: number | null = null;
  let lastRestart: { at: string; reason: ExitReason } | null = null;
  /** True from the watchdog's restart until the old worker has exited, so it is not asked twice. */
  let replacing = false;
  const cancelGraceMs = options.cancelGraceMs ?? 60_000;
  const silenceMs = options.silenceMs ?? 300_000;
  /** A clean shutdown leaves a running job as it is, so the restart reports it as interrupted (RESTARTED). */
  let closing = false;
  const installed = options.loras ?? [];
  /** The add-ons the worker reported loaded in its last `ready`; one that failed to load is never offered. */
  let loaded: readonly Lora[] = [];
  const capabilities = (): Capabilities => ({ ...CAPABILITIES, loras: loaded.map((l) => ({ id: l.id, label: l.label, info: loraInfo(l) })) });

  const save = (): void => {
    const temp = `${indexFile}.tmp`;
    writeFileSync(temp, jobs.toIndex());
    renameSync(temp, indexFile);
  };
  save();

  const cleanup = (job: JobRecord | undefined): void => {
    if (job) rmSync(path.join(uploadsDir, job.id), { recursive: true, force: true });
  };

  const worker = new Worker(
    options.workerCommand,
    {
      onMessage: (m: FromWorker) => {
        handle(m);
      },
      onExit: (code, reason) => {
        log(`[model] worker exited (${String(code)})`);
        if (!closing) lastRestart = { at: new Date().toISOString(), reason };
        replacing = false;
        if (current !== null && !closing) {
          jobs.fail(current, WORKER_STOPPED);
          cleanup(jobs.get(current));
          current = null;
          save();
        }
      },
      onLog: (line) => {
        log(`[worker] ${line}`);
      },
    },
    options.restartDelayMs,
    installed.length > 0 ? { type: "init", loras: installed.map((l) => ({ id: l.id, path: l.path })) } : undefined,
    options.killAfterMs,
  );

  const watchdog = setInterval(() => {
    if (current === null || replacing) return;
    const now = Date.now();
    if (stopRequestedAt !== null && now - stopRequestedAt > cancelGraceMs) {
      log(`[model] the worker did not answer the stop of ${current} within ${String(Math.round(cancelGraceMs / 1000))} s; restarting it`);
      replacing = true;
      worker.restart("stop not answered");
    } else if (stopRequestedAt === null && now - lastHeardAt > silenceMs) {
      // Failed first, so the exit that follows finds it finished and keeps this message rather than WORKER_STOPPED.
      jobs.fail(current, WORKER_SILENT);
      save();
      log(`[model] the worker said nothing about ${current} for ${String(Math.round(silenceMs / 1000))} s; restarting it`);
      replacing = true;
      worker.restart("silent");
    }
  }, options.watchdogTickMs ?? 5_000);
  watchdog.unref();

  const pump = (): void => {
    if (current !== null || !worker.ready) return;
    const job = jobs.next();
    if (!job) return;
    const size = job.request.ratio === null ? undefined : CAPABILITIES.ratios.find((r) => r.id === job.request.ratio);
    const lora = job.request.lora === null ? undefined : loaded.find((l) => l.id === job.request.lora);
    if (job.request.lora !== null && !lora) {
      // The worker restarted and this add-on did not load again: fail the job rather than run it without.
      jobs.fail(job.id, `The LoRA ${job.request.lora} is not loaded on the model server.`);
      cleanup(job);
      save();
      pump();
      return;
    }
    // The job runs with what was recorded at creation (STORY_024), not with whatever the manifest says now.
    const r = job.request;
    const sent = worker.send({
      type: "job",
      id: job.id,
      prompt: r.promptSent,
      seed: r.seed,
      steps: STEPS,
      ...(size ? { width: size.width, height: size.height } : {}),
      references: job.references,
      output: path.join(outputDir, `${job.id}.png`),
      ...(lora ? { lora: { id: lora.id, scale: r.loraScale ?? lora.scale, ...(r.loraGuidance === null ? {} : { guidance: r.loraGuidance }) } } : {}),
      parameters: parametersFor(r, { model: CAPABILITIES.models.find((m) => m.id === r.model)?.label, lora: lora?.label }),
    });
    if (!sent) return;
    current = job.id;
    startedAt = lastHeardAt = Date.now();
    stopRequestedAt = null;
    jobs.start(job.id);
    save();
  };

  const handle = (m: FromWorker): void => {
    if (m.type === "ready") {
      loaded = installed.filter((l) => m.loras.includes(l.id));
      log(`[model] worker ready${loaded.length > 0 ? ` with add-ons ${loaded.map((l) => l.id).join(", ")}` : ""}`);
      for (const l of installed) if (!loaded.includes(l)) log(`[model] add-on ${l.id} did not load; it is not offered`);
      pump();
      return;
    }
    if (m.id === current) lastHeardAt = Date.now();
    const job = jobs.get(m.id);
    if (m.type === "progress") {
      if (job) jobs.progress(m.id, progressFor(m.step, m.steps, job.progress));
      return;
    }
    if (m.type === "done") {
      let sizeBytes = 0;
      try {
        sizeBytes = statSync(m.path).size;
      } catch {
        jobs.fail(m.id, "The model finished but wrote no image.");
      }
      if (sizeBytes > 0) jobs.done(m.id, { file: path.basename(m.path), width: m.width, height: m.height, sizeBytes });
    } else if (m.type === "failed") {
      jobs.fail(m.id, m.message);
    }
    // cancelled: the job was already marked cancelled when DELETE arrived; the worker is now free.
    cleanup(job);
    if (current === m.id) current = null;
    save();
    pump();
  };

  const statusBody = (job: JobRecord): Record<string, unknown> => ({
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    request: job.request,
    ...(job.status === "failed" && job.error ? { error: job.error } : {}),
    ...(job.status === "done" && job.result
      ? { result: { url: `/jobs/${job.id}/result`, mimeType: "image/png", width: job.result.width, height: job.result.height, sizeBytes: job.result.sizeBytes } }
      : {}),
  });

  const jobOr404 = (id: string): JobRecord => {
    const job = jobs.get(id);
    if (!job) throw new HttpError(404, "not_found", `no job ${id}`);
    return job;
  };

  const create = async (req: IncomingMessage): Promise<JobRecord> => {
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
    const validated = validateRequest(capabilities(), fields, uploads, () => randomInt(0, 2 ** 32 - 1));
    // Contract v1.3 (STORY_024): what the add-on contributes is recorded now, so a later manifest change (a new
    // strength, a dropped add-on) never rewrites what an old job says made it. Validation already refused an add-on
    // that is not loaded, so `lora` is found whenever one is named.
    const lora = validated.lora === null ? undefined : loaded.find((l) => l.id === validated.lora);
    const request: JobRequest = {
      ...validated,
      loraScale: lora?.scale ?? null,
      loraGuidance: lora?.guidance ?? null,
      promptSent: withTrigger(validated.prompt, lora),
    };
    const id = randomUUID();
    const refs = uploads.filter((u) => u.field === "referenceImage");
    const dir = path.join(uploadsDir, id);
    const paths = refs.map((u, i) => path.join(dir, `${String(i + 1).padStart(2, "0")}.${EXTENSIONS[u.contentType] ?? "png"}`));
    let job: JobRecord;
    try {
      job = jobs.add(id, request, paths);
    } catch (error) {
      if (error instanceof BusyError) throw new HttpError(503, "busy", error.message);
      throw error;
    }
    if (refs.length > 0) {
      mkdirSync(dir, { recursive: true });
      refs.forEach((u, i) => {
        const p = paths[i];
        if (p !== undefined) writeFileSync(p, u.data);
      });
    }
    save();
    pump();
    return job;
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://model");
    const method = req.method ?? "GET";
    const p = url.pathname;
    if (options.apiKey !== undefined && (req.headers.authorization ?? "") !== `Bearer ${options.apiKey}`) {
      throw new HttpError(401, "unauthorized", "missing or wrong bearer token");
    }
    let m: RegExpExecArray | null;
    if (method === "GET" && p === "/health") {
      const iso = (ms: number): string => new Date(ms).toISOString();
      const busy = current === null ? undefined : jobs.get(current);
      sendJson(res, 200, {
        ok: true,
        server: "qwen-model",
        version: VERSION,
        ready: worker.ready,
        // STORY_026: what the worker is busy with and when it last spoke, so a stall shows without the job index.
        job: busy
          ? { id: busy.id, status: busy.status, startedAt: iso(startedAt), lastHeardAt: iso(lastHeardAt), stopRequestedAt: stopRequestedAt === null ? null : iso(stopRequestedAt) }
          : null,
        queued: jobs.queued().length,
        lastRestart,
      });
      return;
    }
    if (method === "GET" && p === "/capabilities") {
      sendJson(res, 200, capabilities());
      return;
    }
    if (method === "POST" && p === "/jobs") {
      const job = await create(req);
      sendJson(res, 202, { id: job.id, status: job.status, progress: job.progress });
      return;
    }
    if ((m = /^\/jobs\/([^/]+)$/.exec(p)) && m[1] !== undefined) {
      const job = jobOr404(m[1]);
      if (method === "GET") {
        sendJson(res, 200, statusBody(job));
        return;
      }
      if (method === "DELETE") {
        const outcome = jobs.cancel(job.id);
        if (outcome === "already-terminal") throw new HttpError(409, "already_terminal", `job ${job.id} is already ${job.status}`);
        if (outcome === "signal-worker") {
          worker.send({ type: "cancel", id: job.id });
          if (job.id === current && stopRequestedAt === null) stopRequestedAt = Date.now();
        }
        else cleanup(job);
        save();
        sendJson(res, 202, { id: job.id, status: "cancelled", progress: job.progress });
        return;
      }
    }
    if (method === "GET" && (m = /^\/jobs\/([^/]+)\/result$/.exec(p)) && m[1] !== undefined) {
      const job = jobOr404(m[1]);
      if (job.status !== "done" || !job.result) throw new HttpError(409, "not_done", `job ${job.id} is ${job.status}`);
      const file = path.join(outputDir, job.result.file);
      if (!existsSync(file)) throw new HttpError(404, "not_found", `the image for job ${job.id} is no longer on disk`);
      res.writeHead(200, { "content-type": "image/png", "content-length": statSync(file).size });
      createReadStream(file).pipe(res);
      return;
    }
    throw new HttpError(404, "not_found", `no route ${method} ${p}`);
  };

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message, ...(error.field === undefined ? {} : { field: error.field }) } });
        return;
      }
      sendJson(res, 500, { error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
    });
  });

  worker.start();

  return {
    server,
    jobs,
    listen: (port = 0, host = "127.0.0.1") =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const address = server.address();
          resolve(typeof address === "object" && address !== null ? address.port : port);
        });
      }),
    close: async () => {
      closing = true;
      clearInterval(watchdog);
      await worker.stop();
      await new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      });
      // Unfinished jobs keep their uploads: a waiting one runs after the restart (STORY_026), and the start removes
      // whatever is left over.
    },
  };
}
