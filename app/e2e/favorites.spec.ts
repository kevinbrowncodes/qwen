/**
 * STORY_039: an image can be starred from its action row, My Library or the viewer, and found again in Favorites. The
 * stub's `done-after-1-poll` script. History is shared by every spec in a run, so this spec empties it first and
 * counts only what it made (CLAUDE.md §6b). Regression cover: history.spec.ts (reopen, delete), chat.spec.ts (My Library,
 * deletes), generate.spec.ts (the action row) and viewer.spec.ts (STORY_038).
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, submitAndWait, test } from "./fixtures";

async function clearHistory(request: APIRequestContext): Promise<void> {
  const body: unknown = await (await request.get("/api/history")).json();
  const entries: unknown[] = typeof body === "object" && body !== null && "entries" in body && Array.isArray(body.entries) ? body.entries : [];
  for (const e of entries) {
    if (typeof e === "object" && e !== null && "id" in e && typeof e.id === "string") await request.delete(`/api/history/${encodeURIComponent(e.id)}`);
  }
}

const pathId = (page: Page): string => decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
const iconOf = (button: Locator): Promise<string | null> => button.locator("use").getAttribute("href");
const press = async (target: Locator, narrow: boolean): Promise<void> => {
  if (narrow) await target.tap();
  else await target.click();
};

/** A new chat from home with one finished image; returns its job id. */
async function generate(page: Page, prompt: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Prompt").fill(prompt);
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = pathId(page);
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
  return id;
}

/** Registers the wait for the star's PATCH answer before the action, and returns its status. */
async function starred(page: Page, id: string, action: () => Promise<unknown>): Promise<number> {
  const answer = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/history/${encodeURIComponent(id)}`);
  await action();
  return (await answer).status();
}

test.beforeEach(async ({ page, request }) => {
  await clearHistory(request);
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
});

test("a star from the action row, My Library and the viewer; Favorites lists the starred and forgets a deleted one", async ({ page }, info) => {
  // Two generations, each waited to its terminal status, and several page loads: more than the 30 s default under load.
  test.slow();
  const narrow = info.project.name === "narrow";

  // 1. Star the first image from its action row.
  const first = await generate(page, "a lighthouse in fog");
  const row = page.getByTestId("generation").locator(".clone-actions");
  expect(await starred(page, first, () => press(row.getByRole("button", { name: "Star" }), narrow))).toBe(200);
  const unstar = row.getByRole("button", { name: "Unstar" });
  await expect(unstar).toBeVisible();
  expect(await iconOf(unstar)).toMatch(/-star-fill$/);
  expect(await unstar.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(66, 110, 255)");

  // 2. A reload keeps it; Favorites lists it, with the corner star.
  await page.reload();
  await expect(row.getByRole("button", { name: "Unstar" })).toBeVisible();
  const second = await generate(page, "a red kite over dunes");
  await page.goto("/library");
  await page.getByTestId("library-segment-favorites").click();
  await expect(page).toHaveURL(/\/library\?view=favorites$/);
  const cards = page.getByTestId("library-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-job-id", first);
  await expect(cards.first().getByTestId("card-star")).toBeVisible();

  // 3. In All, the second card's own Star; the turn does not open.
  await page.getByTestId("library-segment-all").click();
  await expect(page).toHaveURL(/\/library$/);
  const secondCard = page.locator(`[data-testid="library-card"][data-job-id="${second}"]`);
  if (!narrow) await secondCard.hover();
  expect(await starred(page, second, () => press(secondCard.getByRole("button", { name: "Star" }), narrow))).toBe(200);
  await expect(secondCard.getByRole("button", { name: "Unstar" })).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByTestId("library-segment-favorites").click();
  // Newest star first.
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-job-id")))).toEqual([second, first]);

  // 4. Unstar the first from the viewer's header: the action row follows, and Favorites, without a reload.
  await page.locator(`[data-job-id="${first}"] a.clone-card-img`).click();
  await expect(page).toHaveURL(new RegExp(`/g/${first}`));
  await press(page.getByTestId("result-image"), narrow);
  const viewer = page.getByTestId("image-viewer");
  await expect(viewer).toBeVisible();
  expect(await starred(page, first, () => press(viewer.getByRole("button", { name: "Unstar" }), narrow))).toBe(200);
  await expect(viewer.getByRole("button", { name: "Star" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Star" })).toBeVisible();
  if (narrow) await page.getByRole("button", { name: "Open sidebar" }).tap();
  await page.getByRole("link", { name: "My Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByTestId("library-segment-favorites").click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-job-id", second);

  // 5. Deleting the second image's chat takes its star: Favorites is empty.
  await page.goto(`/g/${encodeURIComponent(second)}`);
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const removed = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/history/${encodeURIComponent(second)}`);
  await press(page.getByTestId("generation").getByRole("button", { name: "Delete" }), narrow);
  expect((await removed).status()).toBe(200);
  await page.goto("/library?view=favorites");
  await expect(page.getByTestId("library-empty")).toContainText("No favorites yet.");
  await expect(page.getByTestId("library-empty")).toContainText("Star an image to keep it here.");
});

test("narrow: the footer row's Star has a 44px touch area, and the library's segments fill the width", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "touch branch");
  await generate(page, "a narrow star");
  const box = await settledBox(page.getByTestId("generation").locator(".clone-actions").getByRole("button", { name: "Star" }));
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.goto("/library");
  const segments = await settledBox(page.locator(".clone-library-segments"));
  const list = await settledBox(page.locator(".clone-library"));
  // The library's own 13px gutters either side (my-library@393).
  expect(segments.width).toBeGreaterThanOrEqual(list.width - 26 - 1);
  for (const s of ["all", "favorites"]) expect((await settledBox(page.getByTestId(`library-segment-${s}`))).height).toBeGreaterThanOrEqual(44);
});

test("a failed turn shows no star", async ({ page }) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "fails-after-2-polls" } }) : route.continue()));
  await page.goto("/");
  await page.getByLabel("Prompt").fill("this one fails");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expect(page.getByTestId("notice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Star" })).toHaveCount(0);
});
