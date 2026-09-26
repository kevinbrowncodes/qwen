import { describe, expect, it } from "vitest";
import { countSymbols, duplicateGroups, extractIcons, extractInlineSvgs, hashSvgText, iconUsage, IconCountError, renderIconIndex, setOf } from "./icons.ts";

const sprite = `<html><body>
<svg aria-hidden="true" style="position: absolute; width: 0px; height: 0px;">
  <symbol id="qwpcicon-sendChat" viewBox="0 0 1024 1024"><path d="M1 1L2 2"></path></symbol>
  <symbol id="qwpcicon-plan" viewBox="0 0 24 24"><path d="M3 3"></path></symbol>
  <symbol id="qwpcicon-Plan" viewBox="0 0 24 24"><path d="M4 4"></path></symbol>
</svg>
<svg aria-hidden="true" style="position: absolute; width: 0px; height: 0px;">
  <symbol id="appicon-sendChat" viewBox="0 0 1024 1024"><path d="M1 1L2 2"></path></symbol>
  <symbol id="appicon-download" viewBox="0 0 24 24"><g><path fill="currentColor" d="M5 5"></path></g></symbol>
</svg>
<button><svg class="icon"><use xlink:href="#qwpcicon-sendChat"></use></svg></button>
<span class="anticon"><svg viewBox="0 0 10 10" width="1em"><path d="M9 9"></path></svg></span>
<span class="anticon"><svg viewBox="0 0 10 10" width="1em" class="other"><path d="M9 9"></path></svg></span>
</body></html>`;

describe("setOf", () => {
  it("picks the folder from the prefix and strips it from the name", () => {
    expect(setOf("qwpcicon-sendChat")).toEqual({ set: "desktop", name: "sendChat" });
    expect(setOf("appicon-menu")).toEqual({ set: "app", name: "menu" });
    expect(setOf("qwcoloricon-x")).toEqual({ set: "color", name: "x" });
    expect(setOf("qwenFileicon-pdf")).toEqual({ set: "file", name: "pdf" });
    expect(setOf("other-icon")).toBeNull();
    expect(setOf("qwpcicon-")).toBeNull();
  });
});

describe("extractIcons", () => {
  const icons = extractIcons(sprite);

  it("turns each symbol into a standalone svg with its viewBox and namespace, children unchanged", () => {
    const send = icons.find((i) => i.id === "qwpcicon-sendChat");
    expect(send?.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M1 1L2 2"></path></svg>\n');
    const dl = icons.find((i) => i.id === "appicon-download");
    expect(dl?.svg).toContain('<g><path fill="currentColor" d="M5 5"></path></g>');
  });

  it("keeps the reference's spelling and suffixes a case-only collision", () => {
    expect(icons.map((i) => `${i.set}/${i.file}`)).toEqual(["desktop/sendChat.svg", "desktop/plan.svg", "desktop/Plan__2.svg", "app/sendChat.svg", "app/download.svg"]);
  });

  it("counts symbols per set", () => {
    expect(Object.fromEntries(countSymbols(sprite))).toEqual({ desktop: 3, app: 2 });
  });

  it("flags identical markup across sets", () => {
    const groups = duplicateGroups(icons);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([["qwpcicon-sendChat", "appicon-sendChat"]]);
  });

  it("is a typed error when counts disagree", () => {
    expect(new IconCountError("desktop", 3, 2).message).toMatch(/3 symbols/);
  });
});

describe("hashing", () => {
  it("ignores whitespace, attribute order, class, id and data-*", () => {
    const a = hashSvgText('<svg viewBox="0 0 1 1" fill="none"><path d="M1 1"/></svg>');
    const b = hashSvgText('<svg  fill="none"   viewBox="0 0 1 1" class="x" id="y" data-k="z">\n  <path d="M1 1"/>\n</svg>');
    expect(a).toBe(b);
  });

  it("sees a different drawing", () => {
    expect(hashSvgText('<svg><path d="M1 1"/></svg>')).not.toBe(hashSvgText('<svg><path d="M1 2"/></svg>'));
  });
});

describe("extractInlineSvgs", () => {
  it("records sprite references as usage, and saves other inline svgs once by hash", () => {
    const { saved, spriteUses } = extractInlineSvgs(sprite);
    expect(spriteUses).toEqual(["qwpcicon-sendChat"]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.file).toMatch(/^icon-[0-9a-f]{8}\.svg$/);
    expect(saved[0]?.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe("iconUsage", () => {
  it("joins sprite ids named anywhere in a reading to its state, trimming trailing prose", () => {
    const known = new Set(["qwpcicon-sendChat", "appicon-download", "qwpcicon-a-16by9AspectRatio"]);
    const usage = iconUsage(
      [
        { label: "composer-typed@1437", data: { components: [{ icon: "up arrow (qwpcicon-sendChat)" }] } },
        { label: "job-done@393", data: { components: [{ children: [{ icon: "appicon-download" }] }] } },
        { label: "aspect-ratio-open@1437", data: { notes: "sprite qwpcicon-a-<w>by<h>AspectRatio, e.g. qwpcicon-a-16by9AspectRatio" } },
      ],
      known,
    );
    expect([...(usage.get("qwpcicon-sendChat") ?? [])]).toEqual(["composer-typed@1437"]);
    expect([...(usage.get("appicon-download") ?? [])]).toEqual(["job-done@393"]);
    expect(usage.has("qwpcicon-a-16by9AspectRatio")).toBe(true);
    expect([...usage.keys()].every((k) => known.has(k))).toBe(true);
  });

  it("renders an index with every set, usage and duplicates", () => {
    const icons = extractIcons(sprite);
    const md = renderIconIndex(icons, [], new Map([["qwpcicon-sendChat", new Set(["composer-typed@1437"])]]), "2026-09-26");
    expect(md).toContain("| qwpcicon-sendChat | desktop/sendChat.svg | 0 0 1024 1024 |");
    expect(md).toContain("composer-typed@1437");
    expect(md).toContain("appicon-sendChat");
  });
});
