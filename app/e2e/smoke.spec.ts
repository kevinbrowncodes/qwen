/**
 * STORY_008 smoke: the production build and the stub, end to end, at both widths: the job is created through the
 * app's own API and the result is shown in an image element, independent of the generation screen (EPIC_003).
 */
import { expect, expectImageLoaded, test } from "./fixtures";

test("the home renders the composer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("Ask Qwen")).toBeVisible();
});

test("health is ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ status: "ok" });
});

test("a job created through the app reaches done and its result loads as an image", async ({ page, stub }) => {
  await page.goto("/");
  const created = await page.request.post("/api/jobs", { headers: { "x-stub-script": "done-after-1-poll" }, data: { prompt: "smoke", ratio: "16:9" } });
  expect(created.status()).toBe(202);
  const body: unknown = await created.json();
  const id = typeof body === "object" && body !== null && "id" in body && typeof body.id === "string" ? body.id : "";
  expect(id).not.toBe("");

  // The stub advances one step per status poll, so the first poll is terminal for done-after-1-poll.
  const status: unknown = await (await page.request.get(`/api/jobs/${id}`)).json();
  expect(status).toMatchObject({ status: "done", result: { url: `/api/jobs/${id}/result` } });
  expect((await stub.jobs()).map((j) => j.status)).toEqual(["done"]);

  const src = `/api/jobs/${id}/result`;
  await page.evaluate((url) => {
    const img = document.createElement("img");
    img.alt = "result";
    img.src = url;
    document.body.append(img);
  }, src);
  await expectImageLoaded(page.getByRole("img", { name: "result" }), src, 64);
});
