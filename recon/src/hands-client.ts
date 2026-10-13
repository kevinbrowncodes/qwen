/**
 * The pure half of `recon/run.sh hands` (STORY_027, EPIC_006): what is sent to Hands, what comes back, how each
 * look is named and saved, and what is printed so the next act can be chosen. Everything that touches the network
 * or the disk comes in through `Deps`, so the tests drive it with a fake fetch and an in-memory file system.
 *
 * The only host this module ever addresses is HANDS_URL. It never names the reference, and a test says so.
 *
 * Hands keeps only its newest 50 looks and deletes the rest, so every look is saved the moment it arrives: the JSON
 * as Hands gave it (plus the step, the asserted width, the act that produced it with typed text reduced to a
 * length, and Hands' version), the screen, and the screen with every element's number drawn on it.
 */
import { envValue } from "./env-file.ts";

export const DEFAULT_HANDS_URL = "http://hands.local";
/** Hands refuses a wait longer than this (native/hand/server.py: `seconds` ≤ 30). */
export const WAIT_CAP_SECONDS = 30;
export const TITLE_CUT = 40;
export const RETENTION_NOTE = "Saved at once: Hands keeps only its newest 50 looks (app/services/hand.py, KEEP) and deletes the rest.";

export type Frame = readonly [number, number, number, number];

export interface HandsElement {
  readonly n: number;
  readonly role: string;
  readonly title: string;
  readonly value?: string;
  /** [x, y, w, h] in screen points. */
  readonly frame: Frame;
  readonly actions: readonly string[];
  readonly focusable: boolean;
}

export interface Look {
  readonly id: string;
  readonly taken_at: string;
  readonly frontmost: Record<string, unknown>;
  readonly focused: unknown;
  /** The picture's size in pixels; frames are in points, pixels are points × scale. */
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly elements: readonly HandsElement[];
  readonly screenshot_url: string;
  readonly marked_url: string;
}

export interface ActAnswer {
  readonly ok: boolean;
  readonly id: string;
  readonly do: string;
  readonly did: string;
  readonly look: Look | null;
  readonly [key: string]: unknown;
}

export interface HandsVersion {
  readonly version: string;
  readonly commit: string;
}

// --- Settings ---------------------------------------------------------------------------------------------------

export interface Settings {
  readonly url: string;
  readonly token: string | undefined;
  /** The owner's chat on the reference, for the routine file's placeholder (STORY_028); never printed. */
  readonly chatUrl: string | undefined;
}

/** HANDS_URL, HANDS_API_TOKEN and HANDS_CHAT_URL from the text of the repo's .env; the token is never printed by anything here. */
export function readSettings(envText: string): Settings {
  const url = (envValue(envText, "HANDS_URL") ?? DEFAULT_HANDS_URL).replace(/\/+$/, "");
  return { url, token: envValue(envText, "HANDS_API_TOKEN"), chatUrl: envValue(envText, "HANDS_CHAT_URL") };
}

// --- Type guards over what Hands answers ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFrame(v: unknown): v is Frame {
  return Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number");
}

export function isElement(v: unknown): v is HandsElement {
  return (
    isRecord(v) &&
    typeof v["n"] === "number" &&
    typeof v["role"] === "string" &&
    typeof v["title"] === "string" &&
    (v["value"] === undefined || v["value"] === null || typeof v["value"] === "string") &&
    isFrame(v["frame"]) &&
    Array.isArray(v["actions"]) &&
    typeof v["focusable"] === "boolean"
  );
}

export function isLook(v: unknown): v is Look {
  return (
    isRecord(v) &&
    typeof v["id"] === "string" &&
    typeof v["taken_at"] === "string" &&
    isRecord(v["frontmost"]) &&
    typeof v["width"] === "number" &&
    typeof v["height"] === "number" &&
    typeof v["scale"] === "number" &&
    Array.isArray(v["elements"]) &&
    v["elements"].every(isElement) &&
    typeof v["screenshot_url"] === "string" &&
    typeof v["marked_url"] === "string"
  );
}

export function isActAnswer(v: unknown): v is ActAnswer {
  return isRecord(v) && typeof v["ok"] === "boolean" && typeof v["id"] === "string" && typeof v["do"] === "string" && typeof v["did"] === "string" && (v["look"] === null || isLook(v["look"]));
}

// --- The API -------------------------------------------------------------------------------------------------------

export interface FetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBufferLike>;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/** Hands said no. The message is Hands' own `detail` sentence, which a person can act on. */
export class HandsRefusal extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Hands answered ${String(status)}: ${detail}`);
    this.name = "HandsRefusal";
  }
}

/** Hands could not be reached at all. The message carries the URL tried and never a header. */
export class HandsUnreachable extends Error {
  constructor(url: string, cause: string) {
    super(`Hands at ${url} could not be reached: ${cause}`);
    this.name = "HandsUnreachable";
  }
}

export class HandsApi {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchFn: FetchLike,
  ) {}

  private async request(path: string, init: FetchInit, auth: boolean): Promise<FetchResponse> {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (auth) headers["authorization"] = `Bearer ${this.token}`;
    const url = `${this.url}${path}`;
    try {
      return await this.fetchFn(url, { ...init, headers });
    } catch (error) {
      throw new HandsUnreachable(url, error instanceof Error ? error.message : String(error));
    }
  }

  private async json(path: string, init: FetchInit, auth: boolean): Promise<unknown> {
    const response = await this.request(path, init, auth);
    if (!response.ok) {
      let detail = "";
      try {
        const body: unknown = await response.json();
        if (isRecord(body) && typeof body["detail"] === "string") detail = body["detail"];
      } catch {
        detail = "";
      }
      throw new HandsRefusal(response.status, detail === "" ? `HTTP ${String(response.status)} with no detail` : detail);
    }
    return response.json();
  }

  /** `GET /health` (no token): Hands' version and commit. */
  async health(): Promise<HandsVersion> {
    const body = await this.json("/health", { method: "GET" }, false);
    if (!isRecord(body) || typeof body["version"] !== "string" || typeof body["commit"] !== "string") throw new HandsRefusal(200, "/health did not carry a version and a commit");
    return { version: body["version"], commit: body["commit"] };
  }

  /** `GET /api/hand`: whether the hand is set up, reachable and trusted, with its health when it answers. */
  async hand(): Promise<Record<string, unknown>> {
    const body = await this.json("/api/hand", { method: "GET" }, true);
    if (!isRecord(body)) throw new HandsRefusal(200, "/api/hand did not answer with an object");
    return body;
  }

  /** `POST /api/hand/look`: one look, of the front app or of the app named. */
  async look(app?: string): Promise<Look> {
    const body = await this.json("/api/hand/look", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(app === undefined ? {} : { app }) }, true);
    if (!isLook(body)) throw new HandsRefusal(200, "/api/hand/look did not answer with a look");
    return body;
  }

  /** `POST /api/hand/act`: one act, with the look after it. Any `do` Hands accepts passes through unchanged. */
  async act(act: Record<string, unknown>): Promise<ActAnswer> {
    const body = await this.json("/api/hand/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(act) }, true);
    if (!isActAnswer(body)) throw new HandsRefusal(200, "/api/hand/act did not answer with an act");
    return body;
  }

  /** `POST /api/routines`: a routine created from its name and steps (STORY_028); Hands' description of it. */
  async routine(name: string, steps: readonly unknown[]): Promise<Record<string, unknown>> {
    const body = await this.json("/api/routines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, steps }) }, true);
    if (!isRecord(body)) throw new HandsRefusal(200, "/api/routines did not answer with an object");
    return body;
  }

  /** `PUT /api/routines/{slug}`: the steps replaced (STORY_028). */
  async replaceRoutine(slug: string, steps: readonly unknown[]): Promise<Record<string, unknown>> {
    const body = await this.json(`/api/routines/${encodeURIComponent(slug)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ steps }) }, true);
    if (!isRecord(body)) throw new HandsRefusal(200, "/api/routines did not answer with an object");
    return body;
  }

  /** A look's picture by the URL Hands gave; the route needs no token, so none is sent. */
  async picture(url: string): Promise<Uint8Array> {
    let response: FetchResponse;
    try {
      response = await this.fetchFn(url, { method: "GET" });
    } catch (error) {
      throw new HandsUnreachable(url, error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) throw new HandsRefusal(response.status, `the picture at ${url} was not served`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

// --- Naming, redaction, waits --------------------------------------------------------------------------------------

const STEP_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/;

/** `<state>@<width>`, the 2026-09-26 grammar; null for anything else. */
export function parseStepName(name: string): { state: string; width: number } | null {
  const m = STEP_NAME.exec(name);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { state: m[1], width: Number(m[2]) };
}

/** The next free step number, from the `NN-` prefixes already in the folder; 1 when there are none. */
export function nextStepNumber(existing: readonly string[]): number {
  let max = 0;
  for (const name of existing) {
    const m = /^(\d{2,})-/.exec(name);
    if (m?.[1] !== undefined) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export function stepBase(nn: number, state: string, width: number): string {
  return `${String(nn).padStart(2, "0")}-${state}@${String(width)}`;
}

/** Hands' own redaction (app/services/hand.py `redact`): typed text becomes its length, every other field stays. */
export function redactAct(act: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(act)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "text") out["text_length"] = typeof v === "string" ? v.length : String(v).length;
    else out[k] = v;
  }
  return out;
}

/** A wait of N seconds as chunks Hands accepts: [30, 30, 10] for 70; [N] when N is within the cap. */
export function splitWait(seconds: number, cap = WAIT_CAP_SECONDS): number[] {
  if (seconds <= cap) return [seconds];
  const chunks: number[] = [];
  let left = seconds;
  while (left > 0) {
    chunks.push(Math.min(cap, left));
    left -= cap;
  }
  return chunks;
}

// --- Reading a look ------------------------------------------------------------------------------------------------

export function findRole(look: Look, role: string): HandsElement | undefined {
  return look.elements.find((e) => e.role === role);
}

/** The page's width in points, from the web area's frame; the whole screen's width when there is no web area. */
export function pageWidth(look: Look): number {
  const area = findRole(look, "AXWebArea");
  return area ? area.frame[2] : Math.round(look.width / look.scale);
}

function cut(text: string, max = TITLE_CUT): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** One line per element, for choosing the next act from the terminal: n, role, title, value, frame. */
export function elementTable(look: Look): string[] {
  return look.elements.map((e) => {
    const value = e.value === undefined || e.value === "" ? "" : ` = ${JSON.stringify(cut(e.value))}`;
    return `  ${String(e.n).padStart(3)}  ${e.role.padEnd(18)} ${JSON.stringify(cut(e.title))}${value}  [${e.frame.join(", ")}]`;
  });
}

/** The reference's logged-out page shows Log in and Sign up buttons (EPIC_001, 2026-09-26). Nothing else is claimed. */
export function signedOutVerdict(look: Look): "signed-out" | "not-signed-out" {
  const out = look.elements.some((e) => e.role === "AXButton" && /^(log in|sign up)$/i.test(e.title.trim()));
  return out ? "signed-out" : "not-signed-out";
}

// --- Running a command -----------------------------------------------------------------------------------------

export interface Files {
  /** The names in a folder; [] when it does not exist. */
  list(dir: string): string[];
  /** A file's text, or null when it cannot be read. */
  read(path: string): string | null;
  /** Writes a file, creating its folders. */
  write(path: string, data: string | Uint8Array): void;
  /** Appends one line to a file, creating it and its folders. */
  append(path: string, line: string): void;
}

export interface Deps {
  /** The text of the repo's .env, or "" when there is none. */
  readonly env: string;
  readonly files: Files;
  readonly fetch: FetchLike;
  /** recon/out/<date>/hands */
  readonly outDir: string;
  /** recon/hands/reads: the committed JavaScript reads (STORY_028). */
  readonly readsDir: string;
  /** recon/hands/routines: the committed routine files (STORY_028). */
  readonly routinesDir: string;
  readonly out: (line: string) => void;
  readonly now: () => string;
}

export const USAGE = [
  "usage: recon/run.sh hands <date> preflight",
  "       recon/run.sh hands <date> look [--app <name>] --as <state>@<width>",
  "       recon/run.sh hands <date> act '<json>' --as <state>@<width>",
  "       recon/run.sh hands <date> js <file under recon/hands/reads/> --as <state>@<width>",
  "       recon/run.sh hands <date> routine <file under recon/hands/routines/>",
  "The token and HANDS_URL come from the repo's .env (HANDS_API_TOKEN, HANDS_URL, HANDS_CHAT_URL); see README → Running Recon.",
].join("\n");

/** The routine file's stand-in for the owner's chat URL, filled from .env at upload time (STORY_028). */
export const CHAT_URL_PLACEHOLDER = "{{HANDS_CHAT_URL}}";

const COMMANDS = ["preflight", "look", "act", "js", "routine"];

interface Parsed {
  readonly command: string;
  readonly as: string | null;
  readonly app: string | undefined;
  readonly positional: string[];
}

export function parseArgs(args: readonly string[]): Parsed | null {
  const [command, ...rest] = args;
  if (command === undefined) return null;
  let as: string | null = null;
  let app: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--as") {
      const v = rest[i + 1];
      if (v === undefined) return null;
      as = v;
      i += 1;
    } else if (a === "--app") {
      const v = rest[i + 1];
      if (v === undefined) return null;
      app = v;
      i += 1;
    } else if (a !== undefined) {
      positional.push(a);
    }
  }
  return { command, as, app, positional };
}

/** Hands' own slug rule (app/services/routines.py `slugify`), so a replace names the routine it created. */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "routine" : slug;
}

/** Every string in a routine's steps with the placeholder replaced; `left` says whether any placeholder remains. */
export function fillPlaceholder(steps: readonly unknown[], chatUrl: string | undefined): { steps: unknown[]; left: boolean } {
  let left = false;
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!v.includes(CHAT_URL_PLACEHOLDER)) return v;
      if (chatUrl === undefined) {
        left = true;
        return v;
      }
      return v.split(CHAT_URL_PLACEHOLDER).join(chatUrl);
    }
    if (Array.isArray(v)) return v.map(fill);
    if (isRecord(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = fill(x);
      return out;
    }
    return v;
  };
  return { steps: steps.map(fill), left };
}

class Session {
  private readonly api: HandsApi;
  private hands: HandsVersion | null = null;

  constructor(
    private readonly deps: Deps,
    url: string,
    token: string,
  ) {
    this.api = new HandsApi(url, token, deps.fetch);
  }

  async version(): Promise<HandsVersion> {
    this.hands ??= await this.api.health();
    return this.hands;
  }

  get hand(): HandsApi {
    return this.api;
  }

  path(name: string): string {
    return `${this.deps.outDir}/${name}`;
  }

  /** Saves a look as three files under `base` and returns their names; the JSON carries what the AC lists. */
  async save(look: Look, base: string, state: string, width: number, act: Record<string, unknown> | null, answer: Record<string, unknown> | null): Promise<string[]> {
    const hands = await this.version();
    const [png, marked] = await Promise.all([this.api.picture(look.screenshot_url), this.api.picture(look.marked_url)]);
    const record = { ...look, step: base, state, width, act, answer, hands, _note: RETENTION_NOTE };
    const jsonName = `${base}.json`;
    const pngName = `${base}.png`;
    const markedName = `${base}.marked.png`;
    this.deps.files.write(this.path(jsonName), `${JSON.stringify(record, null, 2)}\n`);
    this.deps.files.write(this.path(pngName), png);
    this.deps.files.write(this.path(markedName), marked);
    return [jsonName, pngName, markedName];
  }

  log(entry: Record<string, unknown>): void {
    this.deps.files.append(this.path("acts.jsonl"), `${JSON.stringify({ at: this.deps.now(), ...entry })}\n`);
  }

  /** What is printed after a look is saved: the files, the front app, the focus, the frames and the elements. */
  describe(look: Look, names: readonly string[]): void {
    const { out } = this.deps;
    out(`saved: ${names.join(", ")}`);
    out(`front: ${JSON.stringify(look.frontmost)}; focused: ${JSON.stringify(look.focused)}; ${String(look.width)}×${String(look.height)} px at ${String(look.scale)}×`);
    const win = findRole(look, "AXWindow");
    const area = findRole(look, "AXWebArea");
    out(`window: ${win ? `[${win.frame.join(", ")}]` : "none"}; web area: ${area ? `[${area.frame.join(", ")}]` : "none"}`);
    out(`elements (${String(look.elements.length)}):`);
    for (const line of elementTable(look)) out(line);
  }

  nextBase(state: string, width: number): string {
    return stepBase(nextStepNumber(this.deps.files.list(this.deps.outDir)), state, width);
  }
}

function refusalLine(error: unknown): string {
  if (error instanceof HandsRefusal) return `Hands refused (${String(error.status)}): ${error.detail}`;
  if (error instanceof HandsUnreachable) return error.message;
  return error instanceof Error ? error.message : String(error);
}

async function preflight(session: Session, deps: Deps): Promise<number> {
  const hands = await session.version();
  deps.out(`Hands ${hands.version} (${hands.commit})`);
  const status = await session.hand.hand();
  const trusted = isRecord(status["trusted"]) ? status["trusted"] : {};
  const keyboard = isRecord(status["keyboard"]) ? status["keyboard"] : {};
  deps.out(`hand: ok=${String(status["ok"] === true)}; accessibility=${String(trusted["accessibility"])}; screen recording=${String(trusted["screen_recording"])}; keyboard navigation=${String(keyboard["full_keyboard_access"])}`);
  deps.out(`mac: ${JSON.stringify(status["mac"] ?? null)}; display: ${JSON.stringify(status["display"] ?? null)}; front: ${JSON.stringify(status["frontmost"] ?? null)}`);
  if (status["ok"] !== true) {
    deps.out(`preflight: the hand is not ready: ${typeof status["reason"] === "string" ? status["reason"] : "no reason given"}`);
    return 1;
  }
  const look = await session.hand.look("Safari");
  const width = pageWidth(look);
  const base = session.nextBase("preflight", width);
  const names = await session.save(look, base, "preflight", width, { do: "look", app: "Safari" }, null);
  session.log({ step: base, do: "look", act: { app: "Safari" }, outcome: "looked", look: look.id, files: names });
  session.describe(look, names);
  const verdict = signedOutVerdict(look);
  deps.out(verdict === "signed-out" ? "preflight: signed-out (the page shows Log in / Sign up); the owner signs in to the reference in Safari on the Mac" : "preflight: not signed out: read the picture");
  return verdict === "signed-out" ? 1 : 0;
}

async function lookCommand(session: Session, parsed: Parsed): Promise<number> {
  const name = parsed.as === null ? null : parseStepName(parsed.as);
  if (name === null) return 2;
  const look = await session.hand.look(parsed.app);
  const base = session.nextBase(name.state, name.width);
  const act: Record<string, unknown> = parsed.app === undefined ? { do: "look" } : { do: "look", app: parsed.app };
  const names = await session.save(look, base, name.state, name.width, act, null);
  session.log({ step: base, do: "look", act: redactAct(act), outcome: "looked", look: look.id, files: names });
  session.describe(look, names);
  return 0;
}

function answerWithoutLook(answer: ActAnswer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answer)) if (k !== "look") out[k] = v;
  return out;
}

/** A text result (a js act's, STORY_028) goes to its own file; the saved answer names the file instead. */
function keepResult(session: Session, deps: Deps, base: string, rest: Record<string, unknown>): string[] {
  const result = rest["result"];
  if (typeof result !== "string") return [];
  const name = `${base}.result.txt`;
  deps.files.write(session.path(name), result);
  delete rest["result"];
  rest["result_file"] = name;
  const firstLine = result.split("\n")[0] ?? "";
  deps.out(`result: ${String(result.length)} characters, saved as ${name}; first line: ${JSON.stringify(firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine)}`);
  return [name];
}

/** One act (or its chunks, for a long wait), saved and logged; the exit code. */
async function performAct(session: Session, deps: Deps, name: { state: string; width: number }, act: Record<string, unknown>): Promise<number> {
  const base = session.nextBase(name.state, name.width);
  const seconds = act["seconds"];
  const chunks = act["do"] === "wait" && typeof seconds === "number" ? splitWait(seconds) : [null];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const body: Record<string, unknown> = chunk === null ? act : { ...act, seconds: chunk };
    const last = i === chunks.length - 1;
    try {
      const answer = await session.hand.act(body);
      const rest = answerWithoutLook(answer);
      const extra = keepResult(session, deps, base, rest);
      if (answer.look === null) {
        const actName = `${base}.act.json`;
        deps.files.write(session.path(actName), `${JSON.stringify({ step: base, act: redactAct(body), answer: rest }, null, 2)}\n`);
        session.log({ step: base, do: answer.do, act: redactAct(body), outcome: answer.did, look: null, files: [actName, ...extra] });
        deps.out(`saved: ${actName} (Hands returned no look)`);
        deps.out(`did: ${answer.did}`);
        return 0;
      }
      const names = await session.save(answer.look, base, name.state, name.width, redactAct(body), rest);
      session.log({ step: base, do: answer.do, act: redactAct(body), outcome: answer.did, look: answer.look.id, files: [...names, ...extra] });
      deps.out(`did: ${answer.did}`);
      session.describe(answer.look, names);
      return 0;
    } catch (error) {
      if (error instanceof HandsRefusal && error.status === 408 && !last) {
        // The wait ran out before its total did: look so the screen mid-wait is on disk, then wait again.
        const mid = await session.hand.look();
        const midBase = `${base}.wait${String(i + 1)}`;
        const names = await session.save(mid, midBase, name.state, name.width, redactAct(body), null);
        session.log({ step: midBase, do: "wait", act: redactAct(body), outcome: "ran out; looked, waiting again", look: mid.id, files: names });
        deps.out(`wait ${String(i + 1)}/${String(chunks.length)} ran out; saved ${midBase} and waiting again`);
        continue;
      }
      session.log({ step: base, do: act["do"], act: redactAct(body), outcome: `refused: ${refusalLine(error)}`, look: null, files: [] });
      deps.out(refusalLine(error));
      return 1;
    }
  }
  return 1;
}

async function actCommand(session: Session, deps: Deps, parsed: Parsed): Promise<number> {
  const name = parsed.as === null ? null : parseStepName(parsed.as);
  const raw = parsed.positional[0];
  if (name === null || raw === undefined) return 2;
  let act: unknown;
  try {
    act = JSON.parse(raw);
  } catch {
    deps.out("act: the argument is not JSON");
    return 2;
  }
  if (!isRecord(act) || typeof act["do"] !== "string" || act["do"] === "") {
    deps.out('act: the JSON needs a "do"');
    return 2;
  }
  return performAct(session, deps, name, act);
}

/** `js <file> --as <state>@<width>`: the committed read sent as a js act (STORY_028); its result saved beside the look. */
async function jsCommand(session: Session, deps: Deps, parsed: Parsed): Promise<number> {
  const name = parsed.as === null ? null : parseStepName(parsed.as);
  const file = parsed.positional[0];
  if (name === null || file === undefined) return 2;
  const source = deps.files.read(`${deps.readsDir}/${file}`);
  if (source === null || source.trim() === "") {
    deps.out(`js: no read named ${file} under recon/hands/reads/`);
    return 2;
  }
  return performAct(session, deps, name, { do: "js", text: source });
}

/** `routine <file>`: the committed routine created in Hands, or replaced when its name exists (STORY_028). */
async function routineCommand(session: Session, deps: Deps, parsed: Parsed, chatUrl: string | undefined): Promise<number> {
  const file = parsed.positional[0];
  if (file === undefined) return 2;
  const text = deps.files.read(`${deps.routinesDir}/${file}`);
  if (text === null) {
    deps.out(`routine: no file named ${file} under recon/hands/routines/`);
    return 2;
  }
  let parsedFile: unknown;
  try {
    parsedFile = JSON.parse(text);
  } catch {
    deps.out(`routine: ${file} is not JSON`);
    return 2;
  }
  if (!isRecord(parsedFile) || typeof parsedFile["name"] !== "string" || parsedFile["name"].trim() === "" || !Array.isArray(parsedFile["steps"]) || parsedFile["steps"].length === 0) {
    deps.out(`routine: ${file} needs a name and a non-empty list of steps`);
    return 2;
  }
  const routineName = parsedFile["name"];
  const { steps, left } = fillPlaceholder(parsedFile["steps"], chatUrl);
  if (left) {
    deps.out(`routine: ${file} names ${CHAT_URL_PLACEHOLDER} and HANDS_CHAT_URL is not in .env`);
    return 2;
  }
  const slug = slugify(routineName);
  try {
    await session.hand.routine(routineName, steps);
    deps.out(`routine ${slug}: created, ${String(steps.length)} steps`);
    return 0;
  } catch (error) {
    if (!(error instanceof HandsRefusal && error.status === 422 && error.detail.includes("already exists"))) {
      deps.out(refusalLine(error));
      return 1;
    }
  }
  try {
    await session.hand.replaceRoutine(slug, steps);
    deps.out(`routine ${slug}: replaced, ${String(steps.length)} steps`);
    return 0;
  } catch (error) {
    deps.out(refusalLine(error));
    return 1;
  }
}

/** Runs one `hands` command and returns the exit code: 0 done, 1 Hands said no or is not ready, 2 usage or configuration. */
export async function runHands(args: readonly string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed === null || !COMMANDS.includes(parsed.command)) {
    deps.out(USAGE);
    return 2;
  }
  const settings = readSettings(deps.env);
  if (settings.token === undefined) {
    deps.out("Hands token: none (put HANDS_API_TOKEN in the repo's .env; the value is API_TOKEN from Hands' own .env on the Mac)");
    return 2;
  }
  deps.out("Hands token: found in .env");
  const session = new Session(deps, settings.url, settings.token);
  try {
    let code: number;
    if (parsed.command === "preflight") code = await preflight(session, deps);
    else if (parsed.command === "look") code = await lookCommand(session, parsed);
    else if (parsed.command === "act") code = await actCommand(session, deps, parsed);
    else if (parsed.command === "js") code = await jsCommand(session, deps, parsed);
    else code = await routineCommand(session, deps, parsed, settings.chatUrl);
    if (code === 2) deps.out(USAGE);
    return code;
  } catch (error) {
    deps.out(refusalLine(error));
    return 1;
  }
}
