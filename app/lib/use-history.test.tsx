import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameChat, setFavorite, type HistoryEntry } from "./history";
import { announceHistoryChanged, RUNNING_REFRESH_MS, useHistory, type History } from "./use-history";

const entry = (id: string, createdAt = "2026-01-01T00:00:00Z"): HistoryEntry => ({ id, chatId: id, prompt: id, ratio: "1:1", model: "m", referenceImages: 0, lora: null, seed: null, loraScale: null, loraGuidance: null, promptSent: null, createdAt, updatedAt: "t", status: "done", progress: 100 });

let list: HistoryEntry[] = [];
let deleteStatus = 200;
let patchStatus: number | "offline" = 200;
let favoriteBody: "entry" | "garbled" = "entry";
const calls: Array<{ url: string; method: string; body?: string }> = [];

beforeEach(() => {
  list = [entry("a"), entry("b")];
  deleteStatus = 200;
  patchStatus = 200;
  favoriteBody = "entry";
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
      if (method === "PATCH") {
        if (patchStatus === "offline") return Promise.reject(new TypeError("Failed to fetch"));
        if (url.startsWith("/api/history/")) {
          // Like the real route (STORY_039): a 200 answers the entry; "garbled" answers a body that is not one.
          const asked: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
          const on = typeof asked === "object" && asked !== null && "favorite" in asked && asked.favorite === true;
          const outcome = setFavorite(list, decodeURIComponent(url.slice("/api/history/".length)), on, "2026-01-02T00:00:00Z");
          if (patchStatus !== 200 || outcome.outcome !== "set") return Promise.resolve(new Response("{}", { status: patchStatus === 200 ? 404 : patchStatus }));
          list = outcome.entries;
          return Promise.resolve(new Response(favoriteBody === "garbled" ? "not json" : JSON.stringify(outcome.entry), { status: 200 }));
        }
        // Like the real route: a 200 names every turn of the chat (null clears it), anything else leaves them.
        const asked: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        const title = typeof asked === "object" && asked !== null && "title" in asked && typeof asked.title === "string" ? asked.title : null;
        const chatId = decodeURIComponent(url.slice("/api/chats/".length));
        if (patchStatus === 200) list = renameChat(list, chatId, title).entries;
        return Promise.resolve(new Response("{}", { status: patchStatus }));
      }
      if (method === "DELETE") {
        // Like the real route: a 200 removes the entry, anything else leaves it.
        if (deleteStatus === 200 && url.startsWith("/api/history/")) list = list.filter((e) => e.id !== decodeURIComponent(url.slice("/api/history/".length)));
        if (deleteStatus === 200 && url.startsWith("/api/chats/")) list = list.filter((e) => e.chatId !== decodeURIComponent(url.slice("/api/chats/".length)));
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

  it("removes a whole chat only after the server agreed (STORY_031)", async () => {
    list = [{ ...entry("a2"), chatId: "a" }, entry("a"), entry("b")];
    const into: { current: History | null } = { current: null };
    const { container } = render(<Probe into={into} />);
    await waitFor(() => {
      expect(container.textContent).toBe("a2,a,b");
    });
    let removed = false;
    await act(async () => {
      removed = (await into.current?.removeChat("a")) ?? false;
    });
    expect(removed).toBe(true);
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/chats/a");
    expect(container.textContent).toBe("b");

    deleteStatus = 409;
    await act(async () => {
      removed = (await into.current?.removeChat("b")) ?? true;
    });
    expect(removed).toBe(false);
    expect(container.textContent).toBe("b");
  });

  it("renames a chat only after the server agreed, and leaves it on a refusal or no network (STORY_033)", async () => {
    list = [{ ...entry("a2"), chatId: "a" }, entry("a"), entry("b")];
    const into: { current: History | null } = { current: null };
    render(<Probe into={into} />);
    await settle();
    const titles = (): Array<string | undefined> => into.current?.entries.map((e) => e.title) ?? [];
    let ok = false;
    await act(async () => {
      ok = (await into.current?.renameChat("a", "Harbour")) ?? false;
    });
    expect(ok).toBe(true);
    expect(calls.find((c) => c.method === "PATCH")).toEqual({ url: "/api/chats/a", method: "PATCH", body: JSON.stringify({ title: "Harbour" }) });
    expect(titles()).toEqual(["Harbour", "Harbour", undefined]);

    await act(async () => {
      ok = (await into.current?.renameChat("a", null)) ?? false;
    });
    expect(ok).toBe(true);
    expect(into.current?.entries.some((e) => "title" in e)).toBe(false);

    patchStatus = 404;
    await act(async () => {
      ok = (await into.current?.renameChat("b", "Nope")) ?? true;
    });
    expect(ok).toBe(false);
    patchStatus = "offline";
    await act(async () => {
      ok = (await into.current?.renameChat("b", "Nope")) ?? true;
    });
    expect(ok).toBe(false);
    expect(titles()).toEqual([undefined, undefined, undefined]);
  });

  it("stars and unstars an image only after the server agreed, and leaves it on a refusal or no network (STORY_039)", async () => {
    const into: { current: History | null } = { current: null };
    render(<Probe into={into} />);
    await settle();
    const stars = (): Array<string | undefined> => into.current?.entries.map((e) => e.favoritedAt) ?? [];
    const announced = vi.fn();
    window.addEventListener("qwen:history-changed", announced);
    let ok = false;
    await act(async () => {
      ok = (await into.current?.setFavorite("a", true)) ?? false;
    });
    expect(ok).toBe(true);
    expect(calls.find((c) => c.method === "PATCH")).toEqual({ url: "/api/history/a", method: "PATCH", body: JSON.stringify({ favorite: true }) });
    expect(stars()).toEqual(["2026-01-02T00:00:00Z", undefined]);
    expect(announced).toHaveBeenCalled();

    // An answer the hook cannot read still counts as agreed: the announced re-read brings the star.
    favoriteBody = "garbled";
    await act(async () => {
      ok = (await into.current?.setFavorite("b", true)) ?? false;
    });
    expect(ok).toBe(true);
    await waitFor(() => {
      expect(stars()).toEqual(["2026-01-02T00:00:00Z", "2026-01-02T00:00:00Z"]);
    });

    favoriteBody = "entry";
    await act(async () => {
      ok = (await into.current?.setFavorite("a", false)) ?? false;
    });
    expect(stars()[0]).toBeUndefined();

    patchStatus = 409;
    await act(async () => {
      ok = (await into.current?.setFavorite("a", true)) ?? true;
    });
    expect(ok).toBe(false);
    patchStatus = "offline";
    await act(async () => {
      ok = (await into.current?.setFavorite("a", true)) ?? true;
    });
    expect(ok).toBe(false);
    expect(stars()[0]).toBeUndefined();
    window.removeEventListener("qwen:history-changed", announced);
  });

  it("stopAll cancels every running turn of a chat and announces the change (STORY_031)", async () => {
    const into: { current: History | null } = { current: null };
    render(<Probe into={into} />);
    await settle();
    const heard = vi.fn();
    window.addEventListener("qwen:history-changed", heard);
    await act(async () => {
      await into.current?.stopAll(["a", "b"]);
    });
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/jobs/a", "/api/jobs/b"]);
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
