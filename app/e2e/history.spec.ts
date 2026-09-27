/**
 * STORY_013: past generations are listed in the sidebar and in My Library, and can be reopened, downloaded or removed.
 * History is shared by every spec in a run, so this spec empties it first: the counts it asserts are of what it made
 * (CLAUDE.md §6b: never assert an exact count against data the test did not create).
 */
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, expectImageLoaded, submitAndWait, test } from "./fixtures";

async function clearHistory(request: APIRequestContext): Promise<void> {
  const body: unknown = await (await request.get("/api/history")).json();
  const entries: unknown[] = typeof body === "object" && body !== null && "entries" in body && Array.isArray(body.entries) ? body.entries : [];
  for (const e of entries) {
    if (typeof e === "object" && e !== null && "id" in e && typeof e.id === "string") await request.delete(`/api/history/${encodeURIComponent(e.id)}`);
  }
}

async function generate(page: Page, prompt: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Prompt").fill(prompt);
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  return decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
}

async function openSidebar(page: Page, narrow: boolean): Promise<void> {
  if (narrow) await page.getByRole("button", { name: "Open sidebar" }).tap();
}

test.beforeEach(async ({ page, request }) => {
  await clearHistory(request);
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
});

test("two generations are listed newest first, with My Library's thumbnails, and reopen from the sidebar", async ({ page }, info) => {
  const narrow = info.project.name === "narrow";
  const older = await generate(page, "first image, a lighthouse");
  const newer = await generate(page, "second image, a harbour");

  await openSidebar(page, narrow);
  const rows = page.getByTestId("history-row");
  await expect(rows).toHaveText(["second image, a harbour", "first image, a lighthouse"]);
  await expect(page.getByRole("group", { name: "Today" })).toBeVisible();
  await expect(rows.first().getByRole("link")).toHaveAttribute("aria-current", "page");

  const thumbs = page.getByTestId("library-thumb");
  await expect(thumbs).toHaveCount(2);
  for (const img of await thumbs.locator("img").all()) {
    await expect.poll(() => img.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBe(64);
  }

  await rows.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/g/${older}$`));
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${older}/result`, 64);
  expect(newer).not.toBe(older);
});

test("My Library shows every finished image, opens one, and offers Download", async ({ page }) => {
  const older = await generate(page, "library one");
  await generate(page, "library two");
  await page.goto("/library");
  const cards = page.getByTestId("library-card");
  await expect(cards).toHaveCount(2);
  for (const img of await cards.locator("img").all()) {
    await expect.poll(() => img.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBe(64);
  }
  await expect(cards.nth(1).getByRole("link", { name: "Download" })).toHaveAttribute("href", `/api/jobs/${older}/result?download=1`);
  await cards.nth(1).getByRole("link", { name: "Open library one" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${older}$`));
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${older}/result`, 64);
});

test("deleting the open generation asks first, removes it everywhere, and goes home", async ({ page }, info) => {
  const narrow = info.project.name === "narrow";
  await generate(page, "keep this one");
  await generate(page, "delete this one");
  await openSidebar(page, narrow);
  const rows = page.getByTestId("history-row");
  await expect(rows).toHaveCount(2);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Delete this image? This cannot be undone.");
    void dialog.accept();
  });
  const removed = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname.startsWith("/api/history/"));
  // Desktop reveals a row's menu on hover, as the reference does; touch shows it always.
  if (!narrow) await rows.first().hover();
  await rows.first().getByRole("button", { name: "Chat Menu" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  expect((await removed).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["keep this one"]);
  await page.goto("/library");
  await expect(page.getByTestId("library-card")).toHaveCount(1);
});

test("with no history, My Library says so and the sidebar says so", async ({ page }, info) => {
  await page.goto("/library");
  await expect(page.getByTestId("library-empty")).toContainText("No images yet.");
  await expect(page.getByRole("link", { name: "New image" }).last()).toBeVisible();
  await openSidebar(page, info.project.name === "narrow");
  await expect(page.getByText("No images yet", { exact: true })).toBeVisible();
});
