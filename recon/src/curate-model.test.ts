import { describe, expect, it } from "vitest";
import {
  coverage,
  EXPECTED_STATES,
  manifestEntry,
  parseReadingFileName,
  placeholderPath,
  ReadingError,
  renderCoverage,
  sortManifest,
  stripQueriesDeep,
  validateReading,
} from "./curate-model.ts";

const component = { name: "composer", selector: ".message-input-container", box: { x: 1, y: 2, width: 3, height: 4 }, style: { color: "#fff" } };
const valid = { state: "job-done", url_path: "/c/0b7f6a1e-1234-4cde-9abc-0123456789ab", viewport: { width: 1437, height: 1031 }, components: [component] };

describe("validateReading", () => {
  it("accepts a well-formed reading", () => {
    expect(validateReading("job-done@1437.json", valid).state).toBe("job-done");
  });

  it("accepts components with no selector and no style, which many readings have", () => {
    const bare = { ...valid, components: [{ name: "skeleton", box: component.box, children: [{ name: "icon", box: component.box }] }] };
    expect(() => validateReading("job-done@1437.json", bare)).not.toThrow();
  });

  it("names the field when components are missing", () => {
    const { components: _dropped, ...rest } = valid;
    expect(() => validateReading("job-done@1437.json", rest)).toThrow(/components is missing/);
  });

  it("accepts a hidden or grouped component with no box, a null box, or a note in place of one", () => {
    const shapes = [{ name: "hover-overlays" }, { name: "field", box: null }, { name: "switch", box: { width: 28, height: 16 } }, { name: "toggle", box: { x: 17, y: 19 } }, { name: "voice-input", box: "not measured" }, { text: "Image" }];
    expect(() => validateReading("job-done@1437.json", { ...valid, components: [{ name: "reply", children: shapes }] })).not.toThrow();
  });

  it("names the nested field when a box is malformed", () => {
    const badBox = { ...valid, components: [{ name: "composer", children: [{ name: "x", box: { x: 1, y: 2, width: "wide", height: 4 } }] }] };
    expect(() => validateReading("job-done@1437.json", badBox)).toThrow(/components\[0\]\.children\[0\]\.box\.width is not a number/);
  });

  it("rejects a box with no coordinates at all", () => {
    expect(() => validateReading("job-done@1437.json", { ...valid, components: [{ name: "x", box: {} }] })).toThrow(/has none of/);
  });

  it("requires a name on top-level components, and something identifying on nested ones", () => {
    expect(() => validateReading("job-done@1437.json", { ...valid, components: [{ text: "orphan" }] })).toThrow(/components\[0\]\.name is missing/);
    expect(() => validateReading("job-done@1437.json", { ...valid, components: [{ name: "row", children: [{ style: {} }] }] })).toThrow(/children\[0\] has no name/);
  });

  it("rejects a state name with an upper-case letter, and a file name outside the pattern", () => {
    expect(() => validateReading("Job-Done@1437.json", { ...valid, state: "Job-Done" })).toThrow(ReadingError);
    expect(() => validateReading("job-done@1437.json", { ...valid, state: "Job-Done" })).toThrow(/state/);
    expect(() => validateReading("job done.json", valid)).toThrow(/file name/);
  });

  it("rejects a reading whose state or width disagrees with its file name", () => {
    expect(() => validateReading("job-done@393.json", valid)).toThrow(/viewport.width/);
    expect(() => validateReading("edit-done@1437.json", valid)).toThrow(/does not match/);
  });
});

describe("parseReadingFileName", () => {
  it("splits state and width, and refuses other files", () => {
    expect(parseReadingFileName("my-library@393.json")).toEqual({ state: "my-library", width: 393 });
    expect(parseReadingFileName("network-endpoints.json")).toBeNull();
    expect(parseReadingFileName("notes.md")).toBeNull();
  });
});

describe("stripQueriesDeep", () => {
  it("removes query strings and hashes from URLs nested anywhere, leaving other text alone", () => {
    const input = {
      src: "https://cdn.example.com/a.png?x-oss-process=image/resize,m_mfit,w_450&token=abc",
      list: ["see //assets.alicdn.com/g/x.css?v=2#top for details", "plain text? yes"],
      nested: { n: 3, s: "/c/new-chat" },
    };
    expect(stripQueriesDeep(input)).toEqual({
      src: "https://cdn.example.com/a.png",
      list: ["see //assets.alicdn.com/g/x.css for details", "plain text? yes"],
      nested: { n: 3, s: "/c/new-chat" },
    });
  });
});

describe("placeholderPath", () => {
  it("replaces ids with :id and drops the query", () => {
    expect(placeholderPath("/c/0b7f6a1e-1234-4cde-9abc-0123456789ab")).toBe("/c/:id");
    expect(placeholderPath("/api/v2/chats/1234567890?x=1")).toBe("/api/v2/chats/:id");
    expect(placeholderPath("/library")).toBe("/library");
  });
});

describe("manifest", () => {
  it("records the placeholder path and the zoom note on desktop only", () => {
    const desk = manifestEntry(validateReading("job-done@1437.json", valid), "states/job-done@1437.json", "extension-reading", "2026-09-26");
    expect(desk.url_path).toBe("/c/:id");
    expect(desk.note).toMatch(/125% zoom/);
    const narrow = manifestEntry(
      validateReading("job-done@393.json", { ...valid, viewport: { width: 393, height: 852 } }),
      "states/job-done@393.json",
      "extension-reading",
      "2026-09-26",
    );
    expect(narrow.note).toBeUndefined();
  });

  it("comes out in the same order whatever order the files were read in", () => {
    const mk = (state: string, width: number) =>
      manifestEntry(validateReading(`${state}@${width}.json`, { ...valid, state, viewport: { width, height: 1 } }), `states/${state}@${width}.json`, "extension-reading", "d");
    const a = [mk("job-done", 393), mk("home-signed-in", 1437), mk("job-done", 1437)];
    const b = [a[2], a[0], a[1]].filter((x) => x !== undefined);
    expect(sortManifest(a)).toEqual(sortManifest(b));
    expect(sortManifest(a).map((e) => `${e.state}@${e.width}`)).toEqual(["home-signed-in@1437", "job-done@1437", "job-done@393"]);
  });
});

describe("coverage", () => {
  const captured = new Set(["home-signed-in@1437.json", "job-done@1437.json", "home-signed-in@393.json"]);
  const rows = coverage(EXPECTED_STATES, captured);

  it("marks a state captured only when its file exists at that width", () => {
    expect(rows.find((r) => r.state === "job-done" && r.width === 1437)?.status).toBe("captured");
    expect(rows.find((r) => r.state === "job-done" && r.width === 393)?.status).not.toBe("captured");
  });

  it("points download at the done state's hover overlay on desktop", () => {
    expect(rows.find((r) => r.state === "result-download" && r.width === 1437)).toMatchObject({ status: "shown-in", detail: "states/job-done@1437.json" });
  });

  it("gives every not-captured state a reason, for the states the 2026-09-26 capture actually has", () => {
    const actual = new Set(
      [
        "home-signed-in", "mode-menu-open", "composer-image-mode", "image-model-open", "aspect-ratio-open", "composer-typed",
        "composer-reference-attached", "job-submitted", "job-generating", "job-done", "edit-done", "my-library",
      ].map((s) => `${s}@1437.json`).concat(["home-signed-in@393.json", "job-done@393.json", "my-library@393.json"]),
    );
    const missing = coverage(EXPECTED_STATES, actual).filter((r) => r.status === "not-captured");
    expect(missing.length).toBeGreaterThan(0);
    for (const r of missing) expect(r.detail, `${r.state}@${r.width}`).not.toBe("no reason recorded");
    expect(missing.map((r) => `${r.state}@${r.width}`)).toContain("job-cancelled@1437");
  });

  it("renders both widths and the facts section", () => {
    const md = renderCoverage(rows, "2026-09-26");
    expect(md).toContain("## At 1437 px");
    expect(md).toContain("## At 393 px");
    expect(md).toContain("**not captured**");
    expect(md).toContain("full-resolution size");
  });
});
