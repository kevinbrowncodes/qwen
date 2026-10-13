import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  elementTable,
  type FetchInit,
  type FetchResponse,
  type Files,
  HandsApi,
  HandsRefusal,
  type HandsElement,
  type Look,
  nextStepNumber,
  pageWidth,
  parseArgs,
  parseStepName,
  readSettings,
  redactAct,
  runHands,
  signedOutVerdict,
  splitWait,
  stepBase,
} from "./hands-client.ts";

// A made-up token: the real one is only ever read from the owner's .env at run time.
const TOKEN = "fixture-token-0123456789";
const ENV = `CIVITAI_TOKEN=zzz\nHANDS_API_TOKEN=${TOKEN}\nHANDS_URL=http://hands.test/\n`;

function element(n: number, role: string, title: string, frame: readonly [number, number, number, number], extra: Partial<HandsElement> = {}): HandsElement {
  return { n, role, title, frame, actions: ["AXPress"], focusable: true, ...extra };
}

function look(id: string, elements: HandsElement[]): Look {
  return {
    id,
    taken_at: "2026-10-13T10:00:00+00:00",
    frontmost: { name: "Safari" },
    focused: null,
    width: 3840,
    height: 2160,
    scale: 2,
    elements,
    screenshot_url: `http://hands.test/hand/looks/${id}.png`,
    marked_url: `http://hands.test/hand/looks/${id}.marked.png`,
  };
}

const SIGNED_IN = [element(1, "AXWindow", "Qwen", [0, 0, 1920, 1055]), element(2, "AXWebArea", "", [0, 60, 1920, 995]), element(3, "AXButton", "New Chat", [20, 80, 120, 36]), element(4, "AXTextArea", "Ask Qwen", [400, 900, 800, 58], { value: "" })];
const SIGNED_OUT = [element(1, "AXWindow", "Qwen", [0, 0, 1920, 1055]), element(2, "AXWebArea", "", [0, 60, 1920, 995]), element(3, "AXButton", "Log in", [1700, 70, 80, 36]), element(4, "AXButton", "Sign up", [1790, 70, 80, 36])];

interface Recorded {
  url: string;
  init: FetchInit | undefined;
}

type Route = (url: string, init: FetchInit | undefined) => { status: number; body: unknown } | { status: number; bytes: Uint8Array };

function response(r: { status: number; body?: unknown; bytes?: Uint8Array }): FetchResponse {
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    json: () => Promise.resolve(r.body),
    text: () => Promise.resolve(JSON.stringify(r.body)),
    arrayBuffer: () => Promise.resolve((r.bytes ?? new Uint8Array()).buffer),
  };
}

/** A fake Hands: routes by method and path, records every request, serves pictures by name. */
function fakeHands(routes: Record<string, Route>) {
  const requests: Recorded[] = [];
  const fetchFn = (url: string, init?: FetchInit): Promise<FetchResponse> => {
    requests.push({ url, init });
    const method = init?.method ?? "GET";
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path.startsWith("/hand/looks/")) return Promise.resolve(response({ status: 200, bytes: new TextEncoder().encode(`PNG:${path}`) }));
    const route = routes[`${method} ${path}`];
    if (route === undefined) return Promise.resolve(response({ status: 404, body: { detail: `no route for ${method} ${path}` } }));
    return Promise.resolve(response(route(url, init)));
  };
  return { requests, fetchFn };
}

function memoryFiles() {
  const store = new Map<string, string | Uint8Array>();
  const files: Files = {
    list: (dir) => [...store.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)).filter((k) => !k.includes("/")),
    write: (file, data) => {
      store.set(file, data);
    },
    append: (file, line) => {
      const before = store.get(file);
      store.set(file, `${typeof before === "string" ? before : ""}${line}`);
    },
  };
  const text = (file: string): string => {
    const v = store.get(file);
    return typeof v === "string" ? v : new TextDecoder().decode(v ?? new Uint8Array());
  };
  return { store, files, text };
}

function run(args: string[], routes: Record<string, Route>, env = ENV, seed: Record<string, string> = {}) {
  const hands = fakeHands(routes);
  const mem = memoryFiles();
  for (const [file, content] of Object.entries(seed)) mem.files.write(file, content);
  const lines: string[] = [];
  const code = runHands(args, {
    env,
    files: mem.files,
    fetch: hands.fetchFn,
    outDir: "/out/2026-10-13/hands",
    out: (l) => {
      lines.push(l);
    },
    now: () => "2026-10-13T10:00:00.000Z",
  });
  return { code, lines, ...hands, ...mem };
}

const HEALTH: Route = () => ({ status: 200, body: { status: "ok", version: "1.16.2", commit: "f85c70a" } });
const HAND_OK: Route = () => ({ status: 200, body: { configured: true, ok: true, reason: "", trusted: { accessibility: true, screen_recording: true }, keyboard: { full_keyboard_access: true }, mac: "mac-studio-2022", display: { width: 1920, height: 1080, scale: 2 }, frontmost: { name: "Safari" } } });
const LOOK = (l: Look): Route => () => ({ status: 200, body: l });
const ACT = (l: Look | null, extra: Record<string, unknown> = {}): Route => () => ({ status: 200, body: { ok: true, id: "act1", do: "press", did: "AXPress", look: l, ...extra } });

describe("readSettings", () => {
  it("reads the token and the URL, trimming a trailing slash, and defaults the URL", () => {
    expect(readSettings(ENV)).toEqual({ url: "http://hands.test", token: TOKEN });
    expect(readSettings("HANDS_API_TOKEN=t\n")).toEqual({ url: "http://hands.local", token: "t" });
  });
});

describe("naming, redaction and waits", () => {
  it("parses <state>@<width> and refuses anything else", () => {
    expect(parseStepName("chat-multi-top@1920")).toEqual({ state: "chat-multi-top", width: 1920 });
    expect(parseStepName("Chat@1920")).toBeNull();
    expect(parseStepName("chat@desktop")).toBeNull();
  });

  it("takes the next free step number from the folder", () => {
    expect(nextStepNumber([])).toBe(1);
    expect(nextStepNumber(["01-a@1.json", "01-a@1.png", "02-b@1.json", "acts.jsonl"])).toBe(3);
    expect(stepBase(3, "b", 393)).toBe("03-b@393");
  });

  it("reduces typed text to a length and drops empty fields, as Hands does", () => {
    expect(redactAct({ do: "type", text: "hello", look: "", n: null })).toEqual({ do: "type", text_length: 5 });
    expect(redactAct({ do: "press", look: "abc", n: 7 })).toEqual({ do: "press", look: "abc", n: 7 });
  });

  it("splits a long wait into chunks within the cap", () => {
    expect(splitWait(70)).toEqual([30, 30, 10]);
    expect(splitWait(30)).toEqual([30]);
    expect(splitWait(5)).toEqual([5]);
  });

  it("reads the page width from the web area, else from the screen", () => {
    expect(pageWidth(look("a", SIGNED_IN))).toBe(1920);
    expect(pageWidth(look("b", [element(1, "AXWindow", "x", [0, 0, 100, 100])]))).toBe(1920);
  });

  it("cuts long titles to 40 characters in the table", () => {
    const long = "x".repeat(60);
    const [line] = elementTable(look("a", [element(1, "AXLink", long, [1, 2, 3, 4], { value: "v" })]));
    expect(line).toContain(`"${"x".repeat(39)}…"`);
    expect(line).toContain("[1, 2, 3, 4]");
    expect(line).toContain('= "v"');
  });

  it("calls the logged-out page signed-out, and nothing else", () => {
    expect(signedOutVerdict(look("a", SIGNED_OUT))).toBe("signed-out");
    expect(signedOutVerdict(look("b", SIGNED_IN))).toBe("not-signed-out");
  });

  it("parses the command line", () => {
    expect(parseArgs(["look", "--app", "Safari", "--as", "home@1920"])).toEqual({ command: "look", as: "home@1920", app: "Safari", positional: [] });
    expect(parseArgs(["act", '{"do":"key"}', "--as", "a@1"])).toEqual({ command: "act", as: "a@1", app: undefined, positional: ['{"do":"key"}'] });
    expect(parseArgs(["look", "--as"])).toBeNull();
    expect(parseArgs([])).toBeNull();
  });
});

describe("the API", () => {
  it("sends the bearer on /api/* and not on /health or the pictures, and surfaces Hands' detail", async () => {
    const hands = fakeHands({ "GET /health": HEALTH, "GET /api/hand": HAND_OK, "POST /api/hand/look": () => ({ status: 503, body: { detail: "the hand is not trusted: screen recording" } }) });
    const api = new HandsApi("http://hands.test", TOKEN, hands.fetchFn);
    await api.health();
    await api.hand();
    await api.picture("http://hands.test/hand/looks/x.png");
    await expect(api.look("Safari")).rejects.toThrow(HandsRefusal);
    await expect(api.look("Safari")).rejects.toThrow("the hand is not trusted: screen recording");
    const auth = hands.requests.map((r) => r.init?.headers?.["authorization"]);
    expect(auth[0]).toBeUndefined();
    expect(auth[1]).toBe(`Bearer ${TOKEN}`);
    expect(auth[2]).toBeUndefined();
    expect(auth[3]).toBe(`Bearer ${TOKEN}`);
  });

  it("names the URL and never a header when Hands cannot be reached", async () => {
    const api = new HandsApi("http://hands.test", TOKEN, () => Promise.reject(new Error("ECONNREFUSED")));
    await expect(api.health()).rejects.toThrow("Hands at http://hands.test/health could not be reached: ECONNREFUSED");
    await expect(api.health()).rejects.not.toThrow(TOKEN);
  });
});

describe("runHands", () => {
  it("stops with the verdict and no request when there is no token", async () => {
    const r = run(["preflight"], { "GET /health": HEALTH }, "CIVITAI_TOKEN=zzz\n");
    expect(await r.code).toBe(2);
    expect(r.lines).toContain("Hands token: none (put HANDS_API_TOKEN in the repo's .env; the value is API_TOKEN from Hands' own .env on the Mac)");
    expect(r.requests).toHaveLength(0);
  });

  it("prints the usage for an unknown command or a missing --as", async () => {
    const r = run(["dance"], {});
    expect(await r.code).toBe(2);
    expect(r.lines.join("\n")).toContain("usage: recon/run.sh hands <date> preflight");
    const s = run(["look"], { "GET /health": HEALTH, "POST /api/hand/look": LOOK(look("l1", SIGNED_IN)) });
    expect(await s.code).toBe(2);
  });

  it("saves a look as three files with the next step number, and logs it", async () => {
    const r = run(["look", "--app", "Safari", "--as", "home-signed-in@1920"], { "GET /health": HEALTH, "POST /api/hand/look": LOOK(look("l1", SIGNED_IN)) }, ENV, {
      "/out/2026-10-13/hands/01-preflight@1920.json": "{}",
      "/out/2026-10-13/hands/02-x@1920.json": "{}",
    });
    expect(await r.code).toBe(0);
    const names = r.files.list("/out/2026-10-13/hands").sort();
    expect(names).toEqual(["01-preflight@1920.json", "02-x@1920.json", "03-home-signed-in@1920.json", "03-home-signed-in@1920.marked.png", "03-home-signed-in@1920.png", "acts.jsonl"]);
    const record: unknown = JSON.parse(r.text("/out/2026-10-13/hands/03-home-signed-in@1920.json"));
    expect(record).toMatchObject({ id: "l1", step: "03-home-signed-in@1920", state: "home-signed-in", width: 1920, act: { do: "look", app: "Safari" }, hands: { version: "1.16.2", commit: "f85c70a" } });
    expect(r.text("/out/2026-10-13/hands/03-home-signed-in@1920.png")).toBe("PNG:/hand/looks/l1.png");
    expect(r.text("/out/2026-10-13/hands/03-home-signed-in@1920.marked.png")).toBe("PNG:/hand/looks/l1.marked.png");
    expect(r.text("/out/2026-10-13/hands/acts.jsonl")).toContain('"step":"03-home-signed-in@1920"');
    expect(r.lines.join("\n")).toContain('"New Chat"');
    expect(r.requests.find((q) => q.url.endsWith("/api/hand/look"))?.init?.body).toBe('{"app":"Safari"}');
  });

  it("records an act with its text as a length, and keeps the answer beside the look", async () => {
    const r = run(["act", '{"do":"type","text":"a red bicycle"}', "--as", "composer-typed@1920"], { "GET /health": HEALTH, "POST /api/hand/act": ACT(look("l2", SIGNED_IN), { result: "extra" }) });
    expect(await r.code).toBe(0);
    const json = r.text("/out/2026-10-13/hands/01-composer-typed@1920.json");
    expect(json).toContain('"text_length": 13');
    expect(json).not.toContain("a red bicycle");
    expect(json).toContain('"result": "extra"');
    const log = r.text("/out/2026-10-13/hands/acts.jsonl");
    expect(log).toContain('"text_length":13');
    expect(log).not.toContain("a red bicycle");
    expect(r.requests.find((q) => q.url.endsWith("/api/hand/act"))?.init?.body).toBe('{"do":"type","text":"a red bicycle"}');
  });

  it("splits a long wait, looks after a chunk that ran out, and stops on the first success", async () => {
    let waits = 0;
    const r = run(["act", '{"do":"wait","role":"AXImage","seconds":70}', "--as", "turn-done@1920"], {
      "GET /health": HEALTH,
      "POST /api/hand/look": LOOK(look("mid", SIGNED_IN)),
      "POST /api/hand/act": () => {
        waits += 1;
        return waits === 1 ? { status: 408, body: { detail: "no AXImage appeared in 30 s" } } : { status: 200, body: { ok: true, id: "a", do: "wait", did: "AXImage", look: look("done", SIGNED_IN) } };
      },
    });
    expect(await r.code).toBe(0);
    const bodies = r.requests.filter((q) => q.url.endsWith("/api/hand/act")).map((q) => JSON.parse(q.init?.body ?? "{}") as { seconds: number });
    expect(bodies.map((b) => b.seconds)).toEqual([30, 30]);
    const names = r.files.list("/out/2026-10-13/hands").sort();
    expect(names).toContain("01-turn-done@1920.wait1.json");
    expect(names).toContain("01-turn-done@1920.json");
    expect(names).not.toContain("01-turn-done@1920.wait2.json");
  });

  it("reports the last chunk's 408 in Hands' words and exits 1", async () => {
    const r = run(["act", '{"do":"wait","role":"AXImage","seconds":40}', "--as", "turn-done@1920"], {
      "GET /health": HEALTH,
      "POST /api/hand/look": LOOK(look("mid", SIGNED_IN)),
      "POST /api/hand/act": () => ({ status: 408, body: { detail: "no AXImage appeared in time" } }),
    });
    expect(await r.code).toBe(1);
    expect(r.lines).toContain("Hands refused (408): no AXImage appeared in time");
    expect(r.text("/out/2026-10-13/hands/acts.jsonl")).toContain("refused: Hands refused (408): no AXImage appeared in time");
  });

  it("surfaces a 409 and a 503 as Hands' sentences, writing only the log line", async () => {
    const r = run(["act", '{"do":"press","look":"old","n":3}', "--as", "x@1920"], { "GET /health": HEALTH, "POST /api/hand/act": () => ({ status: 409, body: { detail: "look old is no longer held: look again" } }) });
    expect(await r.code).toBe(1);
    expect(r.lines).toContain("Hands refused (409): look old is no longer held: look again");
    expect(r.files.list("/out/2026-10-13/hands")).toEqual(["acts.jsonl"]);
    const s = run(["look", "--as", "x@1920"], { "GET /health": HEALTH, "POST /api/hand/look": () => ({ status: 503, body: { detail: "Safari is not running" } }) });
    expect(await s.code).toBe(1);
    expect(s.lines).toContain("Hands refused (503): Safari is not running");
  });

  it("preflight prints the hand's state, saves one look of Safari, and calls the logged-out page signed-out", async () => {
    const r = run(["preflight"], { "GET /health": HEALTH, "GET /api/hand": HAND_OK, "POST /api/hand/look": LOOK(look("p", SIGNED_OUT)) });
    expect(await r.code).toBe(1);
    expect(r.lines).toContain("Hands 1.16.2 (f85c70a)");
    expect(r.lines).toContain("hand: ok=true; accessibility=true; screen recording=true; keyboard navigation=true");
    expect(r.lines.some((l) => l.startsWith("preflight: signed-out"))).toBe(true);
    expect(r.files.list("/out/2026-10-13/hands")).toContain("01-preflight@1920.json");
    const s = run(["preflight"], { "GET /health": HEALTH, "GET /api/hand": HAND_OK, "POST /api/hand/look": LOOK(look("p", SIGNED_IN)) });
    expect(await s.code).toBe(0);
    expect(s.lines).toContain("preflight: not signed out: read the picture");
  });

  it("preflight stops with the hand's reason when it is not ready", async () => {
    const r = run(["preflight"], { "GET /health": HEALTH, "GET /api/hand": () => ({ status: 200, body: { configured: true, ok: false, reason: "the hand is not trusted: screen recording" } }) });
    expect(await r.code).toBe(1);
    expect(r.lines).toContain("preflight: the hand is not ready: the hand is not trusted: screen recording");
    expect(r.requests.map((q) => q.url)).not.toContain("http://hands.test/api/hand/look");
  });

  it("never lets the token into a file or a printed line", async () => {
    const r = run(["act", '{"do":"press","look":"l","n":1}', "--as", "x@1920"], { "GET /health": HEALTH, "POST /api/hand/act": ACT(look("l3", SIGNED_IN)) });
    await r.code;
    const everything = [...r.lines, ...[...r.store.keys()].map((k) => r.text(k))].join("\n");
    expect(everything).not.toContain(TOKEN);
    const s = run(["preflight"], { "GET /health": () => ({ status: 401, body: { detail: "not authorized" } }) });
    await s.code;
    expect([...s.lines].join("\n")).not.toContain(TOKEN);
  });
});

describe("the client can only reach Hands", () => {
  it("never names the reference in hands.ts, hands-client.ts or env-file.ts", () => {
    const dir = new URL(".", import.meta.url);
    const files = readdirSync(dir).filter((f) => ["hands.ts", "hands-client.ts", "env-file.ts"].includes(f));
    expect(files).toHaveLength(3);
    for (const f of files) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/REFERENCE_URL/);
      expect(src, f).not.toMatch(/qwen\.ai/);
    }
  });
});
