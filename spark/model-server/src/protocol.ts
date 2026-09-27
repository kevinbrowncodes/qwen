/**
 * The line protocol between the model server and the Python worker (STORY_015): one JSON object per line.
 *   to the worker:   {type:"job", id, prompt, seed, steps, width?, height?, references:[paths], output}
 *                    {type:"cancel", id}
 *   from the worker: {type:"ready"} | {type:"progress", id, step, steps}
 *                    {type:"done", id, path, width, height} | {type:"failed", id, message} | {type:"cancelled", id}
 */
export interface WorkerJob {
  readonly type: "job";
  readonly id: string;
  readonly prompt: string;
  readonly seed: number;
  readonly steps: number;
  readonly width?: number;
  readonly height?: number;
  readonly references: readonly string[];
  readonly output: string;
}
export interface WorkerCancel {
  readonly type: "cancel";
  readonly id: string;
}
export type ToWorker = WorkerJob | WorkerCancel;

export type FromWorker =
  | { readonly type: "ready" }
  | { readonly type: "progress"; readonly id: string; readonly step: number; readonly steps: number }
  | { readonly type: "done"; readonly id: string; readonly path: string; readonly width: number; readonly height: number }
  | { readonly type: "failed"; readonly id: string; readonly message: string }
  | { readonly type: "cancelled"; readonly id: string };

export function encode(message: ToWorker): string {
  return `${JSON.stringify(message)}\n`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v !== "";
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Parses one line from the worker; anything else (log noise, a half line) is null. */
export function parseWorkerLine(line: string): FromWorker | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v["type"]) {
    case "ready":
      return { type: "ready" };
    case "progress":
      return str(v["id"]) && int(v["step"]) && int(v["steps"]) && v["steps"] > 0 ? { type: "progress", id: v["id"], step: v["step"], steps: v["steps"] } : null;
    case "done":
      return str(v["id"]) && str(v["path"]) && int(v["width"]) && int(v["height"]) ? { type: "done", id: v["id"], path: v["path"], width: v["width"], height: v["height"] } : null;
    case "failed":
      return str(v["id"]) ? { type: "failed", id: v["id"], message: typeof v["message"] === "string" && v["message"] !== "" ? v["message"] : "The model failed." } : null;
    case "cancelled":
      return str(v["id"]) ? { type: "cancelled", id: v["id"] } : null;
    default:
      return null;
  }
}

/** Splits a stream into lines: feed chunks, get complete lines; a partial line waits for the rest. */
export class LineSplitter {
  private rest = "";
  push(chunk: string): string[] {
    const text = this.rest + chunk;
    const parts = text.split("\n");
    this.rest = parts.pop() ?? "";
    return parts.map((p) => p.replace(/\r$/, "")).filter((p) => p.trim() !== "");
  }
}

/** Progress as the contract reports it: 0–99 while running (100 is done), never decreasing. */
export function progressFor(step: number, steps: number, previous: number): number {
  const pct = Math.min(99, Math.floor((step / steps) * 100));
  return Math.max(previous, pct);
}
