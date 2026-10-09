import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/lib/composer-state";
import type { JobStatusResponse } from "@/lib/job-api";
import { ComposerHost } from "@/components/composer/ComposerHost";
import { recallBatch } from "@/lib/pending";
import { GenerationPage } from "./GenerationPage";

// STORY_025: a send from a generation page adds cards to it, rendered in StrictMode (CLAUDE.md §6b).
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

type Create = { readonly id: string } | { readonly busy: string };

let creates: Create[] = [];
const states = new Map<string, JobStatusResponse["status"]>();
const posted: unknown[] = [];

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

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  creates = [];
  states.clear();
  posted.length = 0;
  push.mockClear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (input === "/api/jobs" && method === "POST") {
        posted.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
        const next = creates.shift();
        if (!next) return Promise.resolve(json(500, { error: { code: "internal", message: "no create scripted" } }));
        if ("busy" in next) return Promise.resolve(json(503, { error: { code: "busy", message: next.busy } }));
        return Promise.resolve(json(202, { id: next.id, status: "queued", progress: 0 }));
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
    expect(recallBatch("h1")).toEqual(["h2", "h3"]);
    home.unmount();
    page("h1");
    await waitFor(() => {
      expect(cards()).toEqual(["h1", "h2", "h3"]);
    });
    expect(screen.getAllByTestId("user-bubble").map((b) => b.textContent)).toEqual(["three lighthouses", "three lighthouses", "three lighthouses"]);
  });
});
