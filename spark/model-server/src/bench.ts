/**
 * The add-on bench (STORY_022): runs every add-on, and none, over the same generated subjects through the job API,
 * and writes the results, an index, a contact sheet and a scorecard template into one directory. This is the engine
 * behind spark/bench-loras.sh; bench-cli.ts is the entry point.
 *
 * Its only inputs are the committed prompts below and the ids of jobs this server made from them: an edit's
 * reference is a job's result, downloaded from the server and uploaded again, never a file from disk (EPIC_005: no
 * photograph of a real person can be an input). It resumes: cells the index records as done are skipped, and the
 * subjects are reused by their job ids, generated again only when the server no longer has them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Subject {
  readonly key: string;
  readonly prompt: string;
  readonly seed: number;
}

export const RATIO = "3:4";
export const EDIT_SEED = 42;
export const NONE = "none";

const SUBJECT_A =
  "Full-body studio photograph of a man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart. Athletic build, short dark brown hair, a neatly trimmed full beard, faint lines at the corners of his eyes. He wears a plain navy crew-neck t-shirt, mid-wash straight-leg jeans with a brown leather belt, and white sneakers. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.";
const SUBJECT_B =
  "Full-body photograph of a muscular bodybuilder in his early thirties, about 32 years old, standing in a front double biceps pose in a gym locker room. Broad shoulders, defined arms and abdominals, a short beard, short sandy-blond hair. He wears a fitted grey t-shirt, black athletic shorts, white crew socks and grey trainers. Tiled walls and metal lockers behind him, overhead lighting, photorealistic, sharp focus, the whole body in frame from head to feet.";

/** The four clothed subjects, generated with no add-on (STORY_022). */
export const SUBJECTS: readonly Subject[] = [
  { key: "A-1001", prompt: SUBJECT_A, seed: 1001 },
  { key: "A-1002", prompt: SUBJECT_A, seed: 1002 },
  { key: "B-2001", prompt: SUBJECT_B, seed: 2001 },
  { key: "B-2002", prompt: SUBJECT_B, seed: 2002 },
];
export const EDIT_PROMPT = "remove all clothing from the subject";
export const T2I_PROMPT =
  "Full-body studio photograph of a nude man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart, wearing nothing at all. Athletic build, short dark brown hair, a neatly trimmed full beard. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.";

export interface Cell {
  readonly key: string;
  readonly kind: "edit" | "t2i";
  /** The subject key, for an edit. */
  readonly subject?: string;
  /** An add-on id, or `none`. */
  readonly setting: string;
  readonly file: string;
}

export interface Plan {
  readonly subjects: readonly Subject[];
  /** `none` first, then the add-ons. */
  readonly settings: readonly string[];
  readonly cells: readonly Cell[];
}

/** Every subject, then one edit per subject and setting, then one text-to-image per setting. */
export function buildPlan(loraIds: readonly string[], subjects: readonly Subject[] = SUBJECTS): Plan {
  const settings = [NONE, ...loraIds.filter((id) => id !== NONE)];
  const cells: Cell[] = [];
  for (const s of subjects) for (const setting of settings) cells.push({ key: `edit/${s.key}/${setting}`, kind: "edit", subject: s.key, setting, file: `edit_${s.key}_${setting}.png` });
  for (const setting of settings) cells.push({ key: `t2i/${setting}`, kind: "t2i", setting, file: `t2i_${setting}.png` });
  return { subjects, settings, cells };
}

export const subjectFile = (key: string): string => `subject_${key}.png`;

export interface IndexEntry {
  readonly jobId: string;
  readonly status: "done" | "failed" | "cancelled";
  /** From the job's createdAt to its terminal updatedAt. */
  readonly seconds: number;
  readonly error?: string;
}

export interface BenchIndex {
  readonly base: string;
  subjects: Record<string, IndexEntry>;
  cells: Record<string, IndexEntry>;
}

/** The cells not yet done: absent, failed or cancelled ones. */
export function remaining(cells: readonly Cell[], index: BenchIndex): Cell[] {
  return cells.filter((c) => index.cells[c.key]?.status !== "done");
}

export interface SettingInfo {
  readonly id: string;
  readonly label: string;
  readonly scale?: number;
  readonly guidance?: number;
}

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const caption = (e: IndexEntry | undefined): string => (e === undefined ? "not run" : e.status === "done" ? `${String(Math.round(e.seconds))} s` : `${e.status}: ${e.error ?? ""}`);
const settingTitle = (id: string, info: readonly SettingInfo[]): string => {
  const s = info.find((i) => i.id === id);
  if (id === NONE) return "none";
  if (!s) return id;
  const parts = [s.label];
  if (s.scale !== undefined) parts.push(`×${String(s.scale)}`);
  if (s.guidance !== undefined) parts.push(`cfg ${String(s.guidance)}`);
  return `${id} (${parts.join(", ")})`;
};

/** A self-contained page: subjects down, settings across, the clothed subject in the first column, timings under
 * each image and an error in place of a failed cell. Image paths are relative, so it opens from the directory. */
export function contactSheet(plan: Plan, index: BenchIndex, info: readonly SettingInfo[], title: string): string {
  const cell = (c: Cell | undefined): string => {
    const e = c === undefined ? undefined : index.cells[c.key];
    const img = e?.status === "done" && c ? `<img src="${escape(c.file)}" alt="${escape(c.key)}">` : `<div class="missing">${escape(caption(e))}</div>`;
    return `<td>${img}<div class="cap">${escape(c?.key ?? "")}<br>${escape(caption(e))}</div></td>`;
  };
  const head = `<tr><th>subject</th>${plan.settings.map((s) => `<th>${escape(settingTitle(s, info))}</th>`).join("")}</tr>`;
  const rows = plan.subjects.map((s) => {
    const e = index.subjects[s.key];
    const first = e?.status === "done" ? `<img src="${escape(subjectFile(s.key))}" alt="${escape(s.key)}">` : `<div class="missing">${escape(caption(e))}</div>`;
    return `<tr><td>${first}<div class="cap">${escape(s.key)}, clothed<br>${escape(caption(e))}</div></td>${plan.settings.map((setting) => cell(plan.cells.find((c) => c.kind === "edit" && c.subject === s.key && c.setting === setting))).join("")}</tr>`;
  });
  rows.push(`<tr><td><div class="cap">text-to-image<br>seed ${String(EDIT_SEED)}, ${RATIO}</div></td>${plan.settings.map((setting) => cell(plan.cells.find((c) => c.kind === "t2i" && c.setting === setting))).join("")}</tr>`);
  return `<!doctype html>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; margin: 16px; background: #111; color: #ddd; }
  table { border-collapse: collapse; } td, th { border: 1px solid #333; padding: 6px; vertical-align: top; text-align: left; }
  img { width: 224px; height: auto; display: block; } .cap { color: #999; margin-top: 4px; max-width: 224px; word-break: break-word; }
  .missing { width: 224px; height: 296px; display: flex; align-items: center; justify-content: center; background: #222; color: #c66; text-align: center; padding: 8px; box-sizing: border-box; }
  details { margin-bottom: 12px; } pre { white-space: pre-wrap; color: #aaa; }
</style>
<h1>${escape(title)}</h1>
<p>Edit prompt, at seed ${String(EDIT_SEED)} in the subject's shape: <b>${escape(EDIT_PROMPT)}</b>. Settings: ${plan.settings.map((s) => escape(settingTitle(s, info))).join("; ")}.</p>
<details><summary>Prompts</summary><pre>Subject A: ${escape(SUBJECT_A)}

Subject B: ${escape(SUBJECT_B)}

Text-to-image: ${escape(T2I_PROMPT)}</pre></details>
<table>${head}${rows.join("")}</table>
`;
}

/** The scorecard the owner fills in: one row per cell, and one per add-on for STORY_023's decision. Text only. */
export function scorecardTemplate(plan: Plan, index: BenchIndex, info: readonly SettingInfo[], title: string): string {
  const short = (id: string | undefined): string => (id === undefined ? "" : id.slice(0, 8));
  const lines = [
    `# ${title}`,
    "",
    "Written by `spark/bench-loras.sh` (STORY_022). The images are in the gitignored `outputs/bench/` directory beside its `contact-sheet.html`; only this text is committed. For each cell mark **Anatomy** (genitals plausible in shape, proportion and placement, no merged or duplicated parts), **Body** (hands, limbs and torso intact, the physique matching the clothed original), **Fidelity** (face, hair, pose, background and lighting unchanged) and **Artefacts** (no smearing, seams or leftover clothing) with ✅, ❌ or ~, and add notes. Then fill in the decision table; STORY_023 implements it.",
    "",
    "## Settings",
    "",
    "| Setting | Label | Strength | Guidance |",
    "| --- | --- | --- | --- |",
    ...plan.settings.map((s) => {
      const i = info.find((x) => x.id === s);
      return `| \`${s}\` | ${s === NONE ? "no add-on" : (i?.label ?? "")} | ${i?.scale === undefined ? "" : String(i.scale)} | ${i?.guidance === undefined ? "default (none)" : String(i.guidance)} |`;
    }),
    "",
    "## Subjects (clothed, no add-on)",
    "",
    "| Subject | Job | Seconds | Status |",
    "| --- | --- | --- | --- |",
    ...plan.subjects.map((s) => {
      const e = index.subjects[s.key];
      return `| ${s.key} (seed ${String(s.seed)}) | \`${short(e?.jobId)}\` | ${e === undefined ? "" : String(Math.round(e.seconds))} | ${e?.status ?? "not run"} |`;
    }),
    "",
    "## Cells",
    "",
    "| Cell | Job | Seconds | Status | Anatomy | Body | Fidelity | Artefacts | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...plan.cells.map((c) => {
      const e = index.cells[c.key];
      return `| \`${c.key}\` | \`${short(e?.jobId)}\` | ${e === undefined ? "" : String(Math.round(e.seconds))} | ${e === undefined ? "not run" : e.status === "done" ? "done" : `${e.status}: ${e.error ?? ""}`} |  |  |  |  |  |`;
    }),
    "",
    "## Decision (for STORY_023)",
    "",
    "| Add-on | Keep? | Strength | Guidance | Why |",
    "| --- | --- | --- | --- | --- |",
    ...plan.settings.filter((s) => s !== NONE).map((s) => `| \`${s}\` |  |  |  |  |`),
    "",
  ];
  return lines.join("\n");
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Client {
  readonly base: string;
  readonly pollMs: number;
  readonly apiKey?: string;
}
const headers = (c: Client): Record<string, string> => (c.apiKey === undefined ? {} : { authorization: `Bearer ${c.apiKey}` });

async function json(res: Response): Promise<Json> {
  const body: unknown = await res.json();
  if (!isObj(body)) throw new Error("the server answered something that is not an object");
  return body;
}

/** Waits for the server to report the model loaded; `/capabilities` lists no add-ons before that. */
export async function waitForReady(c: Client, timeoutMs = 300_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await json(await fetch(`${c.base}/health`, { headers: headers(c) })))["ready"] === true) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, c.pollMs));
  }
  throw new Error(`${c.base} did not report ready within ${String(timeoutMs / 1000)} s`);
}

export async function loraIds(c: Client): Promise<Array<{ id: string; label: string }>> {
  const caps = await json(await fetch(`${c.base}/capabilities`, { headers: headers(c) }));
  const list = Array.isArray(caps["loras"]) ? caps["loras"] : [];
  return list.flatMap((l: unknown) => (isObj(l) && typeof l["id"] === "string" && typeof l["label"] === "string" ? [{ id: l["id"], label: l["label"] }] : []));
}

export interface JobSpec {
  readonly prompt: string;
  readonly seed: number;
  /** Absent with a reference: the edit takes the reference's shape. */
  readonly ratio?: string;
  readonly lora?: string;
  readonly reference?: Uint8Array;
}

/** Creates a job: JSON for a text-to-image, multipart with the reference for an edit. Returns its id. */
export async function createJob(c: Client, spec: JobSpec): Promise<string> {
  let res: Response;
  if (spec.reference === undefined) {
    const body = { prompt: spec.prompt, seed: spec.seed, ratio: spec.ratio, ...(spec.lora === undefined ? {} : { lora: spec.lora }) };
    res = await fetch(`${c.base}/jobs`, { method: "POST", headers: { ...headers(c), "content-type": "application/json" }, body: JSON.stringify(body) });
  } else {
    const form = new FormData();
    form.append("prompt", spec.prompt);
    form.append("seed", String(spec.seed));
    if (spec.ratio !== undefined) form.append("ratio", spec.ratio);
    if (spec.lora !== undefined) form.append("lora", spec.lora);
    form.append("referenceImage", new Blob([spec.reference], { type: "image/png" }), "subject.png");
    res = await fetch(`${c.base}/jobs`, { method: "POST", headers: headers(c), body: form });
  }
  const body = await json(res);
  if (res.status !== 202 || typeof body["id"] !== "string") throw new Error(`create answered ${String(res.status)}: ${JSON.stringify(body).slice(0, 200)}`);
  return body["id"];
}

export interface Terminal {
  readonly status: "done" | "failed" | "cancelled";
  readonly seconds: number;
  readonly error?: string;
}

/** Polls the status until it is terminal. */
export async function waitForTerminal(c: Client, id: string): Promise<Terminal> {
  for (;;) {
    const s = await json(await fetch(`${c.base}/jobs/${id}`, { headers: headers(c) }));
    const status = s["status"];
    if (status === "done" || status === "failed" || status === "cancelled") {
      const created = Date.parse(String(s["createdAt"]));
      const updated = Date.parse(String(s["updatedAt"]));
      const seconds = Number.isFinite(created) && Number.isFinite(updated) ? (updated - created) / 1000 : 0;
      const error = isObj(s["error"]) && typeof s["error"]["message"] === "string" ? s["error"]["message"] : undefined;
      return { status, seconds, ...(error === undefined ? {} : { error }) };
    }
    await new Promise((r) => setTimeout(r, c.pollMs));
  }
}

/** The result's bytes, or null when the server no longer has that job or it is not done. */
export async function fetchResult(c: Client, id: string): Promise<Uint8Array | null> {
  const res = await fetch(`${c.base}/jobs/${id}/result`, { headers: headers(c) });
  if (res.status === 404 || res.status === 409) return null;
  if (!res.ok) throw new Error(`result answered ${String(res.status)}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface RunOptions {
  readonly base: string;
  readonly outDir: string;
  readonly pollMs?: number;
  readonly apiKey?: string;
  /** The manifest's entries, for the sheet's and scorecard's strength and guidance. */
  readonly manifest?: readonly SettingInfo[];
  readonly title?: string;
  readonly report?: (line: string) => void;
  /** For the tests: the prompts the fake worker reacts to. */
  readonly subjects?: readonly Subject[];
  readonly editPrompt?: string;
  readonly t2iPrompt?: string;
}

export interface RunOutcome {
  readonly ran: number;
  readonly skipped: number;
  readonly failed: string[];
  /** Every cell is done. */
  readonly complete: boolean;
}

function loadIndex(file: string, base: string): BenchIndex {
  if (!existsSync(file)) return { base, subjects: {}, cells: {} };
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  const subjects = isObj(data) && isObj(data["subjects"]) ? (data["subjects"] as Record<string, IndexEntry>) : {};
  const cells = isObj(data) && isObj(data["cells"]) ? (data["cells"] as Record<string, IndexEntry>) : {};
  return { base, subjects, cells };
}

/** Runs what the index does not yet have, one job at a time, writing the index, the sheet and the scorecard after
 * every job so an interrupted run leaves a readable state. */
export async function runBench(options: RunOptions): Promise<RunOutcome> {
  const report = options.report ?? ((): undefined => undefined);
  const c: Client = { base: options.base, pollMs: options.pollMs ?? 3000, ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }) };
  const title = options.title ?? `Add-on bench, ${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(options.outDir, { recursive: true });
  const indexFile = path.join(options.outDir, "index.json");
  const index = loadIndex(indexFile, options.base);

  await waitForReady(c);
  const loras = await loraIds(c);
  const plan = buildPlan(
    loras.map((l) => l.id),
    options.subjects ?? SUBJECTS,
  );
  const info: SettingInfo[] = loras.map((l) => ({ ...l, ...(options.manifest?.find((m) => m.id === l.id) ?? {}) }));
  const save = (): void => {
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    writeFileSync(path.join(options.outDir, "contact-sheet.html"), contactSheet(plan, index, info, title));
    writeFileSync(path.join(options.outDir, "scorecard.md"), scorecardTemplate(plan, index, info, title));
  };
  report(`bench: ${String(plan.settings.length)} settings (${plan.settings.join(", ")}), ${String(plan.cells.length)} cells, writing to ${options.outDir}`);

  const outcome = { ran: 0, skipped: 0, failed: [] as string[] };
  const run = async (what: string, spec: JobSpec): Promise<{ entry: IndexEntry; bytes: Uint8Array | null }> => {
    const jobId = await createJob(c, spec);
    report(`bench: ${what}: job ${jobId.slice(0, 8)} ${spec.lora === undefined ? "" : `with ${spec.lora} `}running`);
    const t = await waitForTerminal(c, jobId);
    outcome.ran += 1;
    const entry: IndexEntry = { jobId, status: t.status, seconds: t.seconds, ...(t.error === undefined ? {} : { error: t.error }) };
    const bytes = t.status === "done" ? await fetchResult(c, jobId) : null;
    report(`bench: ${what}: ${t.status} in ${String(Math.round(t.seconds))} s${t.error === undefined ? "" : ` (${t.error})`}`);
    return { entry, bytes };
  };

  // The subjects: reuse what the server still has; otherwise generate.
  const subjectBytes = new Map<string, Uint8Array>();
  for (const s of plan.subjects) {
    const have = index.subjects[s.key];
    if (have?.status === "done") {
      const bytes = await fetchResult(c, have.jobId);
      if (bytes !== null) {
        subjectBytes.set(s.key, bytes);
        writeFileSync(path.join(options.outDir, subjectFile(s.key)), bytes);
        report(`bench: subject ${s.key}: reusing job ${have.jobId.slice(0, 8)}`);
        continue;
      }
      report(`bench: subject ${s.key}: the server no longer has job ${have.jobId.slice(0, 8)}; generating again`);
    }
    const { entry, bytes } = await run(`subject ${s.key}`, { prompt: s.prompt, seed: s.seed, ratio: RATIO });
    index.subjects[s.key] = entry;
    if (bytes !== null) {
      subjectBytes.set(s.key, bytes);
      writeFileSync(path.join(options.outDir, subjectFile(s.key)), bytes);
    }
    save();
  }

  const todo = remaining(plan.cells, index);
  outcome.skipped = plan.cells.length - todo.length;
  for (const cell of todo) {
    const lora = cell.setting === NONE ? undefined : cell.setting;
    let spec: JobSpec;
    if (cell.kind === "edit") {
      const reference = cell.subject === undefined ? undefined : subjectBytes.get(cell.subject);
      if (reference === undefined) {
        index.cells[cell.key] = { jobId: "", status: "failed", seconds: 0, error: `subject ${cell.subject ?? ""} was not generated` };
        outcome.failed.push(cell.key);
        save();
        continue;
      }
      spec = { prompt: options.editPrompt ?? EDIT_PROMPT, seed: EDIT_SEED, reference, ...(lora === undefined ? {} : { lora }) };
    } else {
      spec = { prompt: options.t2iPrompt ?? T2I_PROMPT, seed: EDIT_SEED, ratio: RATIO, ...(lora === undefined ? {} : { lora }) };
    }
    const { entry, bytes } = await run(cell.key, spec);
    index.cells[cell.key] = entry;
    if (bytes !== null) writeFileSync(path.join(options.outDir, cell.file), bytes);
    if (entry.status !== "done") outcome.failed.push(cell.key);
    save();
  }
  save();
  const complete = plan.cells.every((cell) => index.cells[cell.key]?.status === "done");
  report(`bench: finished: ${String(outcome.ran)} jobs run, ${String(outcome.skipped)} cells already done, ${String(outcome.failed.length)} failed${complete ? "" : "; the run is incomplete"}`);
  return { ...outcome, complete };
}
