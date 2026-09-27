/**
 * STORY_011: reference images are attached to the composer for an edit. Reading:
 * docs/recon/2026-09-26/states/composer-reference-attached@1437.json. Uses the stub's committed upload fixture; what
 * the server receives is asserted in STORY_012's edit spec, where the submit happens.
 */
import path from "node:path";
import { expect, settledBox, submitAndWait, test } from "./fixtures";

// Next.js adds its own (empty) role="alert" route announcer, so the composer's message is found by its class.
const refusal = (page: import("@playwright/test").Page) => page.locator(".clone-composer-error[role=alert]");

const FIXTURE = path.join(process.cwd(), "..", "tools", "stub-generation-server", "fixtures", "reference.png");

async function upload(page: import("@playwright/test").Page, files: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: /Upload attachment/ }).click();
  await (await chooser).setFiles(files);
}

test("attaching an image shows its thumbnail and enters image mode; the ratio offers Match reference, and removing the image brings the plain ratio back", async ({ page }) => {
  await page.goto("/");
  await upload(page, FIXTURE);
  const thumb = page.getByTestId("reference-thumb");
  await expect(thumb).toHaveCount(1);
  const image = thumb.getByRole("img", { name: "reference.png" });
  await expect.poll(() => image.evaluate((el) => (el instanceof HTMLImageElement ? el.complete && el.naturalWidth : 0))).toBe(32);
  await expect(page.getByTestId("image-pill")).toBeVisible();
  // STORY_017 (owner's request, a departure): the ratio stays, reading Match reference by default. This replaces the
  // STORY_011 assertion that it disappears, which followed the reference.
  await expect(page.getByRole("combobox", { name: "Aspect ratio" })).toHaveText("Match reference");
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

test("an edit can choose a ratio, and the server receives it (STORY_017)", async ({ page, stub }) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
  await page.goto("/");
  await upload(page, FIXTURE);
  const trigger = page.getByRole("combobox", { name: "Aspect ratio" });
  await trigger.click();
  const options = page.getByRole("listbox", { name: "Aspect ratio" }).getByRole("option");
  await expect(options).toHaveText(["Match reference", "1:1", "2:3", "3:2", "3:4", "4:3", "16:9", "9:16"]);
  await page.getByRole("option", { name: "1:1" }).click();
  await expect(trigger).toHaveText("1:1");
  await page.getByLabel("Prompt").fill("make it square");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
  expect(await stub.received(id)).toMatchObject({ request: { ratio: "1:1", referenceImages: 1 } });
});
