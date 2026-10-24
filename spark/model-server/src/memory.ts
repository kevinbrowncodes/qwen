/**
 * The Ultra's memory, asked before each image (STORY_041, PATHS EPIC_023). The memory agent on this Mac
 * (PATHS memory/agent.py, port 8700) grants each heavy job its share in the order asked; this is its client, in the
 * shape of the PATHS template's app/memory.py: one lease per image, asked before the worker is sent the job, renewed
 * while it runs, given back however it ends.
 *
 * Env, from ~/qwen-model/.env through spark/mac/start.sh: MEMORY_TOKEN (the agent's token; unset, leases are off and
 * every ask is granted, said once), MEMORY_AGENT (default http://127.0.0.1:8700), MEMORY_LEASE_GB (the image's
 * working set on top of the loaded model, which the agent already charges as the qwen-model service's standing
 * reservation; default 48, start.sh's NEED_GIB, until PATHS CHORE_036 measures it). An agent that does not answer
 * makes the image wait, saying so: starting anyway would be the 2026-10-23 panic.
 */

export interface MemoryOptions {
  readonly token?: string;
  readonly agent?: string;
  readonly gb?: number;
  readonly label?: string;
  readonly log?: (line: string) => void;
  /** The fetch to use; tests pass one that answers as the agent would. */
  readonly fetch?: typeof fetch;
}

export interface Answer {
  /** The agent's lease id; null while the agent cannot be asked. */
  readonly id: string | null;
  readonly granted: boolean;
  readonly position: number;
  /** The words a waiting job shows ("Waiting for memory on the Ultra (2nd in line)"), "" once granted. */
  readonly note: string;
}

export interface Memory {
  readonly enabled: boolean;
  readonly gb: number;
  /** Ask for a share for `job`, or renew `lease` (keeping its place) when one is carried. */
  ask(job: string, lease?: string | null): Promise<Answer>;
  renew(lease: string): Promise<boolean>;
  release(lease: string): Promise<void>;
}

export const DEFAULT_AGENT = "http://127.0.0.1:8700";
export const DEFAULT_GB = 48;

export function ordinal(n: number): string {
  const tail = n % 100 >= 10 && n % 100 <= 20 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${String(n)}${tail}`;
}

export function waitingNote(label: string, position: number): string {
  return `Waiting for memory on ${label}${position > 0 ? ` (${ordinal(position)} in line)` : ""}`;
}

export function memoryFromEnv(env: NodeJS.ProcessEnv, log?: (line: string) => void): Memory {
  const gb = Number(env["MEMORY_LEASE_GB"] ?? "");
  return createMemory({
    token: env["MEMORY_TOKEN"] || undefined,
    agent: env["MEMORY_AGENT"] || undefined,
    gb: Number.isFinite(gb) && gb > 0 ? gb : undefined,
    log,
  });
}

export function createMemory(options: MemoryOptions): Memory {
  const log = options.log ?? ((line: string) => {
    console.log(line);
  });
  const token = options.token ?? "";
  const agent = (options.agent ?? DEFAULT_AGENT).replace(/\/+$/, "");
  const gb = options.gb ?? DEFAULT_GB;
  const label = options.label ?? "the Ultra";
  const fetchFn = options.fetch ?? fetch;
  const enabled = token !== "";
  if (!enabled) log("[memory] MEMORY_TOKEN is not set: memory leases are off, every image is granted");

  const call = async (method: string, route: string, body?: unknown): Promise<Response> =>
    fetchFn(`${agent}${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });

  const read = async (res: Response): Promise<Answer> => {
    const body = (await res.json()) as Record<string, unknown>;
    const granted = body["status"] === "granted";
    const position = Number(body["position"] ?? 0);
    return { id: String(body["id"]), granted, position, note: granted ? "" : waitingNote(label, position) };
  };

  return {
    enabled,
    gb,
    async ask(job: string, lease?: string | null): Promise<Answer> {
      if (!enabled) return { id: null, granted: true, position: 0, note: "" };
      try {
        if (lease) {
          const renewed = await call("POST", `/api/leases/${lease}/renew`);
          if (renewed.ok) return await read(renewed);
          // 404: the agent restarted or the lease lapsed; ask afresh, honestly at the back of the line.
        }
        const res = await call("POST", "/api/leases", { holder: "qwen-model", service: "qwen-model", kind: "image", job, gb, class: "normal" });
        if (res.status === 200 || res.status === 202) return await read(res);
        const words = `The memory agent on ${label} refused (${String(res.status)})`;
        log(`[memory] ${words}; image ${job} waits`);
        return { id: lease ?? null, granted: false, position: 0, note: words };
      } catch (error) {
        const words = `The memory agent on ${label} does not answer`;
        log(`[memory] ${words} (${error instanceof Error ? error.name : String(error)}); image ${job} waits`);
        return { id: lease ?? null, granted: false, position: 0, note: words };
      }
    },
    async renew(lease: string): Promise<boolean> {
      if (!enabled) return true;
      try {
        const res = await call("POST", `/api/leases/${lease}/renew`);
        if (res.status === 404) log(`[memory] lease ${lease} is gone; the image carries on`);
        return res.ok;
      } catch {
        return false;
      }
    },
    async release(lease: string): Promise<void> {
      if (!enabled) return;
      try {
        await call("DELETE", `/api/leases/${lease}`);
      } catch {
        log(`[memory] lease ${lease} not released; the agent lets it lapse`);
      }
    },
  };
}
