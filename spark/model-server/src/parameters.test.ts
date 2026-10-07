import { describe, expect, it } from "vitest";
import type { JobRequest } from "./jobs.ts";
import { parametersFor, settingText } from "./parameters.ts";

// STORY_024: the settings lines a generated PNG carries.
const base: JobRequest = { prompt: "a red bicycle", ratio: "3:4", model: "qwen-image-2.1", seed: 42, referenceImages: 0, lora: null, loraScale: null, loraGuidance: null, promptSent: "a red bicycle" };

describe("parametersFor", () => {
  it("writes a text-to-image with no add-on as prompt, model, size, seed and None, the Size line marked", () => {
    expect(parametersFor(base, { model: "Qwen-Image 2.1" })).toEqual({ lines: ["Prompt: a red bicycle", "Model: Qwen-Image 2.1", "Size: 3:4", "Seed: 42", "Add-on: None"], sizeLine: 2 });
  });

  it("adds the prompt as sent, and the add-on with its strength and guidance, when one was used", () => {
    const p = parametersFor({ ...base, lora: "fake-detail", loraScale: 0.8, loraGuidance: 3, promptSent: "a red bicycle, sharp focus" }, { lora: "Fake detail" });
    expect(p.lines).toEqual(["Prompt: a red bicycle", "Sent: a red bicycle, sharp focus", "Model: qwen-image-2.1", "Size: 3:4", "Seed: 42", "Add-on: Fake detail · strength 0.8 · guidance 3"]);
    expect(p.sizeLine).toBe(3);
  });

  it("says default for a missing guidance, and falls back to the id without a label", () => {
    expect(parametersFor({ ...base, lora: "fake-style", loraScale: 1 }).lines).toContain("Add-on: fake-style · strength 1 · guidance default");
  });

  it("describes an edit's size and reference count", () => {
    const { lines } = parametersFor({ ...base, ratio: null, referenceImages: 2 });
    expect(lines).toContain("Size: as the reference");
    expect(lines).toContain("Edit of: 2 reference images");
    expect(parametersFor({ ...base, ratio: null, referenceImages: 1 }).lines).toContain("Edit of: 1 reference image");
    expect(parametersFor({ ...base, ratio: null }).lines).toContain("Size: default");
  });

  it("writes a setting as the number, or default for none", () => {
    expect([settingText(null), settingText(1), settingText(0.9)]).toEqual(["default", "1", "0.9"]);
  });
});
