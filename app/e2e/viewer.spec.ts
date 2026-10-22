/**
 * STORY_038: a clicked image opens in a viewer over the page, steps through the chat's images (results and
 * references together), and closes back to the image that opened it. The stub's `done-after-1-poll` script; every job
 * reaches a terminal status before the test ends (fixtures.ts checks). Regression cover for what stays the same:
 * generate.spec.ts (result, download), references.spec.ts (attach, remove, drop), chat.spec.ts (turns, My Library).
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, submitAndWait, test } from "./fixtures";

const FIXTURE = path.join(process.cwd(), "..", "tools", "stub-generation-server", "fixtures", "reference.png");

const pathId = (page: Page): string => decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
/** The result's file name, as the result route names a download (lib/content-disposition.ts). */
const resultName = (id: string): string => `qwen-${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "image"}.png`;
const viewer = (page: Page) => page.getByTestId("image-viewer");
const counter = (page: Page) => viewer(page).locator(".clone-viewer-counter");

async function attach(page: Page): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: /Upload attachment/ }).click();
  await (await chooser).setFiles(FIXTURE);
  await expect(page.getByTestId("reference-thumb")).toHaveCount(1);
}

/** One edit with the fixture as its reference, waited to its finished image; returns the job id. */
async function generateWithReference(page: Page): Promise<string> {
  await page.goto("/");
  await attach(page);
  await page.getByLabel("Prompt").fill("make it blue");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = pathId(page);
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
  return id;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
});

test("a click on the result opens the viewer named after it over a blurred page; Left steps to the reference; Esc closes back to the result", async ({ page }, info) => {
  const id = await generateWithReference(page);
  const result = page.getByTestId("result-image");
  if (info.project.name === "narrow") await result.tap();
  else await result.click();

  const dialog = page.getByRole("dialog", { name: resultName(id) });
  await expect(dialog).toBeVisible();
  await expect(counter(page)).toHaveText("2 of 2");
  await expectImageLoaded(viewer(page).getByTestId("viewer-image"), `/api/jobs/${id}/result`);
  expect(await viewer(page).evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveAttribute("href", `/api/jobs/${id}/result?download=1`);
  await expect(dialog.getByRole("button", { name: "Next image" })).toHaveCount(0);

  // Tab stays inside the viewer.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await viewer(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "reference.png" })).toBeVisible();
  await expect(counter(page)).toHaveText("1 of 2");
  await expect(viewer(page).getByRole("button", { name: "Previous image" })).toHaveCount(0);
  await expect(viewer(page).getByRole("link", { name: "Download" })).toHaveAttribute("download", "reference.png");

  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await expect(result).toBeFocused();
});

test("a reference shown in the turn opens the viewer too, and a click on the dimmed page closes it", async ({ page }) => {
  await generateWithReference(page);
  const reference = page.getByTestId("generation").getByRole("img", { name: "reference.png" });
  await reference.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "reference.png" })).toBeVisible();
  await expect(counter(page)).toHaveText("1 of 2");
  await viewer(page).getByRole("button", { name: "Next image" }).click();
  await expect(counter(page)).toHaveText("2 of 2");
  // Desktop: a click on the dimmed page around the sheet; the phone's viewer is full screen, so Close.
  if (test.info().project.name === "desktop") await viewer(page).click({ position: { x: 5, y: 5 } });
  else await viewer(page).getByRole("button", { name: "Close" }).tap();
  await expect(viewer(page)).toHaveCount(0);
  await expect(reference).toBeFocused();
});

test("the composer's thumbnail opens the viewer, and the attachment is still there after Close", async ({ page }, info) => {
  await page.goto("/");
  await attach(page);
  const thumb = page.getByTestId("reference-thumb").getByRole("img", { name: "reference.png" });
  // On a phone the Remove button's 44px touch area (STORY_011) covers the thumbnail's upper right, so the tap lands
  // in its lower left; the pointer clicks the middle.
  if (info.project.name === "narrow") await thumb.tap({ position: { x: 6, y: 50 } });
  else await thumb.click();
  await expect(page.getByRole("dialog", { name: "reference.png" })).toBeVisible();
  await expect(counter(page)).toHaveText("1 of 1");
  await viewer(page).getByRole("button", { name: "Close" }).click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.getByTestId("reference-thumb")).toHaveCount(1);
});

test("a finished image's Download downloads it and opens no viewer", async ({ page }, info) => {
  const id = await generateWithReference(page);
  // Desktop: the hover Download over the image; touch: the same link in the row under it.
  if (info.project.name === "desktop") await page.getByTestId("result-image").hover();
  const download = page.waitForEvent("download");
  await page.getByTestId("generation").getByRole("link", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe(resultName(id));
  await expect(viewer(page)).toHaveCount(0);
});

test("narrow: the viewer fills the screen, and Close and Download have 44px touch areas", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "touch branch");
  await generateWithReference(page);
  await page.getByTestId("result-image").tap();
  await expect(viewer(page)).toBeVisible();
  const box = await settledBox(viewer(page).getByTestId("viewer-sheet"));
  const size = page.viewportSize();
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, size?.width, size?.height]);
  for (const control of [viewer(page).getByRole("button", { name: "Close" }), viewer(page).getByRole("link", { name: "Download" })]) {
    const b = await settledBox(control);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  // The touch layout draws no hover controls over the image, so opening the viewer showed none.
  await expect(page.locator(".image-tool-container-hover")).toHaveCount(0);
  await viewer(page).getByRole("button", { name: "Close" }).tap();
  await expect(viewer(page)).toHaveCount(0);
});

test("a card in My Library opens its turn, not the viewer", async ({ page }) => {
  const id = await generateWithReference(page);
  await page.goto("/library");
  await page.locator(`a.clone-card-img[href$="#${encodeURIComponent(id)}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/g/[^#]+#${id}$`));
  await expect(page.getByTestId("generation").first()).toBeVisible();
  await expect(viewer(page)).toHaveCount(0);
});

test("a moderated turn opens nothing", async ({ page }) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "moderated" } }) : route.continue()));
  await page.goto("/");
  await page.getByLabel("Prompt").fill("something the server refuses");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await page.getByTestId("notice").click();
  await page.getByTestId("user-bubble").click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator("img[data-viewer]")).toHaveCount(0);
});

test("a job still running opens nothing from its skeleton", async ({ page }) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "slow-done-after-10-polls" } }) : route.continue()));
  // A slow job (10 polls with backoff), waited to its end so the test never ends with it running.
  test.slow();
  await page.goto("/");
  await page.getByLabel("Prompt").fill("still drawing");
  await submitAndWait(
    page,
    async () => {
      await page.getByRole("button", { name: "Send" }).click();
      await page.getByTestId("generating").click();
      await expect(viewer(page)).toHaveCount(0);
    },
    60_000,
  );
  await expect(page.locator("img[data-viewer]")).toHaveCount(1);
});
