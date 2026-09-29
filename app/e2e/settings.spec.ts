/**
 * STORY_020: the interface zoom, chosen in Settings. Every other spec runs at 1x and covers the rest unchanged.
 */
import { devices, type Page } from "@playwright/test";
import { expect, settledBox, test } from "./fixtures";

async function openSettings(page: Page, narrow: boolean): Promise<void> {
  if (narrow) await page.getByRole("button", { name: "Open sidebar" }).tap();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

const zoomOf = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.style.zoom);

test("a zoom step applies at once, keeps the page inside the window, keeps popups at their trigger, and survives a reload", async ({ page }, info) => {
  const narrow = info.project.name === "narrow";
  await page.goto("/");
  await openSettings(page, narrow);
  await page.getByRole("radio", { name: "1.5×" }).click();
  expect(await zoomOf(page)).toBe("1.5");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The page fits the window: no overflow caused by the zoom, and the composer ends inside it.
  const height = page.viewportSize()?.height ?? 0;
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
  const composer = await settledBox(page.getByTestId("composer"));
  expect(composer.y + composer.height).toBeLessThanOrEqual(height);

  // A popup opens at its trigger, inside the window.
  if (narrow) {
    // Settings was opened from the drawer: close it from its backdrop, as home.spec does.
    // A finger on the strip of backdrop right of the drawer, in window coordinates.
    await page.touchscreen.tap((page.viewportSize()?.width ?? 0) - 10, height / 3);
    await expect(page.getByTestId("drawer-backdrop")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "Aspect ratio" });
  await trigger.click();
  const list = await settledBox(page.getByRole("listbox", { name: "Aspect ratio" }));
  const at = await settledBox(trigger);
  // At its trigger: overlapping it across, and within the zoomed 4px gap above or below it. (On the phone layout it
  // is pulled left to stay on screen, so its left edge need not match the trigger's.)
  expect(list.x < at.x + at.width && list.x + list.width > at.x).toBe(true);
  const gap = list.y + list.height <= at.y ? at.y - (list.y + list.height) : list.y - (at.y + at.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(4 * 1.5 + 1);
  const width = page.viewportSize()?.width ?? 0;
  expect(list.x >= 0 && list.x + list.width <= width && list.y >= 0 && list.y + list.height <= height).toBe(true);
  await page.keyboard.press("Escape");

  // Remembered, and applied before first paint.
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await zoomOf(page)).toBe("1.5");
});

test.describe("the owner's Studio Display window", () => {
  // The owner's Safari window is about 2670 CSS px wide (their screenshot is 5344 device px at 2x): a desktop device.
  // Its fields, not its defaultBrowserType, which Playwright forbids inside a describe (it would force a new worker).
  const desktop = devices["Desktop Chrome"];
  test.use({ userAgent: desktop.userAgent, deviceScaleFactor: desktop.deviceScaleFactor, isMobile: false, hasTouch: false, viewport: { width: 2670, height: 1500 } });

test("desktop: 4x in a wide window switches to the phone layout, and 1x brings the desktop layout back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop window");
  await page.goto("/");
  await openSettings(page, false);
  await page.getByRole("radio", { name: "4×" }).click();
  await expect(page.locator("html.mobile")).toHaveCount(1);
  // The phone layout's drawer holds the sidebar now; the dialog is still open over it.
  await page.getByRole("radio", { name: "1×" }).click();
  await expect(page.locator("html.mobile")).toHaveCount(0);
  expect(await zoomOf(page)).toBe("");
});
});
