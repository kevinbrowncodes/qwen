/**
 * The settings that made a generation (STORY_024), as pure functions: the rows of the Info panel and the "Copy all"
 * text. Everything comes from the job's own echo (contract v1.3), never from the composer or today's add-on manifest,
 * so a reopened old generation shows what made it. What a server or an entry did not record says "not recorded".
 * The model server writes the same lines into the PNG (spark/model-server/src/parameters.ts), less the time taken.
 */
import type { JobStatus } from "./job-api";

export const NOT_RECORDED = "not recorded";

/** The echo, as a status answer or a history entry carries it; the v1.3 fields are absent from an older server. */
export interface SettingsRequest {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly seed: number | null;
  readonly referenceImages: number;
  readonly lora?: string | null;
  readonly loraScale?: number | null;
  readonly loraGuidance?: number | null;
  readonly promptSent?: string | null;
}

export interface SettingsSource {
  readonly status: JobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly request: SettingsRequest;
  readonly result?: { readonly width: number; readonly height: number };
}

export interface Labels {
  readonly models: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly loras: ReadonlyArray<{ readonly id: string; readonly label: string }>;
}

export type RowKey = "prompt" | "sent" | "model" | "size" | "seed" | "addOn" | "editOf" | "time";

export interface SettingRow {
  readonly key: RowKey;
  readonly label: string;
  readonly value: string;
  /** A second line under the value (the add-on's strength and guidance); joined with " · " when copied. */
  readonly detail?: string;
}

/** A strength or guidance as the owner reads it: "1", "0.9", or "default" for none. */
const settingText = (v: number | null): string => (v === null ? "default" : String(v));

/** "40 s", "2 min 6 s", "2 min", "1 h 5 min". */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${String(total)} s`;
  if (total < 3600) {
    const s = total % 60;
    return `${String(Math.floor(total / 60))} min${s === 0 ? "" : ` ${String(s)} s`}`;
  }
  return `${String(Math.floor(total / 3600))} h ${String(Math.floor((total % 3600) / 60))} min`;
}

/** From creation to the terminal answer (the contract has no start time, so a queued wait is included). */
function timeText(source: SettingsSource): string | null {
  const verb = source.status === "done" ? "" : source.status === "failed" ? "failed after " : source.status === "cancelled" ? "stopped after " : null;
  if (verb === null) return null;
  const ms = Date.parse(source.updatedAt) - Date.parse(source.createdAt);
  return Number.isNaN(ms) ? NOT_RECORDED : `${verb}${durationText(ms)}`;
}

export function settingsRows(source: SettingsSource, labels: Labels): SettingRow[] {
  const r = source.request;
  const lora = r.lora ?? null;
  const rows: SettingRow[] = [{ key: "prompt", label: "Prompt", value: r.prompt }];
  if (typeof r.promptSent === "string") {
    if (r.promptSent !== r.prompt) rows.push({ key: "sent", label: "Sent", value: r.promptSent });
  } else if (lora !== null) {
    // An add-on may have added its trigger word, and nothing recorded whether it did.
    rows.push({ key: "sent", label: "Sent", value: NOT_RECORDED });
  }
  rows.push({ key: "model", label: "Model", value: labels.models.find((m) => m.id === r.model)?.label ?? r.model });
  const shape = r.ratio ?? (r.referenceImages > 0 ? "as the reference" : "default");
  rows.push({ key: "size", label: "Size", value: source.result ? `${shape} · ${String(source.result.width)} × ${String(source.result.height)}` : shape });
  rows.push({ key: "seed", label: "Seed", value: r.seed === null ? NOT_RECORDED : String(r.seed) });
  if (lora === null) {
    rows.push({ key: "addOn", label: "Add-on", value: "None" });
  } else {
    const label = labels.loras.find((l) => l.id === lora)?.label ?? lora;
    // An add-on always has a strength, so a missing one means this job's settings were not recorded (before v1.3).
    const scale = r.loraScale ?? null;
    const detail = scale === null ? `strength and guidance ${NOT_RECORDED}` : `strength ${settingText(scale)} · guidance ${settingText(r.loraGuidance ?? null)}`;
    rows.push({ key: "addOn", label: "Add-on", value: label, detail });
  }
  if (r.referenceImages > 0) rows.push({ key: "editOf", label: "Edit of", value: `${String(r.referenceImages)} reference image${r.referenceImages === 1 ? "" : "s"}` });
  const time = timeText(source);
  if (time !== null) rows.push({ key: "time", label: "Time", value: time });
  return rows;
}

/** Every row as plain text, one per line: the text the PNG's `parameters` chunk carries, plus the time. */
export function copyAllText(rows: readonly SettingRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}${row.detail === undefined ? "" : ` · ${row.detail}`}`).join("\n");
}
