/**
 * The job API contract's types (docs/contracts/job-api.md v1) and the checks that tell a contract answer from anything
 * else (STORY_007). Written against the contract, not the stub, so the model server (EPIC_004) only has to speak it.
 */
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export const TERMINAL: ReadonlySet<JobStatus> = new Set(["done", "failed", "cancelled"]);

export interface ApiError {
  readonly error: { readonly code: string; readonly message: string; readonly field?: string };
}
export interface JobRequestEcho {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly seed: number;
  readonly referenceImages: number;
  /** v1.2 (STORY_019); a server before it sends none. */
  readonly lora?: string | null;
}
export interface JobResult {
  readonly url: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
}
export interface JobStatusResponse {
  readonly id: string;
  readonly status: JobStatus;
  readonly progress: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly request: JobRequestEcho;
  readonly error?: { readonly code: string; readonly message: string };
  readonly result?: JobResult;
}
export interface CreateJobResponse {
  readonly id: string;
  readonly status: JobStatus;
  readonly progress: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isJobStatus(v: unknown): v is JobStatus {
  return v === "queued" || v === "running" || v === "done" || v === "failed" || v === "cancelled";
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

export function isApiError(v: unknown): v is ApiError {
  return isRecord(v) && isRecord(v["error"]) && typeof v["error"]["code"] === "string" && typeof v["error"]["message"] === "string";
}

export function isCreateJobResponse(v: unknown): v is CreateJobResponse {
  return isRecord(v) && typeof v["id"] === "string" && v["id"] !== "" && isJobStatus(v["status"]) && typeof v["progress"] === "number";
}

function isResult(v: unknown): v is JobResult {
  return isRecord(v) && typeof v["url"] === "string" && typeof v["mimeType"] === "string" && typeof v["width"] === "number" && typeof v["height"] === "number" && typeof v["sizeBytes"] === "number";
}

function isRequestEcho(v: unknown): v is JobRequestEcho {
  return isRecord(v) && typeof v["prompt"] === "string" && (typeof v["ratio"] === "string" || v["ratio"] === null) && typeof v["model"] === "string" && typeof v["seed"] === "number" && typeof v["referenceImages"] === "number" && (v["lora"] === undefined || v["lora"] === null || typeof v["lora"] === "string");
}

export function isJobStatusResponse(v: unknown): v is JobStatusResponse {
  if (!isRecord(v) || typeof v["id"] !== "string" || !isJobStatus(v["status"]) || typeof v["progress"] !== "number") return false;
  if (typeof v["createdAt"] !== "string" || typeof v["updatedAt"] !== "string" || !isRequestEcho(v["request"])) return false;
  if (v["status"] === "done" && !isResult(v["result"])) return false;
  if (v["status"] === "failed" && !(isRecord(v["error"]) && typeof v["error"]["code"] === "string")) return false;
  return true;
}
