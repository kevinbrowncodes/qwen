/**
 * STORY_012: a generation runs in place, from submit to the finished image, and can be cancelled. Stub scripts are
 * chosen per test by adding the stub's `x-stub-script` header to the create request (Playwright routing), so the
 * product code carries no test hook. Every test ends with its job terminal (fixtures.ts checks).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectImageLoaded, settledBox, submitAndWait, test } from "./fixtures";

const FIXTURE = path.join(process.cwd(), "..", "tools", "stub-generation-server", "fixtures", "reference.png");

async function useScript(page: Page, script: string): Promise<void> {
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.continue({ headers: { ...route.request().headers(), "x-stub-script": script } });
  });
}

async function imageMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: "Create Image" }).click();
}

/** The status in a job status response, if the response is one. */
async function statusOf(r: import("@playwright/test").Response): Promise<string | null> {
  try {
    const body: unknown = await r.json();
    return typeof body === "object" && body !== null && "status" in body && typeof body.status === "string" ? body.status : null;
  } catch {
    return null;
  }
}

const jobIdFromUrl = (page: Page): string => decodeURIComponent(new URL(page.url()).pathname.replace(/^\/g\//, ""));

test("text to image: the bubble and the skeleton, then the finished image in place, with Download", async ({ page }) => {
  await useScript(page, "done-after-3-polls");
  await page.goto("/");
  await imageMode(page);
  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "1:1" }).click();
  await page.getByLabel("Prompt").fill("a red bicycle leaning on a brick wall");

  const terminal = page.waitForResponse(async (r) => /\/api\/jobs\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "GET" && (await statusOf(r)) === "done");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await expect(page.getByTestId("user-bubble")).toHaveText("a red bicycle leaning on a brick wall");
  await expect(page.getByTestId("generating")).toBeVisible();
  await terminal;

  const id = jobIdFromUrl(page);
  const image = page.getByTestId("result-image");
  await expectImageLoaded(image, `/api/jobs/${id}/result`, 64);
  // Desktop shows the image's controls on hover, as the reference does; touch has them in the row under the image.
  if (test.info().project.name === "desktop") await image.hover();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("href", `/api/jobs/${id}/result?download=1`);
  await expect(page.getByLabel("Prompt")).toHaveValue("");
});

test("an edit sends the attached image to the server, unchanged, with no ratio", async ({ page, stub }) => {
  await useScript(page, "done-after-1-poll");
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Select Mode" }).click();
  await page.getByRole("menuitem", { name: /Upload attachment/ }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByLabel("Prompt").fill("make it blue");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());

  const received = await stub.received(jobIdFromUrl(page));
  const sha = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
  expect(received).toMatchObject({ request: { ratio: null, referenceImages: 1 }, uploads: [{ filename: "reference.png", sha256: sha }] });
  await expect(page.getByRole("img", { name: "reference.png" })).toBeVisible();
  await expectImageLoaded(page.getByTestId("result-image"), /\/result$/);
});

test("a moderated prompt says so, with Try again", async ({ page }) => {
  await useScript(page, "moderated");
  await page.goto("/");
  await page.getByLabel("Prompt").fill("something the server refuses");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expect(page.getByTestId("notice")).toContainText("The prompt was refused on content grounds.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("a failed generation says so, with the server's reason and Try again", async ({ page }) => {
  await useScript(page, "fails-after-2-polls");
  await page.goto("/");
  await page.getByLabel("Prompt").fill("this one fails");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expect(page.getByTestId("notice")).toContainText("The generation failed: The generation server reported a failure (scripted).");
});

test("Stop cancels a running generation on both sides", async ({ page, stub }) => {
  await useScript(page, "cancel-midway");
  await page.goto("/");
  await page.getByLabel("Prompt").fill("stop me");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("generating")).toBeVisible();
  const stopped = page.waitForResponse((r) => r.request().method() === "DELETE" && /\/api\/jobs\/[^/]+$/.test(new URL(r.url()).pathname));
  const terminal = page.waitForResponse(async (r) => r.request().method() === "GET" && /\/api\/jobs\/[^/]+$/.test(new URL(r.url()).pathname) && (await statusOf(r)) === "cancelled");
  await page.getByRole("button", { name: "Stop" }).click();
  expect((await stopped).status()).toBe(202);
  await terminal;
  await expect(page.getByTestId("notice")).toContainText("Stopped.");
  expect((await stub.jobs()).map((j) => j.status)).toEqual(["cancelled"]);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("a busy server's answer shows under the composer, and nothing is created", async ({ page, request, stub }) => {
  await request.post(`${stub.url}/__stub/busy`, { data: { busy: true } });
  await page.goto("/");
  await page.getByLabel("Prompt").fill("not now");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".clone-composer-error[role=alert]")).toHaveText("The generation server is busy (scripted); try again later.");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Prompt")).toHaveValue("not now");
  expect(await stub.jobs()).toEqual([]);
});

test("a finished generation reopens from its address after a reload", async ({ page }) => {
  await useScript(page, "done-after-1-poll");
  await page.goto("/");
  await page.getByLabel("Prompt").fill("keep me");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const id = jobIdFromUrl(page);
  await submitAndWait(page, () => page.reload());
  await expect(page.getByTestId("user-bubble")).toHaveText("keep me");
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${id}/result`, 64);
});

test("desktop: on a generation's page the composer's menus open upward, inside the window (BUG_010)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the phone layout always opened upward");
  await useScript(page, "done-after-1-poll");
  await page.goto("/");
  await imageMode(page);
  await page.getByLabel("Prompt").fill("a menu test");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  await expect(page.getByTestId("result-image")).toBeVisible();
  const height = page.viewportSize()?.height ?? 0;
  const inside = async (popup: import("@playwright/test").Locator): Promise<void> => {
    const box = await popup.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? Infinity)).toBeLessThanOrEqual(height);
  };
  for (const name of ["Image model", "Aspect ratio", "Add-on"]) {
    await page.getByRole("combobox", { name }).click();
    await inside(page.getByRole("listbox", { name }));
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Select Mode" }).click();
  await inside(page.getByRole("menu", { name: "Select Mode" }));
  await page.getByRole("menuitem", { name: "Create Image" }).click();
});

/** The seed the stub drew or was sent, from what it received. */
async function receivedRequest(stub: import("./fixtures").Stub, id: string): Promise<Record<string, unknown>> {
  const body = await stub.received(id);
  const request = typeof body === "object" && body !== null && "request" in body ? body.request : null;
  return typeof request === "object" && request !== null ? { ...request } : {};
}

test("Info shows the settings that made the image, Same seed again reproduces them, and they survive a reload (STORY_024)", async ({ page, stub }, info) => {
  await useScript(page, "done-after-1-poll");
  await page.goto("/");
  await imageMode(page);
  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "1:1" }).click();
  await page.getByRole("combobox", { name: "Add-on" }).click();
  await page.getByRole("listbox", { name: "Add-on" }).getByRole("option", { name: "Fake detail" }).click();
  await page.getByLabel("Prompt").fill("a red bicycle");
  await submitAndWait(page, () => page.getByRole("button", { name: "Send" }).click());
  const first = jobIdFromUrl(page);
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${first}/result`, 64);
  const seed = (await receivedRequest(stub, first))["seed"];
  expect(typeof seed).toBe("number");

  const infoButton = page.getByRole("button", { name: "Info" });
  if (info.project.name === "narrow") {
    const box = await settledBox(infoButton);
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  const expectPanel = async (): Promise<void> => {
    await infoButton.click();
    const panel = page.getByRole("region", { name: "Settings" });
    const value = (row: string) => panel.locator(`[data-row="${row}"] dd`);
    await expect(value("prompt")).toHaveText("a red bicycle");
    // The stub's add-on has a trigger word, which the server appended.
    await expect(value("sent")).toHaveText("a red bicycle, sharp focus");
    await expect(value("model")).toHaveText("Qwen-Image 2.1");
    await expect(value("size")).toHaveText("1:1 · 64 × 36");
    await expect(value("seed")).toHaveText(String(seed));
    await expect(value("addOn")).toHaveText("Fake detailstrength 0.8 · guidance 3");
    await expect(value("time")).toHaveText(/^\d+ s$/);
  };
  await expectPanel();

  // Same seed again sends every setting of this one, the seed included. Its card is added to this page (STORY_025).
  await submitAndWait(page, () => page.getByRole("button", { name: "Same seed again" }).click());
  const newest = page.getByTestId("generation").last();
  await expect(page.getByTestId("generation")).toHaveCount(2);
  const second = (await newest.getAttribute("data-job-id")) ?? "";
  expect(second).not.toBe(first);
  expect(jobIdFromUrl(page)).toBe(first);
  expect(await receivedRequest(stub, second)).toMatchObject({ seed, prompt: "a red bicycle", ratio: "1:1", lora: "fake-detail" });
  await expectImageLoaded(newest.getByTestId("result-image"), `/api/jobs/${second}/result`, 64);

  // Regenerate is unchanged: the browser sends no seed, so the server draws a new one.
  const regenerated = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/jobs");
  await submitAndWait(page, () => newest.getByRole("button", { name: "Regenerate" }).click());
  expect(JSON.parse((await regenerated).postData() ?? "{}")).not.toHaveProperty("seed");
  await expect(page.getByTestId("generation")).toHaveCount(3);

  // Loaded afresh, the first job's panel reads the same values from its echo, not from this page's memory.
  await submitAndWait(page, () => page.goto(`/g/${encodeURIComponent(first)}`));
  await expectImageLoaded(page.getByTestId("result-image"), `/api/jobs/${first}/result`, 64);
  await expectPanel();
});
