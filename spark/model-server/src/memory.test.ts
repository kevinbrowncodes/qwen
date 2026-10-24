import { describe, expect, it } from "vitest";
import { createMemory, DEFAULT_AGENT, memoryFromEnv, ordinal, waitingNote } from "./memory.ts";

/** A memory agent as the fetch sees it (PATHS STORY_101's contract): records what it was asked, answers from a script. */
function agent(answers: Array<{ status: number; body?: unknown } | "down">) {
  const seen: Array<{ method: string; url: string; body: unknown; auth: string }> = [];
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ method: init?.method ?? "GET", url: href, body, auth: headers.get("authorization") ?? "" });
    const next = answers.shift() ?? { status: 500 };
    if (next === "down") return Promise.reject(new TypeError("fetch failed"));
    return Promise.resolve(new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status }));
  }) as typeof fetch;
  return { seen, fetchFn };
}

const lines = (): { log: (l: string) => void; said: string[] } => {
  const said: string[] = [];
  return { said, log: (l) => said.push(l) };
};

describe("the memory client (STORY_041)", () => {
  it("is off without a token, grants every image, and says so once", async () => {
    const { said, log } = lines();
    const { seen, fetchFn } = agent([]);
    const memory = createMemory({ log, fetch: fetchFn });
    expect(memory.enabled).toBe(false);
    expect(await memory.ask("j1")).toEqual({ id: null, granted: true, position: 0, note: "" });
    expect(await memory.renew("x")).toBe(true);
    await memory.release("x");
    expect(seen).toEqual([]);
    expect(said.filter((l) => l.includes("memory leases are off"))).toHaveLength(1);
  });

  it("asks for the image's share on the qwen-model service, with the token", async () => {
    const { seen, fetchFn } = agent([{ status: 202, body: { id: "a".repeat(32), status: "granted", position: 0 } }]);
    const memory = createMemory({ token: "t", agent: "http://agent.test:8700/", gb: 40, fetch: fetchFn, log: () => undefined });
    expect(await memory.ask("j1")).toEqual({ id: "a".repeat(32), granted: true, position: 0, note: "" });
    expect(seen[0]).toEqual({
      method: "POST",
      url: "http://agent.test:8700/api/leases",
      body: { holder: "qwen-model", service: "qwen-model", kind: "image", job: "j1", gb: 40, class: "normal" },
      auth: "Bearer t",
    });
  });

  it("says where a waiting image stands in line, and renews a carried lease to keep its place", async () => {
    const { seen, fetchFn } = agent([
      { status: 202, body: { id: "L1", status: "waiting", position: 2 } },
      { status: 200, body: { id: "L1", status: "waiting", position: 1 } },
      { status: 200, body: { id: "L1", status: "granted", position: 0 } },
    ]);
    const memory = createMemory({ token: "t", fetch: fetchFn, log: () => undefined });
    expect(await memory.ask("j1")).toEqual({ id: "L1", granted: false, position: 2, note: "Waiting for memory on the Ultra (2nd in line)" });
    expect((await memory.ask("j1", "L1")).note).toBe("Waiting for memory on the Ultra (1st in line)");
    expect((await memory.ask("j1", "L1")).granted).toBe(true);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `POST ${DEFAULT_AGENT}/api/leases`,
      `POST ${DEFAULT_AGENT}/api/leases/L1/renew`,
      `POST ${DEFAULT_AGENT}/api/leases/L1/renew`,
    ]);
  });

  it("asks afresh when the agent no longer knows the lease", async () => {
    const { seen, fetchFn } = agent([{ status: 404, body: { error: "no such lease" } }, { status: 202, body: { id: "L2", status: "granted", position: 0 } }]);
    const memory = createMemory({ token: "t", fetch: fetchFn, log: () => undefined });
    expect((await memory.ask("j1", "L1")).id).toBe("L2");
    expect(seen.map((s) => s.url.split("/api")[1])).toEqual(["/leases/L1/renew", "/leases"]);
  });

  it("makes the image wait, with the reason, when the agent is down or refuses", async () => {
    const { said, log } = lines();
    const down = createMemory({ token: "t", fetch: agent(["down"]).fetchFn, log });
    expect(await down.ask("j1", "L9")).toEqual({ id: "L9", granted: false, position: 0, note: "The memory agent on the Ultra does not answer" });
    const refusing = createMemory({ token: "t", fetch: agent([{ status: 401, body: {} }]).fetchFn, log });
    expect((await refusing.ask("j1")).note).toBe("The memory agent on the Ultra refused (401)");
    expect(said.some((l) => l.includes("image j1 waits"))).toBe(true);
  });

  it("renews and releases, and a lost lease or a down agent is only a log line", async () => {
    const { said, log } = lines();
    const { seen, fetchFn } = agent([{ status: 200, body: {} }, { status: 404, body: {} }, { status: 204 }, "down"]);
    const memory = createMemory({ token: "t", fetch: fetchFn, log });
    expect(await memory.renew("L1")).toBe(true);
    expect(await memory.renew("L1")).toBe(false);
    await memory.release("L1");
    await memory.release("L1");
    expect(seen.map((s) => s.method)).toEqual(["POST", "POST", "DELETE", "DELETE"]);
    expect(said.some((l) => l.includes("is gone"))).toBe(true);
    expect(said.some((l) => l.includes("not released"))).toBe(true);
    expect(await createMemory({ token: "t", fetch: agent(["down"]).fetchFn, log }).renew("L1")).toBe(false);
  });

  it("reads its settings from the environment", () => {
    const memory = memoryFromEnv({ MEMORY_TOKEN: "t", MEMORY_LEASE_GB: "20" }, () => undefined);
    expect(memory.enabled).toBe(true);
    expect(memory.gb).toBe(20);
    expect(memoryFromEnv({ MEMORY_LEASE_GB: "nope" }, () => undefined).gb).toBe(48);
    expect(memoryFromEnv({}, () => undefined).enabled).toBe(false);
  });

  it("words its place in line", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
    expect(waitingNote("the Ultra", 0)).toBe("Waiting for memory on the Ultra");
  });
});
