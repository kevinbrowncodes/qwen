/**
 * STORY_040: the chat grows with a wide window, and its text stays readable. At the captured 1437 px nothing changes
 * (the column 800 with 32 px padding, the result 400, the composer 760, measured 2026-10-22). Wider, the column grows
 * to a cap of 1400 px of content, centred; a result is as wide as the column allows, never past its natural size and
 * never taller than the window less the composer; bubbles stay at about 72 characters; My Library gains columns.
 *
 * The stub's result is 64x36, too small to show growth, so the cases that need a large image route the result request
 * to a PNG drawn in the page at a known size (our own picture, not a model's: CLAUDE.md §6 rule 10). The stub's
 * `done-after-1-poll` script; every job reaches a terminal status before the test ends. Regression cover:
 * generate.spec.ts, chat.spec.ts, home.spec.ts and image-mode.spec.ts at 1437.
 */
import { devices, type APIRequestContext, type Page } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, submitAndWait, test } from "./fixtures";

const desktop = devices["Desktop Chrome"];
const wideWindow = (width: number, height: number) => ({ userAgent: desktop.userAgent, deviceScaleFactor: desktop.deviceScaleFactor, isMobile: false, hasTouch: false, viewport: { width, height } });
const CAP = 1400;
const LONG_PROMPT = "create an image of a handsome middle-aged man walking along a harbour at dusk, with the boats behind him and the light going down over the water, in the style of a film still";

async function useStub(page: Page): Promise<void> {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
}

/** Serves every result as a PNG of `width` x `height`, drawn in the page with a canvas. */
async function largeResult(page: Page, width: number, height: number): Promise<void> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (g) {
        g.fillStyle = "#3050c0";
        g.fillRect(0, 0, w, h);
      }
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    },
    [width, height] as const,
  );
  const body = Buffer.from(base64, "base64");
  await page.route("**/api/jobs/*/result", (route) => route.fulfill({ status: 200, contentType: "image/png", body }));
}

async function generate(page: Page, prompt = LONG_PROMPT): Promise<void> {
  await page.getByLabel("Prompt").fill(prompt);
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expectImageLoaded(page.getByTestId("result-image"), /\/result$/);
}

const column = (page: Page) => page.locator(".clone-messages .qwen-chat-message-assistant").first();
const naturalWidth = (page: Page): Promise<number> => page.getByTestId("result-image").evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0));
/** The width of 72 characters in the bubble's own type. */
const readWidth = (page: Page): Promise<number> =>
  page.getByTestId("user-bubble").evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:72ch;visibility:hidden;position:absolute";
    el.append(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  });

test.describe("at the captured width, 1437 x 900", () => {
  test.use(wideWindow(1437, 900));
  test("the column, the result and the composer measure as today", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    await useStub(page);
    await page.goto("/");
    await largeResult(page, 2000, 1125);
    await generate(page);
    expect((await settledBox(column(page))).width).toBe(800);
    expect((await settledBox(page.getByTestId("result-image"))).width).toBe(400);
    expect((await settledBox(page.getByTestId("composer"))).width).toBe(760);
    // The bubble's own rule, 70% of the 736 px of content.
    expect((await settledBox(page.getByTestId("user-bubble"))).width).toBeLessThanOrEqual(Math.ceil(736 * 0.7));
  });
});

test.describe("the owner's wide window, 2560 x 1440", () => {
  test.use(wideWindow(2560, 1440));

  test("the column grows to the cap, centred with room either side; a large result fills it; the bubble keeps a readable width", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    await useStub(page);
    await page.goto("/");
    await largeResult(page, 2000, 1125);
    await generate(page);
    const area = await settledBox(page.locator(".clone-chat-page"));
    const col = await settledBox(column(page));
    // Wider than at 1437 (800), at most the cap plus its 64 px of padding, centred, at least 40 px either side.
    expect(col.width).toBeGreaterThan(800);
    expect(col.width).toBeLessThanOrEqual(CAP + 64);
    const left = col.x - area.x;
    const right = area.x + area.width - (col.x + col.width);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(left).toBeGreaterThanOrEqual(40);
    // A 2000 px image is as wide as the column's content allows, at its own aspect.
    const image = await settledBox(page.getByTestId("result-image"));
    expect(Math.abs(image.width - (col.width - 64))).toBeLessThanOrEqual(1);
    expect(image.width / image.height).toBeCloseTo(2000 / 1125, 1);
    const bubble = await settledBox(page.getByTestId("user-bubble"));
    expect(bubble.width).toBeLessThanOrEqual((await readWidth(page)) + 1);
    // The composer grows with the column, under it.
    const composer = await settledBox(page.getByTestId("composer"));
    expect(composer.width).toBeGreaterThan(760);
    expect(composer.x).toBeGreaterThanOrEqual(col.x);
    expect(composer.x + composer.width).toBeLessThanOrEqual(col.x + col.width);
  });

  test("a small result is never drawn past its natural size", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    await useStub(page);
    await page.goto("/");
    await generate(page, "a small one");
    expect((await settledBox(page.getByTestId("result-image"))).width).toBe(await naturalWidth(page));
  });

  test("a portrait result is held to the window's height less the composer, so the whole image is on screen", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    await useStub(page);
    await page.goto("/");
    await largeResult(page, 1125, 2000);
    await generate(page);
    const image = await settledBox(page.getByTestId("result-image"));
    const composer = await settledBox(page.getByTestId("composer"));
    expect(image.height).toBeLessThanOrEqual(1440 - composer.height);
    expect(image.height).toBeLessThanOrEqual((await settledBox(page.locator(".clone-chat-scroll"))).height);
    expect(image.width / image.height).toBeCloseTo(1125 / 2000, 1);
  });

  test("My Library gains columns rather than larger cards", async ({ page, request }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    test.slow(); // five generations, each waited to its terminal status
    await clearHistory(request);
    await useStub(page);
    for (let i = 0; i < 5; i++) {
      await page.goto("/");
      await generate(page, `library card ${String(i)}`);
    }
    await page.goto("/library");
    const cards = page.getByTestId("library-card");
    await expect(cards).toHaveCount(5);
    const boxes = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), width: r.width })));
    for (const b of boxes) expect(b.width).toBeLessThanOrEqual(276);
    // More columns than the three at 1437.
    expect(new Set(boxes.map((b) => b.x)).size).toBeGreaterThan(3);
  });
});

async function clearHistory(request: APIRequestContext): Promise<void> {
  const body: unknown = await (await request.get("/api/history")).json();
  const entries: unknown[] = typeof body === "object" && body !== null && "entries" in body && Array.isArray(body.entries) ? body.entries : [];
  for (const e of entries) {
    if (typeof e === "object" && e !== null && "id" in e && typeof e.id === "string") await request.delete(`/api/history/${encodeURIComponent(e.id)}`);
  }
}

test("narrow: unchanged, the result 300 wide and the bubble at most 70% of the column", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "touch branch (iPhone 13)");
  await useStub(page);
  await page.goto("/");
  await largeResult(page, 2000, 1125);
  await generate(page, "a narrow one");
  expect((await settledBox(page.getByTestId("result-image"))).width).toBe(300);
  const col = await settledBox(column(page));
  expect((await settledBox(page.getByTestId("user-bubble"))).width).toBeLessThanOrEqual(col.width * 0.7 + 1);
});
