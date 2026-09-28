/**
 * BUG_009: the app declares its icons, so the browser tab, Safari's Add to Dock and an installed app show the Qwen
 * mark (built from the harvested logo by recon/src/app-icons.ts), not a letter tile.
 */
import { expect, test } from "./fixtures";

test("the page links a favicon, an apple touch icon and a manifest, and each is served", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop", "the head is the same at both widths");
  await page.goto("/");
  const hrefOf = async (selector: string): Promise<string> => (await page.locator(selector).first().getAttribute("href")) ?? "";
  const icon = await hrefOf('link[rel="icon"]');
  const apple = await hrefOf('link[rel="apple-touch-icon"]');
  const manifest = await hrefOf('link[rel="manifest"]');
  for (const href of [icon, apple, manifest]) expect(href, "linked in the head").not.toBe("");

  for (const href of [icon, apple]) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()["content-type"], href).toMatch(/^image\//);
  }

  const res = await request.get(manifest);
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  expect(body).toMatchObject({ name: "Qwen Local", display: "standalone", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }, { src: "/icons/icon-512.png", sizes: "512x512" }] });
  for (const src of ["/icons/icon-192.png", "/icons/icon-512.png"]) expect((await request.get(src)).status(), src).toBe(200);
});
