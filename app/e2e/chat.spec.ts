/**
 * STORY_031: every image sent from a chat stays in that chat, and the chat reopens whole. History is shared by every
 * spec in a run, so this spec empties it first, and counts only what it made (CLAUDE.md §6b). Every job it starts
 * reaches a terminal status before the test ends.
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

const cards = (page: Page): Locator => page.getByTestId("generation");
const cardIds = (page: Page): Promise<string[]> => cards(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-job-id") ?? ""));
const pathId = (page: Page): string => decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));

async function send(page: Page, prompt: string): Promise<void> {
  await page.getByLabel("Prompt").fill(prompt);
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
}

async function openSidebar(page: Page, narrow: boolean): Promise<void> {
  if (narrow) await page.getByRole("button", { name: "Open sidebar" }).tap();
}

/** The names of the fields the stub received for a job (it never sees the app's own `chat`). */
async function fieldsSent(stub: import("./fixtures").Stub, id: string): Promise<unknown> {
  const body = await stub.received(id);
  return typeof body === "object" && body !== null && "fields" in body ? body.fields : null;
}

test.beforeEach(async ({ page, request }) => {
  await clearHistory(request);
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
});

test("a chat keeps its turns through a reload, a reopen, a new chat, My Library and both deletes", async ({ page, stub }, info) => {
  // Five generations, each waited to its terminal status: more than the 30 s default under full-suite load.
  test.slow();
  const narrow = info.project.name === "narrow";

  // Three turns: a prompt from home, a prompt from its page, then Regenerate on the second.
  await page.goto("/");
  await send(page, "a red bicycle against a brick wall");
  const chat = pathId(page);
  await send(page, "make the bicycle blue");
  await expect(cards(page)).toHaveCount(2);
  await submitAndWait(page, () => cards(page).nth(1).getByRole("button", { name: "Regenerate" }).click());
  await expect(cards(page)).toHaveCount(3);
  const ids = await cardIds(page);
  expect(ids[0]).toBe(chat);
  await expect(page.getByTestId("user-bubble")).toHaveText(["a red bicycle against a brick wall", "make the bicycle blue", "make the bicycle blue"]);
  for (const [i, id] of ids.entries()) await expectImageLoaded(cards(page).nth(i).getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
  // The app keeps the chat to itself: the server never received the field.
  for (const id of ids.slice(1)) expect(await fieldsSent(stub, id)).not.toContain("chat");

  // One row, titled by the first prompt.
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["a red bicycle against a brick wall"]);

  // A reload shows the same turns in the same order.
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  expect(await cardIds(page)).toEqual(ids);

  // Reopened from the sidebar: the same.
  await page.goto("/");
  await openSidebar(page, narrow);
  await page.getByTestId("history-row").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/g/${chat}$`));
  await expect(cards(page)).toHaveCount(3);
  expect(await cardIds(page)).toEqual(ids);

  // A send from home starts a second chat, listed above the first.
  await page.goto("/");
  await send(page, "a green kite over a beach");
  const second = pathId(page);
  expect(second).not.toBe(chat);
  await expect(cards(page)).toHaveCount(1);
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["a green kite over a beach", "a red bicycle against a brick wall"]);

  // My Library opens the first chat at its second turn, outlined.
  await page.goto("/library");
  const turn = ids[1] ?? "";
  await page.locator(`a.clone-card-img[href$="#${encodeURIComponent(turn)}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/g/${chat}#${turn}$`));
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator(`[data-testid="generation"][data-job-id="${turn}"]`)).toHaveClass(/clone-turn-highlight/);

  // The card's Delete removes one image (asking first); the chat and its row stay.
  if (narrow) {
    const box = await settledBox(cards(page).nth(1).getByRole("button", { name: "Delete" }));
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Delete this image? This cannot be undone.");
    void dialog.accept();
  });
  const one = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/history/${encodeURIComponent(turn)}`);
  await cards(page).nth(1).getByRole("button", { name: "Delete" }).click();
  expect((await one).status()).toBe(200);
  await expect(cards(page)).toHaveCount(2);
  expect(await cardIds(page)).toEqual([ids[0], ids[2]]);

  // The row's Delete removes the whole chat, and goes home.
  await openSidebar(page, narrow);
  const row = page.getByTestId("history-row").filter({ hasText: "a red bicycle against a brick wall" });
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Delete this chat and its 2 images? This cannot be undone.");
    void dialog.accept();
  });
  const all = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/chats/${encodeURIComponent(chat)}`);
  if (!narrow) await row.hover();
  await row.getByRole("button", { name: "Chat Menu" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  expect((await all).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["a green kite over a beach"]);
});
