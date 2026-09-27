import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "./history";
import { announceHistoryChanged, RUNNING_REFRESH_MS, useHistory, type History } from "./use-history";

const entry = (id: string, createdAt = "2026-01-01T00:00:00Z"): HistoryEntry => ({ id, prompt: id, ratio: "1:1", model: "m", referenceImages: 0, createdAt, updatedAt: "t", status: "done", progress: 100 });

let list: HistoryEntry[] = [];
let deleteStatus = 200;
const calls: Array<{ url: string; method: string }> = [];

beforeEach(() => {
  list = [entry("a"), entry("b")];
  deleteStatus = 200;
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "DELETE") {
        // Like the real route: a 200 removes the entry, anything else leaves it.
        if (deleteStatus === 200 && url.startsWith("/api/history/")) list = list.filter((e) => e.id !== decodeURIComponent(url.slice("/api/history/".length)));
        return Promise.resolve(new Response("{}", { status: deleteStatus }));
      }
      return Promise.resolve(new Response(JSON.stringify({ entries: list }), { status: 200 }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe({ into }: { readonly into: { current: History | null } }) {
  const h = useHistory();
  keep(into, h);
  return <p>{h.entries.map((e) => e.id).join(",")}</p>;
}
function keep(into: { current: History | null }, h: History): void {
  into.current = h;
}
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("useHistory", () => {
  it("reads history on mount and again when the app announces a change", async () => {
    const into: { current: History | null } = { current: null };
    const { container } = render(<Probe into={into} />);
    await waitFor(() => {
      expect(container.textContent).toBe("a,b");
    });
    expect(into.current?.loaded).toBe(true);
    list = [entry("c", "2026-01-02T00:00:00Z"), ...list];
    act(() => {
      announceHistoryChanged();
    });
    await waitFor(() => {
      expect(container.textContent).toBe("c,a,b");
    });
  });

  it("removes an entry only after the server agreed", async () => {
    const into: { current: History | null } = { current: null };
    const { container } = render(<Probe into={into} />);
    await waitFor(() => {
      expect(container.textContent).toBe("a,b");
    });
    let removed = false;
    await act(async () => {
      removed = (await into.current?.remove("a")) ?? false;
    });
    expect(removed).toBe(true);
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/history/a");
    expect(container.textContent).toBe("b");

    deleteStatus = 409;
    await act(async () => {
      removed = (await into.current?.remove("b")) ?? true;
    });
    expect(removed).toBe(false);
    expect(container.textContent).toBe("b");
  });

  it("stop cancels the job and announces the change", async () => {
    const into: { current: History | null } = { current: null };
    render(<Probe into={into} />);
    await settle();
    const heard = vi.fn();
    window.addEventListener("qwen:history-changed", heard);
    await act(async () => {
      await into.current?.stop("a");
    });
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/jobs/a")).toBe(true);
    expect(heard).toHaveBeenCalled();
    window.removeEventListener("qwen:history-changed", heard);
  });

  it("reads an unreadable history as empty, and stops listening on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>", { status: 500 }))));
    const into: { current: History | null } = { current: null };
    const { container, unmount } = render(<Probe into={into} />);
    await waitFor(() => {
      expect(into.current?.loaded).toBe(true);
    });
    expect(container.textContent).toBe("");
    unmount();
    const before = vi.mocked(fetch).mock.calls.length;
    announceHistoryChanged();
    expect(vi.mocked(fetch).mock.calls.length).toBe(before);
  });
});

describe("while something runs (BUG_006)", () => {
  it("reads history again every few seconds until nothing is running", async () => {
    vi.useFakeTimers();
    list = [{ ...entry("a"), status: "running" }];
    const into: { current: History | null } = { current: null };
    render(<Probe into={into} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const reads = (): number => calls.filter((c) => c.method === "GET").length;
    const first = reads();
    list = [entry("a")];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUNNING_REFRESH_MS);
    });
    expect(reads()).toBe(first + 1);
    expect(into.current?.entries[0]?.status).toBe("done");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUNNING_REFRESH_MS * 3);
    });
    expect(reads()).toBe(first + 1);
    vi.useRealTimers();
  });
});
