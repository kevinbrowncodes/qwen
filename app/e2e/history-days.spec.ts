/**
 * STORY_032: the sidebar shows only today's chats, and History shows earlier days one at a time. The app makes the
 * chats; the spec then moves two of them to earlier days in the run's history file (QWEN_E2E_HISTORY_FILE, set by
 * playwright.config.ts), which the app reads on every request, so the product has no test hook. Days are derived
 * from the clock (CLAUDE.md §6b). Every job the spec starts reaches a terminal status before it ends.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, settledBox, submitAndWait, test } from "./fixtures";

async function clearHistory(request: APIRequestContext): Promise<void> {
  const body: unknown = await (await request.get("/api/history")).json();
  const entries: unknown[] = typeof body === "object" && body !== null && "entries" in body && Array.isArray(body.entries) ? body.entries : [];
  for (const e of entries) {
    if (typeof e === "object" && e !== null && "id" in e && typeof e.id === "string") await request.delete(`/api/history/${encodeURIComponent(e.id)}`);
  }
}

/** Noon, `days` before today, local time: clear of midnight and of any clock change. */
function noonDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}
const dayKey = (d: Date): string => `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const longDay = (d: Date): string => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const shortDay = (d: Date): string => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Moves every image of a chat to `when`, in the app's history file. */
function backdate(chatId: string, when: Date): void {
  const file = process.env["QWEN_E2E_HISTORY_FILE"];
  if (!file) throw new Error("QWEN_E2E_HISTORY_FILE is not set (playwright.config.ts sets it)");
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const moved = list.map((e) => (typeof e === "object" && e !== null && "chatId" in e && e.chatId === chatId ? { ...e, createdAt: when.toISOString(), updatedAt: when.toISOString() } : e));
  writeFileSync(file, `${JSON.stringify(moved, null, 2)}\n`);
}

async function makeChat(page: Page, prompt: string): Promise<string> {
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

test("today's chats are in the sidebar, and History steps through earlier days", async ({ page }, info) => {
  // Four generations, each waited to its terminal status, plus several page loads.
  test.slow();
  const narrow = info.project.name === "narrow";
  const harbour = await makeChat(page, "harbour at dusk");
  const lighthouses = await makeChat(page, "two lighthouses");
  await makeChat(page, "a red bicycle");
  backdate(harbour, noonDaysAgo(2));
  backdate(lighthouses, noonDaysAgo(4));

  // The sidebar: today's chat only, and History.
  await page.goto("/");
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["a red bicycle"]);
  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);

  // The most recent earlier day: the harbour chat, with its thumbnail loaded.
  const label = (d: Date): string => (narrow ? shortDay(d) : longDay(d));
  await expect(page.getByRole("heading", { name: label(noonDaysAgo(2)) })).toBeVisible();
  const rows = page.getByTestId("history-day-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("harbour at dusk");
  await expect(rows.first()).toContainText("1 image");
  await expect.poll(() => rows.first().locator("img").evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBe(64);

  // ‹ skips the empty day in between; ‹ is then disabled; Back returns.
  await page.getByRole("button", { name: "Earlier day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${dayKey(noonDaysAgo(4))}$`));
  await expect(page.getByRole("heading", { name: label(noonDaysAgo(4)) })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("two lighthouses");
  await expect(page.getByRole("button", { name: "Earlier day" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Later day" })).toBeEnabled();
  await page.goBack();
  await expect(page.getByRole("heading", { name: label(noonDaysAgo(2)) })).toBeVisible();

  // A day with nothing on it, picked with the date input.
  await page.getByLabel("Pick a day").fill(dayKey(noonDaysAgo(3)));
  await expect(page.getByText("No chats on this day.")).toBeVisible();

  if (narrow) {
    for (const name of ["Earlier day", "Later day", "Choose a day"]) {
      const box = await settledBox(page.getByRole("button", { name }));
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator(".clone-history").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  }

  // Open the harbour chat: History is the sidebar's open place, and no today row is highlighted.
  await page.goto(`/history?day=${dayKey(noonDaysAgo(2))}`);
  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/g/${harbour}$`));
  await openSidebar(page, narrow);
  await expect(page.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("history-row").getByRole("link", { name: "harbour at dusk" })).toHaveCount(0);
  if (narrow) await page.getByTestId("drawer-backdrop").tap();

  // Sending in it brings it back to today, above the other, and off its old day.
  await page.getByLabel("Prompt").fill("make it blue");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expect(page.getByTestId("generation")).toHaveCount(2);
  await page.goto("/");
  await openSidebar(page, narrow);
  await expect(page.getByTestId("history-row")).toHaveText(["harbour at dusk", "a red bicycle"]);
  await page.goto(`/history?day=${dayKey(noonDaysAgo(2))}`);
  await expect(page.getByText("No chats on this day.")).toBeVisible();
});
