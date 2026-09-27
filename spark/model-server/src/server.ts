/**
 * The model server (STORY_015): docs/contracts/job-api.md v1 in front of Qwen-Image-2.1. This process owns the
 * contract (HTTP, validation, the queue, cancel, results on disk); the Python worker (spark/model/worker.py) owns
 * the pipeline. One job runs at a time. Zero runtime dependencies, like the stub.
 */
import { randomInt, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { CAPABILITIES, STEPS } from "./capabilities.ts";
import { BusyError, isTerminal, Jobs, type JobRecord } from "./jobs.ts";
import { MAX_BODY_BYTES, MultipartError, boundaryOf, parseMultipart, type MultipartFile } from "./multipart.ts";
import { progressFor, type FromWorker } from "./protocol.ts";
import { HttpError, validateRequest } from "./validation.ts";
import { Worker } from "./worker.ts";

export const VERSION = "1.0.0";
export const WORKER_STOPPED = "The model worker stopped unexpectedly.";
const EXTENSIONS: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export interface ModelServerOptions {
  /** Results, uploads and the job index live here. */
  readonly outputDir: string;
  /** The worker process, e.g. ["python3", "/srv/model/worker.py"]. */
  readonly workerCommand: readonly string[];
  readonly apiKey?: string;
  readonly maxQueued?: number;
  readonly restartDelayMs?: number;
  readonly log?: (line: string) => void;
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
  const jobs = existsSync(indexFile) ? Jobs.fromIndex(readFileSync(indexFile, "utf8"), options.maxQueued) : new Jobs(options.maxQueued);
  /** The job the worker is busy with, until it answers done, failed or cancelled, or exits. */
  let current: string | null = null;
  /** A clean shutdown leaves a running job as it is, so the restart reports it as interrupted (RESTARTED). */
  let closing = false;

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
      onExit: (code) => {
        log(`[model] worker exited (${String(code)})`);
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
  );

  const pump = (): void => {
    if (current !== null || !worker.ready) return;
    const job = jobs.next();
    if (!job) return;
    const size = job.request.ratio === null ? undefined : CAPABILITIES.ratios.find((r) => r.id === job.request.ratio);
    const sent = worker.send({
      type: "job",
      id: job.id,
      prompt: job.request.prompt,
      seed: job.request.seed,
      steps: STEPS,
      ...(size ? { width: size.width, height: size.height } : {}),
      references: job.references,
      output: path.join(outputDir, `${job.id}.png`),
    });
    if (!sent) return;
    current = job.id;
    jobs.start(job.id);
    save();
  };

  const handle = (m: FromWorker): void => {
    if (m.type === "ready") {
      log("[model] worker ready");
      pump();
      return;
    }
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
    const request = validateRequest(CAPABILITIES, fields, uploads, () => randomInt(0, 2 ** 32 - 1));
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
      sendJson(res, 200, { ok: true, server: "qwen-model", version: VERSION, ready: worker.ready });
      return;
    }
    if (method === "GET" && p === "/capabilities") {
      sendJson(res, 200, CAPABILITIES);
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
        if (outcome === "signal-worker") worker.send({ type: "cancel", id: job.id });
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
      await worker.stop();
      await new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      });
      for (const job of jobs.all()) if (!isTerminal(job.status)) cleanup(job);
    },
  };
}
