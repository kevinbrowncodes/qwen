import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LINKS } from "./identity-guard.ts";

// interactions.md is hand-written (STORY_004); this pins the sections its AC names.
const DOC = new URL("../../docs/recon/2026-09-26/interactions.md", import.meta.url);

describe.runIf(existsSync(DOC))("docs/recon/2026-09-26/interactions.md", () => {
  const md = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("covers every interaction the story names", () => {
    for (const heading of ["## Entering image mode", "## The options", "## Attaching a reference image", "## Submit, then generating", "## Cancel", "## Done", "## Download", "## History: My Library", "## Narrow layout"]) {
      expect(md).toContain(heading);
    }
  });

  it("says what was not observed on the wire", () => {
    expect((md.match(/\*\*Not observed on the wire:\*\*/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("ends with the mapping onto Qwen-Image-2.1, marking same, departure and N/A", () => {
    const table = md.slice(md.indexOf("## Mapping onto Qwen-Image-2.1"));
    expect(table).toContain("| Reference | Clone | Reason |");
    for (const mark of ["**Same**", "**Departure", "**N/A**"]) expect(table).toContain(mark);
  });

  it("links no image generated on the reference", () => {
    for (const re of FORBIDDEN_LINKS) expect(md).not.toMatch(re);
  });
});
