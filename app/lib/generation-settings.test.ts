import { describe, expect, it } from "vitest";
import { copyAllText, durationText, NOT_RECORDED, settingsRows, type SettingsSource } from "./generation-settings";

// STORY_024: the Info panel's rows and the Copy-all text, from the job's own echo.
const labels = { models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }], loras: [{ id: "fake-detail", label: "Fake detail" }] };
const done: SettingsSource = {
  status: "done",
  createdAt: "2026-10-07T10:00:00.000Z",
  updatedAt: "2026-10-07T10:02:06.000Z",
  request: { prompt: "a red bicycle", ratio: "16:9", model: "qwen-image-2.1", seed: 42, referenceImages: 0, lora: null, loraScale: null, loraGuidance: null, promptSent: "a red bicycle" },
  result: { width: 1376, height: 768 },
};
const keys = (s: SettingsSource): string[] => settingsRows(s, labels).map((r) => r.key);
const row = (s: SettingsSource, key: string) => settingsRows(s, labels).find((r) => r.key === key);

describe("settingsRows", () => {
  it("a text-to-image without an add-on has no Sent and no Edit-of row, and says None", () => {
    expect(keys(done)).toEqual(["prompt", "model", "size", "seed", "addOn", "time"]);
    expect(row(done, "model")?.value).toBe("Qwen-Image 2.1");
    expect(row(done, "size")?.value).toBe("16:9 · 1376 × 768");
    expect(row(done, "seed")?.value).toBe("42");
    expect(row(done, "addOn")).toEqual({ key: "addOn", label: "Add-on", value: "None" });
    expect(row(done, "time")?.value).toBe("2 min 6 s");
  });

  it("an add-on with a trigger shows the prompt as sent, its label, strength and guidance", () => {
    const s = { ...done, request: { ...done.request, lora: "fake-detail", loraScale: 0.8, loraGuidance: 3, promptSent: "a red bicycle, sharp focus" } };
    expect(keys(s)).toEqual(["prompt", "sent", "model", "size", "seed", "addOn", "time"]);
    expect(row(s, "sent")?.value).toBe("a red bicycle, sharp focus");
    expect(row(s, "addOn")).toMatchObject({ value: "Fake detail", detail: "strength 0.8 · guidance 3" });
  });

  it("says default for a null guidance, and the id for an add-on the server no longer offers", () => {
    const s = { ...done, request: { ...done.request, lora: "gone-now", loraScale: 1, loraGuidance: null, promptSent: "a red bicycle" } };
    expect(row(s, "addOn")).toMatchObject({ value: "gone-now", detail: "strength 1 · guidance default" });
    expect(row(s, "sent")).toBeUndefined();
  });

  it("an edit shows its reference count and a size taken from the reference; an unknown model shows its id", () => {
    const s = { ...done, request: { ...done.request, ratio: null, referenceImages: 2, model: "other" } };
    expect(row(s, "editOf")?.value).toBe("2 reference images");
    expect(row(s, "size")?.value).toBe("as the reference · 1376 × 768");
    expect(row(s, "model")?.value).toBe("other");
    expect(row({ ...s, request: { ...s.request, referenceImages: 1 } }, "editOf")?.value).toBe("1 reference image");
  });

  it("a failed or stopped job has no size and says how long it ran; one still running has no Time row", () => {
    const failed: SettingsSource = { ...done, status: "failed", updatedAt: "2026-10-07T10:00:40.000Z", result: undefined };
    expect(row(failed, "time")?.value).toBe("failed after 40 s");
    expect(row(failed, "size")?.value).toBe("16:9");
    expect(row({ ...failed, status: "cancelled", updatedAt: "2026-10-07T10:00:12.000Z" }, "time")?.value).toBe("stopped after 12 s");
    expect(keys({ ...failed, status: "running" })).not.toContain("time");
    expect(row({ ...done, createdAt: "garbage" }, "time")?.value).toBe(NOT_RECORDED);
  });

  it("an old entry says not recorded rather than inventing values", () => {
    const old: SettingsSource = { ...done, request: { prompt: "p", ratio: "1:1", model: "qwen-image-2.1", seed: null, referenceImages: 0, lora: "fake-detail" } };
    expect(row(old, "seed")?.value).toBe(NOT_RECORDED);
    expect(row(old, "sent")?.value).toBe(NOT_RECORDED);
    expect(row(old, "addOn")?.detail).toBe(`strength and guidance ${NOT_RECORDED}`);
    // Without an add-on, the prompt sent is the prompt, so there is nothing to say.
    expect(keys({ ...old, request: { ...old.request, lora: undefined } })).not.toContain("sent");
  });
});

describe("copyAllText", () => {
  it("writes every row as plain text, one per line, the add-on's detail on its line", () => {
    const s = { ...done, request: { ...done.request, ratio: null, referenceImages: 1, lora: "fake-detail", loraScale: 1, loraGuidance: null, promptSent: "a red bicycle, sharp focus" } };
    expect(copyAllText(settingsRows(s, labels)).split("\n")).toEqual([
      "Prompt: a red bicycle",
      "Sent: a red bicycle, sharp focus",
      "Model: Qwen-Image 2.1",
      "Size: as the reference · 1376 × 768",
      "Seed: 42",
      "Add-on: Fake detail · strength 1 · guidance default",
      "Edit of: 1 reference image",
      "Time: 2 min 6 s",
    ]);
  });
});

describe("durationText", () => {
  it("reads seconds, minutes and hours", () => {
    expect([0, 40_000, 120_000, 126_400, 3_900_000, -5].map(durationText)).toEqual(["0 s", "40 s", "2 min", "2 min 6 s", "1 h 5 min", "0 s"]);
  });
});
