/**
 * STORY_010: the composer enters image mode and offers the model and the aspect ratio. Reference readings:
 * docs/recon/2026-09-26/states/composer-image-mode@1437.json, aspect-ratio-open@1437.json, composer-typed@1437.json.
 */
import type { Locator } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, submitAndWait, test } from "./fixtures";

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
  // CHORE_009: icon and × only, at both widths, named for screen readers and as a tooltip.
  await expect(pill).toHaveText("");
  await expect(pill).toHaveAccessibleName("Create Image");
  await expect(pill).toHaveAttribute("title", "Create Image");
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

test("an add-on is chosen from the composer and the server receives it (STORY_019)", async ({ page, stub }, info) => {
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "LoRA" });
  // Desktop shows the choice; narrow shows the icon alone, like the model's short label.
  if (info.project.name === "desktop") await expect(trigger).toHaveText("None");
  await trigger.click();
  const list = page.getByRole("listbox", { name: "LoRA" });
  await expect(list.getByRole("option")).toHaveText(["None", "Fake detail", "Fake style"]);
  await expect(list.getByRole("option", { selected: true })).toHaveText("None");
  if (info.project.name === "narrow") {
    // The popup opened from the icon near the right edge stays on screen, and the footer still fits beside Send.
    const box = await settledBox(list);
    expect(box.x + box.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) - 8);
    const footer = page.locator(".message-input-column-footer");
    expect(await footer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    const send = await settledBox(page.getByRole("button", { name: "Send" }));
    const composer = await settledBox(page.getByTestId("composer"));
    expect(send.x + send.width).toBeLessThanOrEqual(composer.x + composer.width);
    // Every trigger label stays on one line (the model's is 32 tall, like the others).
    expect((await settledBox(page.getByRole("combobox", { name: "Image model" }))).height).toBeLessThanOrEqual(32);
    // The icon-only trigger keeps a 44px touch area: its ::before reaches 10px each side and 6px above and below.
    const icon = await settledBox(trigger);
    expect(icon.width + 20).toBeGreaterThanOrEqual(44);
    expect(icon.height + 12).toBeGreaterThanOrEqual(44);
  }
  await list.getByRole("option", { name: "Fake detail" }).click();
  if (info.project.name === "desktop") await expect(trigger).toHaveText("Fake detail");
  await page.getByLabel("Prompt").fill("a portrait in a garden");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
  expect(await stub.received(id)).toMatchObject({ request: { lora: "fake-detail", prompt: "a portrait in a garden" } });
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
});

/** The element's box grown by its ::before's negative insets: the area a tap lands on (the touch-area rule). */
async function touchArea(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await settledBox(locator);
  const inset = await locator.evaluate((el) => {
    const before = getComputedStyle(el, "::before");
    if (before.content === "none" || before.position !== "absolute") return { x: 0, y: 0 };
    const px = (v: string): number => Math.max(0, -parseFloat(v) || 0);
    return { x: px(before.left) + px(before.right), y: px(before.top) + px(before.bottom) };
  });
  return { width: box.width + inset.x, height: box.height + inset.y };
}

test("a LoRA's card says what it was made for and shows the facts, and choosing from it sends that LoRA (STORY_030)", async ({ page, stub }, info) => {
  const narrow = info.project.name === "narrow";
  await page.route("**/api/jobs", (route) => (route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-stub-script": "done-after-1-poll" } }) : route.continue()));
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "LoRA" });
  await trigger.click();
  const list = page.getByRole("listbox", { name: "LoRA" });
  // Each option's text is still its label alone; the stub describes both of its LoRAs, so both have an info button.
  await expect(list.getByRole("option")).toHaveText(["None", "Fake detail", "Fake style"]);
  const infoButton = (name: string) => list.getByRole("option", { name }).locator(".clone-dropdown-item-info");
  await expect(list.getByRole("option", { name: "None" }).locator(".clone-dropdown-item-info")).toHaveCount(0);
  await expect(infoButton("Fake detail")).toHaveCount(1);
  if (narrow) {
    const area = await touchArea(infoButton("Fake style"));
    expect(area.width).toBeGreaterThanOrEqual(44);
    expect(area.height).toBeGreaterThanOrEqual(44);
  }

  // The bare card: the trigger, strength and guidance only, and nothing was picked.
  await infoButton("Fake style").click();
  const bare = page.getByRole("group", { name: "About Fake style" });
  await expect(bare.getByTestId(/^lora-fact-/)).toHaveText(["Trigger—", "Strength1", "Guidancedefault"]);
  await expect(bare.getByText("Made for")).toHaveCount(0);
  await expect(bare.getByText("Capabilities")).toHaveCount(0);
  if (!narrow) await expect(trigger).toHaveText("None");

  // Back to the list, then the fully described card.
  await bare.getByRole("button", { name: "Back to the list" }).click();
  await infoButton("Fake detail").click();
  const card = page.getByRole("group", { name: "About Fake detail" });
  await expect(card.getByText("Sharper fine detail in skin, hair and fabric, for text-to-image and edits.")).toBeVisible();
  await expect(card.getByTestId("lora-ability")).toHaveText(["DetailClaimedTrained on close-ups.BenchSharp in 3 of 4 edits.", "HandsClaimednot statedBenchnot tested"]);
  await expect(card.getByText("Bench: The stub's own bench.")).toBeVisible();
  await expect(card.getByTestId(/^lora-fact-/)).toHaveText(["CreatorStub Creator", "Sourceexample.com ↗", "Downloads18,951 (2026-10-07)", "Triggersharp focus", "Strength0.8", "Guidance3"]);
  const source = card.getByRole("link", { name: /example\.com/ });
  await expect(source).toHaveAttribute("href", "https://example.com/loras/fake-detail");
  await expect(source).toHaveAttribute("target", "_blank");

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await settledBox(card);
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const pick = card.getByRole("button", { name: "Use this LoRA" });
  if (narrow) {
    // Inside the viewport and opening upward from its trigger, as the list does (it covers the prompt line, as the
    // list does), with 44px touch targets; the page itself does not scroll.
    const opener = await settledBox(trigger);
    expect(box.y + box.height).toBeLessThanOrEqual(opener.y);
    const back = await touchArea(card.getByRole("button", { name: "Back to the list" }));
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
    expect((await settledBox(pick)).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
    expect(await page.locator(".message-input-column-footer").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  } else {
    expect(Math.round(box.width)).toBe(300);
  }

  // Choosing from the card picks the LoRA, and the server receives it.
  await pick.click();
  await expect(card).toHaveCount(0);
  if (!narrow) await expect(trigger).toHaveText("Fake detail");
  await page.getByLabel("Prompt").fill("a portrait in a garden");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));
  expect(await stub.received(id)).toMatchObject({ request: { lora: "fake-detail" } });
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
});

test("a LoRA's card opens and closes by keyboard (STORY_030)", async ({ page }, info) => {
  test.skip(info.project.name === "narrow", "the keyboard path is the desktop's; the phone is covered by the touch test above");
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const trigger = page.getByRole("combobox", { name: "LoRA" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("group", { name: "About Fake detail" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("listbox", { name: "LoRA" }).getByRole("option", { name: "Fake detail" })).toHaveAttribute("data-active", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: /^About / })).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText("None");
});

test("the prompt box grows with its text and scrolls only past its maximum (BUG_015)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
  const box = page.getByLabel("Prompt");
  // The limits are read from the stylesheet, not written here: the phone's are in rem, and its root font is not 16px
  // (one line there measured 24.96px on 2026-10-17). Desktop is 32 to 208.
  const read = () =>
    box.evaluate((el) => {
      const cs = getComputedStyle(el);
      const oneLine = Math.max(parseFloat(cs.minHeight), parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
      return { height: el.getBoundingClientRect().height, scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowY: cs.overflowY, oneLine, max: parseFloat(cs.maxHeight) };
    });

  const empty = await read();
  expect(Math.abs(empty.height - empty.oneLine)).toBeLessThanOrEqual(1);
  expect(empty.overflowY).toBe("hidden");
  expect(empty.scrollWidth).toBe(empty.clientWidth);

  await box.fill("a harbour at dusk\ntwo lighthouses\na red bicycle");
  const three = await read();
  expect(three.height).toBeGreaterThan(empty.oneLine * 2);
  expect(three.height).toBeLessThan(three.max);
  expect(three.scrollHeight).toBeLessThanOrEqual(Math.ceil(three.height));
  expect(three.overflowY).toBe("hidden");

  await box.fill(Array.from({ length: 30 }, (_, i) => `line ${String(i + 1)}`).join("\n"));
  const long = await read();
  expect(Math.abs(long.height - long.max)).toBeLessThanOrEqual(1);
  expect(long.overflowY).toBe("auto");

  await box.fill("");
  const cleared = await read();
  expect(Math.abs(cleared.height - cleared.oneLine)).toBeLessThanOrEqual(1);
  expect(cleared.overflowY).toBe("hidden");
});
