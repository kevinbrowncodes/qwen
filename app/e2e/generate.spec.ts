/**
 * STORY_012: a generation runs in place, from submit to the finished image, and can be cancelled. Stub scripts are
 * chosen per test by adding the stub's `x-stub-script` header to the create request (Playwright routing), so the
 * product code carries no test hook. Every test ends with its job terminal (fixtures.ts checks).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectImageLoaded, submitAndWait, test } from "./fixtures";

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
