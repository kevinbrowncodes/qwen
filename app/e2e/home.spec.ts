/**
 * STORY_009: the home is laid out like the reference, from its own lifted stylesheets. Measured values are from
 * docs/recon/2026-09-26/states/home-signed-in@1437.json and @393.json; every box is measured after it settles.
 */
import { expect, settledBox, test } from "./fixtures";

test("desktop: the sidebar, the heading and the composer match the reference's measurements", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop layout");
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "127.0.0.1") external.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How can I help you?" })).toBeVisible();
  await expect(page.getByPlaceholder("Ask Qwen")).toBeVisible();

  const composer = page.getByTestId("composer");
  const box = await settledBox(composer);
  expect(box.width).toBe(760);
  expect(Math.abs(box.x - 455)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y - 461)).toBeLessThanOrEqual(2);
  expect(await composer.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("28px");
  expect(await composer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(44, 44, 44)");

  expect((await settledBox(page.getByTestId("sidebar"))).width).toBe(240);
  // The reference's logo (CHORE_003): loaded, at its .logo-img size.
  const logo = page.getByRole("img", { name: "Qwen" });
  await expect.poll(() => logo.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0))).toBeGreaterThan(0);
  expect(await settledBox(logo)).toMatchObject({ width: 75, height: 20 });
  expect(await page.getByRole("heading", { name: "How can I help you?" }).evaluate((el) => getComputedStyle(el).fontSize)).toBe("24px");
  // The lifted stylesheet and sprite are served locally; nothing is fetched from the reference's hosts.
  expect(external).toEqual([]);
});

test("desktop: the sidebar toggle collapses and restores the sidebar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop layout");
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("aria-hidden", "false");
});

test("narrow: the drawer opens from the menu and closes from the backdrop; the composer is pinned at the bottom", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "phone layout");
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/mobile/);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const height = viewport?.height ?? 0;
  const width = viewport?.width ?? 0;

  const composer = await settledBox(page.getByTestId("composer"));
  expect(height - (composer.y + composer.height)).toBeLessThanOrEqual(40);
  expect(Math.abs(composer.x - 17)).toBeLessThanOrEqual(2);

  // Closed, the drawer's frame is 0 wide (capture notes: "fixed, 0 wide when closed"); its panel keeps its width inside.
  const sidebar = page.getByTestId("sidebar");
  expect((await settledBox(page.locator("#sidebar"))).width).toBeLessThan(1);

  const menu = page.getByRole("button", { name: "Open sidebar" });
  const menuBox = await settledBox(menu);
  expect(menuBox.width).toBeGreaterThanOrEqual(44);
  expect(menuBox.height).toBeGreaterThanOrEqual(44);
  await menu.tap();
  const open = await settledBox(sidebar);
  // 335 at 393 wide on the reference: its rem scale makes it 20rem at width / 375 × 16px.
  expect(Math.abs(open.width - (20 * width * 16) / 375)).toBeLessThanOrEqual(2);
  expect(open.x).toBe(0);

  await page.getByTestId("drawer-backdrop").tap({ position: { x: width - 10, y: height / 2 } });
  await expect(page.getByTestId("drawer-backdrop")).toHaveCount(0);
});
