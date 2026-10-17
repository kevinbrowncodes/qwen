import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/lib/composer-state";
import type { JobStatusResponse } from "@/lib/job-api";
import { ComposerHost } from "@/components/composer/ComposerHost";
import { GenerationPage } from "./GenerationPage";

// STORY_025: a send from a generation page adds cards to it, rendered in StrictMode (CLAUDE.md §6b).
// STORY_031: the page is a chat read from history; the fake server records history the way POST /api/jobs does.
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

type Create = { readonly id: string } | { readonly busy: string };

let creates: Create[] = [];
const states = new Map<string, JobStatusResponse["status"]>();
const posted: unknown[] = [];
/** What the fake history holds, oldest first: each create joins the chat it names when that chat exists. */
const recorded: Array<{ id: string; chatId: string; prompt: string; createdAt: string; status: string }> = [];
let clock = 0;

function statusBody(id: string): JobStatusResponse {
  const s = states.get(id) ?? "running";
  return {
    id,
    status: s,
    progress: s === "done" ? 100 : 33,
    createdAt: "2026-10-09T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:10.000Z",
    request: { prompt: `prompt of ${id}`, ratio: "16:9", model: "qwen-image-2.1", seed: 7, referenceImages: 0, lora: null },
    ...(s === "done" ? { result: { url: `/api/jobs/${id}/result`, mimeType: "image/png", width: 64, height: 36, sizeBytes: 9 } } : {}),
  };
}

const fieldsOf = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {});

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  creates = [];
  states.clear();
  posted.length = 0;
  recorded.length = 0;
  clock = 0;
  push.mockClear();
  replace.mockClear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (input === "/api/jobs" && method === "POST") {
        const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
        posted.push(body);
        const next = creates.shift();
        if (!next) return Promise.resolve(json(500, { error: { code: "internal", message: "no create scripted" } }));
        if ("busy" in next) return Promise.resolve(json(503, { error: { code: "busy", message: next.busy } }));
        const fields = fieldsOf(body);
        const chat = typeof fields["chat"] === "string" ? fields["chat"] : null;
        const chatId = recorded.find((e) => e.chatId === chat)?.chatId ?? next.id;
        recorded.push({ id: next.id, chatId, prompt: typeof fields["prompt"] === "string" ? fields["prompt"] : "", createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, ++clock)).toISOString(), status: "running" });
        return Promise.resolve(json(202, { id: next.id, status: "queued", progress: 0 }));
      }
      if (input === "/api/history") return Promise.resolve(json(200, { entries: [...recorded].reverse() }));
      const del = /^\/api\/history\/([^/]+)$/.exec(input);
      if (del?.[1] !== undefined && method === "DELETE") {
        const at = recorded.findIndex((e) => e.id === decodeURIComponent(del[1] ?? ""));
        if (at >= 0) recorded.splice(at, 1);
        return Promise.resolve(json(200, { removed: true }));
      }
      const m = /^\/api\/jobs\/([^/]+)$/.exec(input);
      if (m?.[1] !== undefined && method === "DELETE") return Promise.resolve(json(202, { id: m[1], status: "cancelled", progress: 33 }));
      if (m?.[1] !== undefined) return Promise.resolve(json(200, statusBody(decodeURIComponent(m[1]))));
      return Promise.resolve(json(404, { error: { code: "not_found", message: "no" } }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function page(id = "first") {
  return render(
    <StrictMode>
      <GenerationPage id={id} />
    </StrictMode>,
  );
}

const cards = (): string[] => screen.queryAllByTestId("generation").map((el) => el.getAttribute("data-job-id") ?? "");

function promptValue(): string | null {
  const el = screen.getByLabelText("Prompt");
  return el instanceof HTMLTextAreaElement ? el.value : null;
}

async function send(text: string): Promise<void> {
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: text } });
  const button = screen.getByRole("button", { name: "Send" });
  await waitFor(() => {
    expect(button.hasAttribute("disabled")).toBe(false);
  });
  fireEvent.click(button);
}

describe("the generation page (STORY_025)", () => {
  it("adds a sent prompt as a new card below the first, without leaving the page, while the first is still running", async () => {
    page();
    await waitFor(() => {
      expect(cards()).toEqual(["first"]);
    });
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    creates = [{ id: "second" }];
    await send("a blue boat");
    await waitFor(() => {
      expect(cards()).toEqual(["first", "second"]);
    });
    expect(push).not.toHaveBeenCalled();
    expect(promptValue()).toBe("");
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(2);
  });

  it("adds no card for a busy server, and keeps the text with the server's message", async () => {
    page();
    creates = [{ busy: "The model server already has 8 images waiting." }];
    await send("a yellow tram");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("The model server already has 8 images waiting.");
    });
    expect(cards()).toEqual(["first"]);
    expect(promptValue()).toBe("a yellow tram");
  });

  it("queues the composer's count, one card per image, with no seed in any request", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "image", count: 3 }));
    page();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Number of images" }).textContent).toContain("×3");
    });
    creates = [{ id: "b" }, { id: "c" }, { id: "d" }];
    await send("a green kite");
    await waitFor(() => {
      expect(cards()).toEqual(["first", "b", "c", "d"]);
    });
    expect(posted).toHaveLength(3);
    for (const body of posted) expect(body).toMatchObject({ prompt: "a green kite" });
    for (const body of posted) expect(body).not.toHaveProperty("seed");
  });

  it("says how many went when the server fills part-way through a count, and keeps the text", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "image", count: 4 }));
    page();
    creates = [{ id: "b" }, { id: "c" }, { busy: "Full." }];
    await send("a red tram");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Queued 2 of 4. Full.");
    });
    expect(cards()).toEqual(["first", "b", "c"]);
    expect(posted).toHaveLength(3);
    expect(promptValue()).toBe("a red tram");
  });

  it("Regenerate on a finished card adds one card to this page, whatever the count", async () => {
    states.set("first", "done");
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "image", count: 5 }));
    page();
    const first = await screen.findByTestId("generation");
    creates = [{ id: "again" }];
    fireEvent.click(await within(first).findByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(cards()).toEqual(["first", "again"]);
    });
    expect(posted).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("Stop on one card stops that job only", async () => {
    page();
    creates = [{ id: "second" }];
    await send("a blue boat");
    await waitFor(() => {
      expect(cards()).toEqual(["first", "second"]);
    });
    const second = screen.getAllByTestId("generation")[1];
    if (!second) throw new Error("no second card");
    states.set("second", "cancelled");
    fireEvent.click(within(second).getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(within(second).getByTestId("notice").textContent).toContain("Stopped.");
    });
    const deletes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletes.map(([url]) => url)).toEqual(["/api/jobs/second"]);
    expect(within(screen.getAllByTestId("generation")[0] ?? document.body).getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("from the home page, sends every image first, then moves to the first, where all of them are shown", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "image", count: 3 }));
    const home = render(
      <StrictMode>
        <ComposerHost />
      </StrictMode>,
    );
    creates = [{ id: "h1" }, { id: "h2" }, { id: "h3" }];
    await send("three lighthouses");
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/g/h1");
    });
    expect(posted).toHaveLength(3);
    // The first starts the chat; the other two join it (STORY_031), so the page finds them in history.
    expect(posted.map((b) => fieldsOf(b)["chat"])).toEqual([undefined, "h1", "h1"]);
    home.unmount();
    page("h1");
    await waitFor(() => {
      expect(cards()).toEqual(["h1", "h2", "h3"]);
    });
    expect(screen.getAllByTestId("user-bubble").map((b) => b.textContent)).toEqual(["three lighthouses", "three lighthouses", "three lighthouses"]);
  });
});

describe("the page is a chat (STORY_031)", () => {
  /** A chat already in history, oldest first. */
  function seed(chatId: string, ids: readonly string[]): void {
    for (const id of ids) {
      recorded.push({ id, chatId, prompt: `prompt of ${id}`, createdAt: new Date(Date.UTC(2026, 9, 17, 9, 0, ++clock)).toISOString(), status: "done" });
      states.set(id, "done");
    }
  }
  let scrolled: string[] = [];
  beforeEach(() => {
    scrolled = [];
    window.history.replaceState(null, "", "/");
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute("data-job-id") ?? "");
    };
  });

  it("shows every turn history holds for the chat, oldest first, and opens at the newest", async () => {
    seed("c1", ["c1", "c2", "c3"]);
    seed("other", ["other"]);
    page("c1");
    await waitFor(() => {
      expect(cards()).toEqual(["c1", "c2", "c3"]);
    });
    await waitFor(() => {
      expect(scrolled).toEqual(["c3"]);
    });
  });

  it("joins a send to the chat, and shows it at once, before history has it", async () => {
    seed("c1", ["c1"]);
    page("c1");
    await waitFor(() => {
      expect(cards()).toEqual(["c1"]);
    });
    creates = [{ id: "c2" }];
    await send("a blue boat");
    await waitFor(() => {
      expect(cards()).toEqual(["c1", "c2"]);
    });
    expect(fieldsOf(posted[0])["chat"]).toBe("c1");
  });

  it("opens the chat at a later turn named by the URL, and outlines the turn named by the hash, scrolling once", async () => {
    seed("c1", ["c1", "c2", "c3"]);
    const later = page("c2");
    await waitFor(() => {
      expect(cards()).toEqual(["c1", "c2", "c3"]);
    });
    await waitFor(() => {
      expect(scrolled).toEqual(["c2"]);
    });
    later.unmount();
    scrolled = [];
    window.history.replaceState(null, "", "/g/c1#c3");
    page("c1");
    await waitFor(() => {
      expect(scrolled).toEqual(["c3"]);
    });
    const third = screen.getAllByTestId("generation")[2];
    expect(third?.className).toContain("clone-turn-highlight");
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => {
      expect(screen.getAllByTestId("generation")[2]?.className).not.toContain("clone-turn-highlight");
    });
  });

  it("deletes one image after asking, keeps the rest, and goes home after the last", async () => {
    seed("c1", ["c1", "c2"]);
    const ask = vi.spyOn(window, "confirm");
    page("c1");
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    });
    ask.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1] ?? document.body);
    expect(ask).toHaveBeenCalledWith("Delete this image? This cannot be undone.");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/history/c2")).toBe(false);
    ask.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1] ?? document.body);
    await waitFor(() => {
      expect(cards()).toEqual(["c1"]);
    });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/");
    });
    ask.mockRestore();
  });
});
