/**
 * The settings a generated image carries in its PNG (STORY_024): the lines of a `tEXt` chunk named `parameters`,
 * one setting per line, written exactly as the app's "Copy all" writes them (app/lib/generation-settings.ts), in the
 * same order, except the time taken: the file is written before the job's last timestamp exists. The pixel size is
 * known only to the worker, so it appends " · W × H" to the line at `sizeLine`.
 */
import type { JobRequest } from "./jobs.ts";

export interface Labels {
  readonly model?: string;
  readonly lora?: string;
}

export interface Parameters {
  readonly lines: readonly string[];
  /** The index of the Size line, which the worker completes with the saved image's size. */
  readonly sizeLine: number;
}

/** A strength or guidance as the owner reads it: "1", "0.9", or "default" for none. */
export const settingText = (v: number | null): string => (v === null ? "default" : String(v));

export function parametersFor(request: JobRequest, labels: Labels = {}): Parameters {
  const lines = [`Prompt: ${request.prompt}`];
  if (request.promptSent !== request.prompt) lines.push(`Sent: ${request.promptSent}`);
  lines.push(`Model: ${labels.model ?? request.model}`);
  const sizeLine = lines.length;
  lines.push(`Size: ${request.ratio ?? (request.referenceImages > 0 ? "as the reference" : "default")}`);
  lines.push(`Seed: ${String(request.seed)}`);
  lines.push(request.lora === null ? "Add-on: None" : `Add-on: ${labels.lora ?? request.lora} · strength ${settingText(request.loraScale)} · guidance ${settingText(request.loraGuidance)}`);
  if (request.referenceImages > 0) lines.push(`Edit of: ${String(request.referenceImages)} reference image${request.referenceImages === 1 ? "" : "s"}`);
  return { lines, sizeLine };
}
