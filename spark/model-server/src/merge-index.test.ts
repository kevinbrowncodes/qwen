import { describe, expect, it } from "vitest";
import { Jobs } from "./jobs.ts";
import { mergeIndexes } from "./merge-index.ts";

const job = (id: string, file: string) => ({
  id,
  request: { prompt: "p", ratio: "3:4", model: "qwen-image-2.1", seed: 1, referenceImages: 0 },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:01:00.000Z",
  status: "done",
  progress: 100,
  result: { file, width: 896, height: 1184, sizeBytes: 10 },
});

describe("mergeIndexes (STORY_037)", () => {
  it("joins disjoint indexes, the 2026's entries first", () => {
    const merged = mergeIndexes(JSON.stringify([job("a", "a.png")]), JSON.stringify([job("b", "b.png"), job("c", "c.png")]));
    expect((JSON.parse(merged.text) as { id: string }[]).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect([merged.kept, merged.added]).toEqual([1, 2]);
  });

  it("keeps the 2026's entry when both have the same id", () => {
    const merged = mergeIndexes(JSON.stringify([job("a", "here.png")]), JSON.stringify([job("a", "spark.png")]));
    expect(JSON.parse(merged.text)).toEqual([job("a", "here.png")]);
    expect(merged.added).toBe(0);
  });

  it("drops what is not a job with an id, and treats a missing or broken index as empty", () => {
    const merged = mergeIndexes("not json", JSON.stringify([job("b", "b.png"), { nope: 1 }, "x", null]));
    expect((JSON.parse(merged.text) as { id: string }[]).map((e) => e.id)).toEqual(["b"]);
  });

  it("produces an index the model server loads, results named by file", () => {
    const merged = mergeIndexes(JSON.stringify([job("a", "a.png")]), JSON.stringify([job("b", "b.png")]));
    const jobs = Jobs.fromIndex(merged.text);
    expect(jobs.get("b")?.status).toBe("done");
    expect(jobs.get("a")?.result?.file).toBe("a.png");
  });
});
