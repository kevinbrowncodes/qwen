/**
 * Shared e2e fixtures (STORY_008). CLAUDE.md §6b in code:
 * - the stub is reset before every test, and a test that ENDS with a stub job still queued or running fails;
 * - `submitAndWait` registers the terminal-status wait BEFORE the action that submits;
 * - `expectImageLoaded` asserts a result through the image element's load state, never its pixels.
 */
import { expect, test as base, type Locator, type Page, type Response } from "@playwright/test";
import { STUB_URL } from "../playwright.config";

export interface StubJob {
  readonly id: string;
  readonly script: string;
  readonly status: string;
  readonly progress: number;
}

export interface Stub {
  readonly url: string;
  reset(): Promise<void>;
  jobs(): Promise<StubJob[]>;
  received(id: string): Promise<unknown>;
}

function isStubJob(v: unknown): v is StubJob {
  return typeof v === "object" && v !== null && "id" in v && "status" in v && typeof v.id === "string" && typeof v.status === "string";
}

export const test = base.extend<{ stub: Stub }>({
  stub: [
    async ({ request }, use) => {
      const stub: Stub = {
        url: STUB_URL,
        reset: async () => {
          expect((await request.post(`${STUB_URL}/__stub/reset`)).ok()).toBe(true);
        },
        jobs: async () => {
          const body: unknown = await (await request.get(`${STUB_URL}/__stub/jobs`)).json();
          const jobs = typeof body === "object" && body !== null && "jobs" in body && Array.isArray(body.jobs) ? body.jobs : [];
          return jobs.filter(isStubJob);
        },
        received: async (id) => {
          const body: unknown = await (await request.get(`${STUB_URL}/__stub/jobs/${id}/received`)).json();
          return body;
        },
      };
      await stub.reset();
      await use(stub);
      const open = (await stub.jobs()).filter((j) => j.status === "queued" || j.status === "running");
      expect(open, "a test must not end with a job still running (CLAUDE.md §6b)").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

const TERMINAL = new Set(["done", "failed", "cancelled"]);

async function terminalStatus(response: Response): Promise<boolean> {
  if (!/\/api\/jobs\/[^/]+$/.test(new URL(response.url()).pathname) || response.request().method() !== "GET") return false;
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "status" in body && typeof body.status === "string" && TERMINAL.has(body.status);
  } catch {
    return false;
  }
}

/** Runs `action` with the wait for a terminal status response already registered, and returns that response. */
export async function submitAndWait(page: Page, action: () => Promise<unknown>, timeout = 20_000): Promise<Response> {
  const terminal = page.waitForResponse(terminalStatus, { timeout });
  await action();
  return terminal;
}

/**
 * Several jobs at once (STORY_025): resolves with their ids once `count` different jobs have answered a terminal status
 * to the page. Register it BEFORE the first submit, like `submitAndWait`; it rejects after `timeout` so a hung job
 * fails the test instead of the gate.
 */
export function waitForTerminals(page: Page, count: number, timeout = 60_000): Promise<string[]> {
  const ids = new Set<string>();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("response", onResponse);
      reject(new Error(`only ${String(ids.size)} of ${String(count)} jobs reached a terminal status`));
    }, timeout);
    const onResponse = (response: Response): void => {
      void terminalStatus(response).then((terminal) => {
        if (!terminal) return;
        ids.add(decodeURIComponent(new URL(response.url()).pathname.replace(/^\/api\/jobs\//, "")));
        if (ids.size < count) return;
        clearTimeout(timer);
        page.off("response", onResponse);
        resolve([...ids]);
      });
    };
    page.on("response", onResponse);
  });
}

/**
 * A measurement taken only once the element has stopped moving: two consecutive frames with the same box (CLAUDE.md
 * §6 rule 9: a probe that measures through a slide or fade produces false defects).
 */
export async function settledBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await locator.page().evaluate(() => document.fonts.ready);
  let last = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await locator.page().evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const next = await locator.boundingBox();
    if (last && next && Math.abs(last.x - next.x) < 0.5 && Math.abs(last.y - next.y) < 0.5 && Math.abs(last.width - next.width) < 0.5 && Math.abs(last.height - next.height) < 0.5) return next;
    last = next;
  }
  throw new Error("the element never settled");
}

/** The image has loaded, with a real width, from `src`. */
export async function expectImageLoaded(image: Locator, src: string | RegExp, naturalWidth?: number): Promise<void> {
  await expect(image).toHaveAttribute("src", src);
  await expect.poll(() => image.evaluate((el) => (el instanceof HTMLImageElement ? el.complete && el.naturalWidth : 0))).toBeGreaterThan(0);
  if (naturalWidth !== undefined) expect(await image.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBe(naturalWidth);
}
