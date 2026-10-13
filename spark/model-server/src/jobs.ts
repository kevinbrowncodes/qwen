/**
 * The model server's jobs (STORY_015): one runs at a time, the rest wait in order, and a terminal state is final.
 * The table is saved as a small JSON index beside the results, so finished images survive a restart. A job that was
 * running when the server stopped is failed on the way back up; one that was waiting waits again, with its references
 * read back from its upload folder (STORY_026).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export type Status = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRequest {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly seed: number;
  readonly referenceImages: number;
  /** The add-on used (STORY_019); null for none, and for jobs saved before it existed. */
  readonly lora: string | null;
  /** The add-on's strength and guidance as applied to this job, recorded at creation (contract v1.3, STORY_024);
   * null without an add-on, without guidance, or for a job saved before it. */
  readonly loraScale: number | null;
  readonly loraGuidance: number | null;
  /** The prompt the model received, with any trigger word (v1.3); the prompt itself for a job saved before it. */
  readonly promptSent: string;
}

/** What validation decides from the request alone; the server adds what the add-on contributes (STORY_024). */
export type ValidatedRequest = Omit<JobRequest, "loraScale" | "loraGuidance" | "promptSent">;

export interface JobResult {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
}

export interface JobRecord {
  readonly id: string;
  readonly request: JobRequest;
  readonly createdAt: string;
  updatedAt: string;
  status: Status;
  progress: number;
  error?: { readonly code: "generation_failed" | "moderated"; readonly message: string };
  result?: JobResult;
  /** Where the uploaded references were written for the worker; removed when the job ends. */
  references: readonly string[];
}

export const RESTARTED = "The model server restarted before this job finished.";

export class BusyError extends Error {
  constructor(limit: number) {
    super(`The model server already has ${String(limit)} images waiting; try again when one has finished.`);
    this.name = "BusyError";
  }
}

const TERMINAL: ReadonlySet<Status> = new Set(["done", "failed", "cancelled"]);
export const isTerminal = (s: Status): boolean => TERMINAL.has(s);

export type CancelOutcome = "removed-from-queue" | "signal-worker" | "already-terminal" | "unknown";

export class Jobs {
  private readonly table = new Map<string, JobRecord>();
  private readonly maxQueued: number;
  private readonly now: () => string;

  constructor(maxQueued = 8, now: () => string = () => new Date().toISOString()) {
    this.maxQueued = maxQueued;
    this.now = now;
  }

  add(id: string, request: JobRequest, references: readonly string[] = []): JobRecord {
    if (this.queued().length >= this.maxQueued) throw new BusyError(this.maxQueued);
    const at = this.now();
    const job: JobRecord = { id, request, createdAt: at, updatedAt: at, status: "queued", progress: 0, references };
    this.table.set(id, job);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.table.get(id);
  }

  all(): JobRecord[] {
    return [...this.table.values()];
  }

  queued(): JobRecord[] {
    return this.all().filter((j) => j.status === "queued");
  }

  running(): JobRecord | undefined {
    return this.all().find((j) => j.status === "running");
  }

  /** The next job to hand the worker: the oldest queued one, and only when none is running. */
  next(): JobRecord | undefined {
    return this.running() ? undefined : this.queued()[0];
  }

  private touch(id: string, change: (j: JobRecord) => void): JobRecord | undefined {
    const job = this.table.get(id);
    if (!job || isTerminal(job.status)) return job;
    change(job);
    job.updatedAt = this.now();
    return job;
  }

  start(id: string): void {
    this.touch(id, (j) => {
      j.status = "running";
    });
  }

  progress(id: string, pct: number): void {
    this.touch(id, (j) => {
      j.progress = Math.max(j.progress, Math.min(99, pct));
    });
  }

  done(id: string, result: JobResult): void {
    this.touch(id, (j) => {
      j.status = "done";
      j.progress = 100;
      j.result = result;
    });
  }

  fail(id: string, message: string): void {
    this.touch(id, (j) => {
      j.status = "failed";
      j.error = { code: "generation_failed", message };
    });
  }

  /** Cancels a job: a queued one leaves at once; a running one is cancelled here and its worker must be told. */
  cancel(id: string): CancelOutcome {
    const job = this.table.get(id);
    if (!job) return "unknown";
    if (isTerminal(job.status)) return "already-terminal";
    const wasRunning = job.status === "running";
    this.touch(id, (j) => {
      j.status = "cancelled";
    });
    return wasRunning ? "signal-worker" : "removed-from-queue";
  }

  toIndex(): string {
    // The uploads' temp paths are not saved: they are gone after a restart.
    const saved = this.all().map((j) => {
      const copy: Partial<JobRecord> = { ...j };
      delete copy.references;
      return copy;
    });
    return `${JSON.stringify(saved, null, 2)}\n`;
  }

  /** Reads a saved index; anything malformed is skipped. A running job is failed with RESTARTED. A queued one stays
   * queued when `uploadsDir/<id>/` holds as many files as it had references (none for a text-to-image job), and is
   * failed with RESTARTED otherwise. Restored jobs are not held to the cap: they were saved under it. */
  static fromIndex(text: string, maxQueued = 8, now: () => string = () => new Date().toISOString(), uploadsDir?: string): Jobs {
    const jobs = new Jobs(maxQueued, now);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return jobs;
    }
    if (!Array.isArray(raw)) return jobs;
    for (const item of raw) {
      if (!isRecord(item) || typeof item["id"] !== "string" || !isRecord(item["request"]) || typeof item["status"] !== "string") continue;
      const status = item["status"];
      if (!["queued", "running", "done", "failed", "cancelled"].includes(status)) continue;
      // Written by this server's own toIndex; fields beyond the ones checked are carried as they were saved.
      // A job saved before STORY_019 has no add-on, and one saved before STORY_024 has no recorded settings: they
      // read as null, and the prompt sent as the prompt (the honest reading: nothing about them was recorded).
      const r = item["request"];
      const lora = typeof r["lora"] === "string" ? r["lora"] : null;
      const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
      const promptSent = typeof r["promptSent"] === "string" ? r["promptSent"] : typeof r["prompt"] === "string" ? r["prompt"] : "";
      const request = { ...r, lora, loraScale: num(r["loraScale"]), loraGuidance: num(r["loraGuidance"]), promptSent };
      const references = referencesOf(uploadsDir, item["id"]);
      const wanted = typeof r["referenceImages"] === "number" ? r["referenceImages"] : 0;
      const keep = status === "queued" && references.length === wanted;
      const job = { ...item, request, references: keep ? references : [] } as unknown as JobRecord;
      if (!isTerminal(job.status) && !keep) {
        job.status = "failed";
        job.error = { code: "generation_failed", message: RESTARTED };
        job.updatedAt = now();
      }
      jobs.table.set(job.id, job);
    }
    return jobs;
  }
}

/** A waiting job's uploaded references, in the order they were written (01.png, 02.jpg, …). */
function referencesOf(uploadsDir: string | undefined, id: string): string[] {
  if (uploadsDir === undefined) return [];
  const dir = path.join(uploadsDir, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().map((name) => path.join(dir, name));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
