/**
 * STORY_010: the composer enters image mode and offers the model and the aspect ratio. Reference readings:
 * docs/recon/2026-09-26/states/composer-image-mode@1437.json, aspect-ratio-open@1437.json, composer-typed@1437.json.
 */
import { expect, settledBox, test } from "./fixtures";

const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "16:9", "9:16"];

test("+ opens the menu, Create Image enters image mode with the pill, the model and 16:9", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  const menu = page.getByRole("menu", { name: "Select Mode" });
  await expect(menu.getByRole("menuitem")).toHaveText([/Upload attachment/, "Create Image"]);
  await menu.getByRole("menuitem", { name: "Create Image" }).click();
  await expect(menu).toHaveCount(0);

  const pill = page.getByTestId("image-pill");
  await expect(pill).toBeVisible();
  if (info.project.name === "desktop") await expect(pill).toContainText("Create Image");
  else await expect(pill).not.toContainText("Create Image");
  await expect(page.getByRole("combobox", { name: "Aspect ratio" })).toHaveText("16:9");
  await expect(page.getByRole("combobox", { name: "Image model" })).toHaveText(info.project.name === "desktop" ? "Qwen-Image 2.1" : "Model 2.1");
  expect(await pill.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(66, 110, 255)");
});

test("the ratio dropdown lists the seven ratios in the reference's order and picks one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "Aspect ratio" });
  await trigger.click();
  const list = page.getByRole("listbox", { name: "Aspect ratio" });
  await expect(list.getByRole("option")).toHaveText(RATIOS);
  await expect(list.getByRole("option", { selected: true })).toHaveText("16:9");
  await list.getByRole("option", { name: "1:1" }).click();
  await expect(trigger).toHaveText("1:1");
  await expect(list).toHaveCount(0);
});

test("the dropdowns work by keyboard", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard");
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "Aspect ratio" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("9:16");
  await expect(trigger).toBeFocused();
});

test("Send is enabled only with text, and × leaves image mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Prompt").fill("a red bicycle leaning on a brick wall");
  await expect(send).toBeEnabled();
  await page.getByLabel("Prompt").fill("   ");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Leave Create Image" }).click();
  await expect(page.getByTestId("image-pill")).toHaveCount(0);
});

test("desktop: image mode is 760 wide and 106 tall, as captured", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop measurement");
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const box = await settledBox(page.getByTestId("composer"));
  expect(box.width).toBe(760);
  expect(box.height).toBe(106);
});

test("image mode and the ratio survive a reload within the session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "3:4" }).click();
  await page.reload();
  await expect(page.getByTestId("image-pill")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Aspect ratio" })).toHaveText("3:4");
});
