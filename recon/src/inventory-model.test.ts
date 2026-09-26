import { describe, expect, it } from "vitest";
import type { Reading } from "./curate-model.ts";
import { iconFilesFromIndex, orderReadings, renderInventory, spriteIds } from "./inventory-model.ts";

const icons = iconFilesFromIndex({
  files: [
    { path: "icons/desktop/sendChat.svg", origin: "symbol #qwpcicon-sendChat" },
    { path: "icons/desktop/Plan__2.svg", origin: "symbol #qwpcicon-Plan" },
    { path: "icons/app/download.svg", origin: "symbol #appicon-download" },
    { path: "css/main.css" },
  ],
});

const r = (state: string, width: number, components: Reading["components"]): Reading => ({ state, url_path: "/", viewport: { width, height: 1 }, components });

describe("iconFilesFromIndex", () => {
  it("maps symbol origins to their paths, including case-suffixed files", () => {
    expect(icons.get("qwpcicon-Plan")).toBe("icons/desktop/Plan__2.svg");
    expect(icons.size).toBe(3);
  });
});

describe("spriteIds", () => {
  it("resolves ids inside prose, ignores templates, and reports unknown ids", () => {
    const got = spriteIds({ name: "x", icon: "up arrow (qwpcicon-sendChat), and qwpcicon-Plan; see qwpcicon-a-<w>by<h>AspectRatio; qwpcicon-nope" }, icons);
    expect(got.resolved).toEqual(["qwpcicon-Plan", "qwpcicon-sendChat"]);
    expect(got.unresolved).toEqual(["qwpcicon-nope"]);
  });
});

describe("renderInventory", () => {
  const md = renderInventory(
    [
      r("my-library", 393, [{ name: "grid", box: { x: 1, y: 2 } }]),
      r("job-done", 1437, [{ name: "reply", selector: ".msg", box: { x: 0, y: 0, width: 400, height: 229 }, children: [{ name: "download", icon: "appicon-download", box: { width: 32, height: 32, x: 0, y: 0 } }, { text: "Image" }] }]),
      r("home-signed-in", 1437, [{ name: "composer", icon: "qwpcicon-ghost" }]),
    ],
    icons,
    "2026-09-26",
  );

  it("orders desktop first, in flow order, then narrow", () => {
    const order = [...md.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(order).toEqual(["home-signed-in", "job-done", "my-library"]);
    expect(md.indexOf("## At 1437 px")).toBeLessThan(md.indexOf("## At 393 px"));
  });

  it("nests children with selector, size and linked icons", () => {
    expect(md).toContain("- **reply** · `.msg` · 400×229");
    expect(md).toContain("  - **download** · 32×32 · icons: [appicon-download](assets/icons/app/download.svg)");
    expect(md).toContain('  - **"Image"**');
  });

  it("renders a partial box without inventing a size", () => {
    expect(md).toContain("- **grid**\n");
  });

  it("lists unresolved ids with where they were named", () => {
    expect(md).toContain("- `qwpcicon-ghost` (named in home-signed-in@1437)");
  });

  it("orders readings stably", () => {
    const a = [r("b", 393, []), r("home-signed-in", 1437, []), r("job-done", 1437, [])];
    expect(orderReadings(a).map((x) => x.state)).toEqual(["home-signed-in", "job-done", "b"]);
  });
});
