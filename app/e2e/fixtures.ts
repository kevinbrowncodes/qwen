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

/** The image has loaded, with a real width, from `src`. */
export async function expectImageLoaded(image: Locator, src: string | RegExp, naturalWidth?: number): Promise<void> {
  await expect(image).toHaveAttribute("src", src);
  await expect.poll(() => image.evaluate((el) => (el instanceof HTMLImageElement ? el.complete && el.naturalWidth : 0))).toBeGreaterThan(0);
  if (naturalWidth !== undefined) expect(await image.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBe(naturalWidth);
}
