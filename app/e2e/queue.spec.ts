/**
 * STORY_025: several images can be queued at once, and each waits its turn on the same page. Stub scripts are chosen
 * per create, in order, through the `x-stub-script` header (Playwright routing), so the product code carries no test
 * hook. The stub runs its jobs side by side (it has no queue); the one-at-a-time order is the model server's, checked
 * by hand on the Spark. Every test ends with every job it created terminal (fixtures.ts checks).
 */
import type { Page } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, test, waitForTerminals } from "./fixtures";

/** Each create takes the next script in the list; once the list is used up, the last one repeats. */
async function useScripts(page: Page, scripts: readonly string[]): Promise<void> {
  let n = 0;
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const script = scripts[Math.min(n++, scripts.length - 1)] ?? "done-after-1-poll";
    return route.continue({ headers: { ...route.request().headers(), "x-stub-script": script } });
  });
}

async function imageMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
}

async function chooseCount(page: Page, n: number): Promise<void> {
  await page.getByRole("combobox", { name: "Number of images" }).click();
  await page.getByRole("option", { name: n === 1 ? "1 image" : `${String(n)} images` }).click();
}

async function send(page: Page, prompt: string): Promise<void> {
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}

const cards = (page: Page) => page.getByTestId("generation");
const cardIds = async (page: Page): Promise<string[]> => (await cards(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-job-id") ?? "")));

/** What the stub received for a job: its request. */
async function requestOf(stub: import("./fixtures").Stub, id: string): Promise<Record<string, unknown>> {
  const body = await stub.received(id);
  const request = typeof body === "object" && body !== null && "request" in body ? body.request : null;
  return typeof request === "object" && request !== null ? { ...request } : {};
}

test("three prompts sent in a row stack on the first one's page, in order, and each fills in", async ({ page, stub }) => {
  // The first job takes 10 polls with backoff (about 32 s), so it is still generating while the others are sent.
  // Three such budgets would exceed the 30 s default; test.slow() triples it to 90 s.
  test.slow();
  await useScripts(page, ["slow-done-after-10-polls", "done-after-3-polls", "done-after-3-polls"]);
  const terminals = waitForTerminals(page, 3, 80_000);
  await page.goto("/");
  await send(page, "a red bicycle");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  const url = page.url();
  await expect(cards(page).first().getByTestId("generating")).toBeVisible();

  await send(page, "a blue boat");
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await send(page, "a green kite");
  await expect(cards(page)).toHaveCount(3);

  expect(page.url()).toBe(url);
  await expect(page.getByTestId("user-bubble")).toHaveText(["a red bicycle", "a blue boat", "a green kite"]);
  const ids = await cardIds(page);
  expect(await Promise.all(ids.map(async (id) => (await requestOf(stub, id))["prompt"]))).toEqual(["a red bicycle", "a blue boat", "a green kite"]);

  expect(new Set(await terminals)).toEqual(new Set(ids));
  for (const [i, id] of ids.entries()) await expectImageLoaded(cards(page).nth(i).getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
});

test("Stop on one card stops that job only; the other carries on to its image", async ({ page, stub }, info) => {
  test.slow(); // the first job is the slow script (about 32 s; see above)
  await useScripts(page, ["slow-done-after-10-polls", "cancel-midway"]);
  const terminals = waitForTerminals(page, 2, 80_000);
  await page.goto("/");
  await send(page, "keep me");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await send(page, "stop me");
  await expect(cards(page)).toHaveCount(2);
  const [first, second] = await cardIds(page);

  const secondCard = cards(page).nth(1);
  const stop = secondCard.getByRole("button", { name: "Stop" });
  await expect(stop).toBeVisible();
  if (info.project.name === "narrow") {
    const box = await settledBox(stop);
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  const stopped = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/jobs/${second ?? ""}`);
  await stop.click();
  expect((await stopped).status()).toBe(202);
  await expect(secondCard.getByTestId("notice")).toContainText("Stopped.");
  // Only the second was cancelled: the first is still running, with its own Stop.
  await expect(cards(page).first().getByRole("button", { name: "Stop" })).toBeVisible();

  await terminals;
  await expectImageLoaded(cards(page).first().getByTestId("result-image"), `/api/jobs/${first ?? ""}/result`, 64);
  const states = Object.fromEntries((await stub.jobs()).map((j) => [j.id, j.status]));
  expect(states).toEqual({ [first ?? ""]: "done", [second ?? ""]: "cancelled" });
});

test("a full server adds no card, and the prompt stays in the composer with the server's message", async ({ page, request, stub }) => {
  await useScripts(page, ["done-after-3-polls"]);
  const terminals = waitForTerminals(page, 1);
  await page.goto("/");
  await send(page, "the first");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await request.post(`${stub.url}/__stub/busy`, { data: { busy: true } });
  await send(page, "not now");
  await expect(page.locator(".clone-composer-error[role=alert]")).toHaveText("The generation server is busy (scripted); try again later.");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByLabel("Prompt")).toHaveValue("not now");
  await request.post(`${stub.url}/__stub/busy`, { data: { busy: false } });
  await terminals;
  expect(await stub.jobs()).toHaveLength(1);
});

test("leaving the page stops nothing: both jobs finish and the sidebar shows them", async ({ page }, info) => {
  test.skip(info.project.name === "narrow", "the sidebar is a drawer on the phone; the jobs' lifetime is the same at both widths");
  await useScripts(page, ["done-after-3-polls"]);
  await page.goto("/");
  await send(page, "first away");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await send(page, "second away");
  await expect(cards(page)).toHaveCount(2);
  // History is read again while anything runs (BUG_006); it ends when a read shows nothing queued or running.
  const settled = page.waitForResponse(
    async (r) => {
      if (new URL(r.url()).pathname !== "/api/history" || r.request().method() !== "GET") return false;
      const body: unknown = await r.json().catch(() => null);
      const entries = typeof body === "object" && body !== null && "entries" in body && Array.isArray(body.entries) ? (body.entries as unknown[]) : [];
      return entries.length >= 2 && entries.every((e) => typeof e === "object" && e !== null && "status" in e && (e.status === "done" || e.status === "failed" || e.status === "cancelled"));
    },
    { timeout: 25_000 },
  );
  await page.goto("/");
  await settled;
  await expect(page.getByLabel("Generating")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "first away" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "second away" }).first()).toBeVisible();
});

test("a count of 3 from the home page sends three jobs with their own seeds, and lands on a page showing all three", async ({ page, stub }) => {
  await useScripts(page, ["done-after-3-polls"]);
  const terminals = waitForTerminals(page, 3);
  await page.goto("/");
  await imageMode(page);
  await chooseCount(page, 3);
  await expect(page.getByRole("combobox", { name: "Number of images" })).toHaveText("×3");
  const posts: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/jobs") posts.push(JSON.parse(r.postData() ?? "{}") as Record<string, unknown>);
  });
  await send(page, "three lighthouses");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByTestId("user-bubble")).toHaveText(["three lighthouses", "three lighthouses", "three lighthouses"]);
  expect(posts).toHaveLength(3);
  for (const body of posts) expect(body).not.toHaveProperty("seed");

  const ids = await cardIds(page);
  expect(decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""))).toBe(ids[0]);
  const seeds = await Promise.all(ids.map(async (id) => (await requestOf(stub, id))["seed"]));
  expect(new Set(seeds).size).toBeGreaterThan(1);
  await terminals;
  for (const [i, id] of ids.entries()) await expectImageLoaded(cards(page).nth(i).getByTestId("result-image"), `/api/jobs/${id}/result`, 64);

  // The count is an option like the ratio: it survives a reload within the session.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Number of images" })).toHaveText("×3");
});

test("a count the server stops part-way says how many went, and keeps the prompt", async ({ page, request, stub }) => {
  await useScripts(page, ["done-after-3-polls"]);
  const terminals = waitForTerminals(page, 3);
  await page.goto("/");
  await send(page, "the first");
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await imageMode(page);
  await chooseCount(page, 4);
  await request.post(`${stub.url}/__stub/busy`, { data: { afterAccepting: 2 } });
  await send(page, "four trams");
  await expect(page.locator(".clone-composer-error[role=alert]")).toHaveText("Queued 2 of 4. The generation server is busy (scripted); try again later.");
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByLabel("Prompt")).toHaveValue("four trams");
  expect(await stub.jobs()).toHaveLength(3);
  await terminals;
});

test("phone: the count sits beside the text, and the footer row still fits with Send inside the composer", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "the narrow layout only");
  await page.goto("/");
  await imageMode(page);
  await expect(page.getByRole("combobox", { name: "Number of images" })).toBeVisible();
  // The whole footer row, as STORY_019's add-on test measures it: nothing scrolls, and Send stays inside the composer.
  const footer = page.locator(".message-input-column-footer");
  expect(await footer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  const send = await settledBox(page.getByRole("button", { name: "Send" }));
  const composer = await settledBox(page.getByTestId("composer"));
  expect(send.x + send.width).toBeLessThanOrEqual(composer.x + composer.width);
  // On the phone the count sits beside the text, above the footer row, inside the composer.
  const count = await settledBox(page.getByRole("combobox", { name: "Number of images" }));
  const row = await settledBox(footer);
  expect(count.y + count.height).toBeLessThanOrEqual(row.y);
  expect(count.x + count.width).toBeLessThanOrEqual(composer.x + composer.width);
  // Without its arrow on the phone (like the add-on's icon), it keeps a 44px touch area through its ::before.
  expect(count.width + 20).toBeGreaterThanOrEqual(44);
  expect(count.height + 12).toBeGreaterThanOrEqual(44);
});
