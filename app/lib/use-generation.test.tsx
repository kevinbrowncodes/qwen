import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStatusResponse } from "./job-api";
import { useGeneration, type Generation } from "./use-generation";

const status = (s: JobStatusResponse["status"], extra: Partial<JobStatusResponse> = {}): JobStatusResponse => ({
  id: "j1",
  status: s,
  progress: s === "done" ? 100 : 33,
  createdAt: "t",
  updatedAt: "t",
  request: { prompt: "p", ratio: "1:1", model: "m", seed: 1, referenceImages: 0 },
  ...(s === "done" ? { result: { url: "/api/jobs/j1/result", mimeType: "image/png", width: 64, height: 36, sizeBytes: 9 } } : {}),
  ...extra,
});

let answers: Array<{ status: number; body: unknown }> = [];
const calls: Array<{ url: string; method: string }> = [];

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      calls.push({ url: input, method: init?.method ?? "GET" });
      if (init?.method === "DELETE") return Promise.resolve(new Response(JSON.stringify({ id: "j1", status: "cancelled", progress: 33 }), { status: 202 }));
      const next = answers.length > 1 ? answers.shift() : answers[0];
      return Promise.resolve(new Response(JSON.stringify(next?.body ?? null), { status: next?.status ?? 200 }));
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({ onTerminal, into }: { readonly onTerminal?: (j: JobStatusResponse) => void; readonly into: { current: Generation | null } }) {
  const generation = useGeneration("j1", onTerminal);
  report(into, generation);
  return <p>{generation.job?.status ?? "none"}</p>;
}

function report(into: { current: Generation | null }, generation: Generation): void {
  into.current = generation;
}

const flush = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useGeneration", () => {
  it("polls until done under StrictMode, tells the caller once, and stops", async () => {
    answers = [{ status: 200, body: status("running") }, { status: 200, body: status("running") }, { status: 200, body: status("done") }];
    const onTerminal = vi.fn();
    const into: { current: Generation | null } = { current: null };
    const { container } = render(
      <StrictMode>
        <Probe onTerminal={onTerminal} into={into} />
      </StrictMode>,
    );
    await flush();
    await flush(1000);
    await flush(1500);
    expect(container.textContent).toBe("done");
    expect(onTerminal).toHaveBeenCalledTimes(1);
    const polls = calls.length;
    await flush(10_000);
    expect(calls.length).toBe(polls);
  });

  it("stops polling on unmount", async () => {
    answers = [{ status: 200, body: status("running") }];
    const into: { current: Generation | null } = { current: null };
    const { unmount } = render(<Probe into={into} />);
    await flush();
    unmount();
    const polls = calls.length;
    await flush(20_000);
    expect(calls.length).toBe(polls);
  });

  it("reports an unknown job and stops, but keeps polling through a server that is down", async () => {
    answers = [{ status: 404, body: { error: { code: "not_found", message: "no job j1" } } }];
    const into: { current: Generation | null } = { current: null };
    render(<Probe into={into} />);
    await flush();
    expect(into.current?.problem).toBe("no job j1");
    const polls = calls.length;
    await flush(10_000);
    expect(calls.length).toBe(polls);

    answers = [{ status: 503, body: { error: { code: "busy", message: "The generation server is not reachable" } } }, { status: 200, body: status("done") }];
    const second: { current: Generation | null } = { current: null };
    render(<Probe into={second} />);
    await flush();
    expect(second.current?.problem).toBe("The generation server is not reachable");
    await flush(1000);
    expect(second.current?.job?.status).toBe("done");
    expect(second.current?.problem).toBeNull();
  });

  it("keeps polling through a network error, and a fetch that fails after unmount changes nothing", async () => {
    const real = vi.mocked(fetch);
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (fail) {
          fail = false;
          return Promise.reject(new TypeError("network down"));
        }
        return real(input, init);
      }),
    );
    answers = [{ status: 200, body: status("done") }];
    const into: { current: Generation | null } = { current: null };
    render(<Probe into={into} />);
    await flush();
    expect(into.current?.job).toBeNull();
    await flush(1000);
    expect(into.current?.job?.status).toBe("done");

    let reject: (e: Error) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_, r) => { reject = r; })));
    const late: { current: Generation | null } = { current: null };
    const { unmount } = render(<Probe into={late} />);
    unmount();
    reject(new Error("aborted"));
    await flush(5000);
    expect(late.current?.job).toBeNull();
  });

  it("stop sends DELETE, shows cancelled at once, then reads the final state again", async () => {
    answers = [{ status: 200, body: status("running") }];
    const into: { current: Generation | null } = { current: null };
    render(<Probe into={into} />);
    await flush();
    answers = [{ status: 200, body: status("cancelled") }];
    await act(async () => {
      await into.current?.stop();
    });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    await flush();
    expect(into.current?.job?.status).toBe("cancelled");
  });
});

describe("two generations on one page (STORY_025)", () => {
  /** A fake server per id: "a" runs until it is stopped, "b" is done on its third poll. */
  function twoJobs() {
    const polls = new Map<string, number>();
    const stopped = new Set<string>();
    const seen: Array<{ id: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        const id = decodeURIComponent(input.replace("/api/jobs/", ""));
        const method = init?.method ?? "GET";
        seen.push({ id, method });
        if (method === "DELETE") {
          stopped.add(id);
          return Promise.resolve(new Response(JSON.stringify({ id, status: "cancelled", progress: 33 }), { status: 202 }));
        }
        const n = (polls.get(id) ?? 0) + 1;
        polls.set(id, n);
        const s = stopped.has(id) ? "cancelled" : id === "b" && n >= 3 ? "done" : "running";
        return Promise.resolve(new Response(JSON.stringify(status(s, { id })), { status: 200 }));
      }),
    );
    return { seen };
  }

  function reportPair(into: { a: Generation | null; b: Generation | null }, a: Generation, b: Generation): void {
    into.a = a;
    into.b = b;
  }

  function Pair({ into }: { readonly into: { a: Generation | null; b: Generation | null } }) {
    const a = useGeneration("a");
    const b = useGeneration("b");
    reportPair(into, a, b);
    return (
      <p>
        {a.job?.status ?? "none"} {b.job?.status ?? "none"}
      </p>
    );
  }

  it("each polls only its own job, and stopping one leaves the other running to its end", async () => {
    const { seen } = twoJobs();
    const into: { a: Generation | null; b: Generation | null } = { a: null, b: null };
    const view = render(
      <StrictMode>
        <Pair into={into} />
      </StrictMode>,
    );
    await flush();
    await act(async () => {
      await into.a?.stop();
    });
    await flush(10_000);
    expect(view.container.textContent).toBe("cancelled done");
    expect(seen.filter((c) => c.method === "DELETE").map((c) => c.id)).toEqual(["a"]);
    expect(new Set(seen.map((c) => c.id))).toEqual(new Set(["a", "b"]));
    view.unmount();
  });

  it("unmounting the page stops both", async () => {
    const { seen } = twoJobs();
    const into: { a: Generation | null; b: Generation | null } = { a: null, b: null };
    const view = render(
      <StrictMode>
        <Pair into={into} />
      </StrictMode>,
    );
    await flush(1000);
    view.unmount();
    const before = seen.length;
    await flush(30_000);
    expect(seen.length).toBe(before);
  });
});
