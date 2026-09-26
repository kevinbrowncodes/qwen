/**
 * STORY_011: reference images are attached to the composer for an edit. Reading:
 * docs/recon/2026-09-26/states/composer-reference-attached@1437.json. Uses the stub's committed upload fixture; what
 * the server receives is asserted in STORY_012's edit spec, where the submit happens.
 */
import path from "node:path";
import { expect, settledBox, test } from "./fixtures";

// Next.js adds its own (empty) role="alert" route announcer, so the composer's message is found by its class.
const refusal = (page: import("@playwright/test").Page) => page.locator(".clone-composer-error[role=alert]");

const FIXTURE = path.join(process.cwd(), "..", "tools", "stub-generation-server", "fixtures", "reference.png");

async function upload(page: import("@playwright/test").Page, files: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: /Upload attachment/ }).click();
  await (await chooser).setFiles(files);
}

test("attaching an image shows its thumbnail, enters image mode and hides the ratio; removing it brings the ratio back", async ({ page }) => {
  await page.goto("/");
  await upload(page, FIXTURE);
  const thumb = page.getByTestId("reference-thumb");
  await expect(thumb).toHaveCount(1);
  const image = thumb.getByRole("img", { name: "reference.png" });
  await expect.poll(() => image.evaluate((el) => (el instanceof HTMLImageElement ? el.complete && el.naturalWidth : 0))).toBe(32);
  await expect(page.getByTestId("image-pill")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Aspect ratio" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Image model" })).toBeVisible();

  const box = await settledBox(thumb);
  expect(box.width).toBe(56);
  expect(box.height).toBe(56);
  expect(await thumb.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("16px");

  await page.getByRole("button", { name: "Remove file" }).click();
  await expect(page.getByTestId("reference-thumb")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Aspect ratio" })).toHaveText("16:9");
});

test("desktop: one thumbnail grows image mode from 106 to 170, as captured", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop measurement");
  await page.goto("/");
  await upload(page, FIXTURE);
  await expect(page.getByTestId("reference-thumb")).toHaveCount(1);
  expect((await settledBox(page.getByTestId("composer"))).height).toBe(170);
});

test("a file that is not an image is refused with its name, and nothing is attached", async ({ page }) => {
  await page.goto("/");
  await upload(page, { name: "fake.png", mimeType: "image/png", buffer: Buffer.from("hello, I am not a PNG") });
  await expect(refusal(page)).toHaveText("fake.png is not a PNG, JPEG or WebP image.");
  await expect(page.getByTestId("reference-thumb")).toHaveCount(0);
});

test("an eleventh image is refused and the ten already attached stay", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the limit is the same at both widths");
  await page.goto("/");
  await upload(page, Array.from({ length: 10 }, () => FIXTURE));
  await expect(page.getByTestId("reference-thumb")).toHaveCount(10);
  await upload(page, FIXTURE);
  await expect(refusal(page)).toHaveText("Attach at most 10 reference images.");
  await expect(page.getByTestId("reference-thumb")).toHaveCount(10);
});

test("narrow: the remove button has a 44px touch area", async ({ page }, info) => {
  test.skip(info.project.name !== "narrow", "touch branch");
  await page.goto("/");
  await upload(page, FIXTURE);
  const remove = page.getByRole("button", { name: "Remove file" });
  const box = await settledBox(remove);
  // The glyph is 14px (reading); ::before extends the hit area 15px each side.
  expect(box.width + 30).toBeGreaterThanOrEqual(44);
  await remove.tap();
  await expect(page.getByTestId("reference-thumb")).toHaveCount(0);
});
