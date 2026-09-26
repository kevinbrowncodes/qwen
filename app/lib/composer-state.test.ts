import { describe, expect, it } from "vitest";
import { canSend, FALLBACK_CAPABILITIES, initialState, parseCapabilities, reduce, restore, serialize, shortModelLabel, type ComposerState } from "./composer-state";

const caps = parseCapabilities({
  models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }],
  ratios: [
    { id: "1:1", width: 1, height: 1 },
    { id: "16:9", width: 16, height: 9 },
  ],
  defaultRatio: "16:9",
  referenceImages: { max: 10 },
});

describe("parseCapabilities", () => {
  it("reads the contract's capabilities", () => {
    expect(caps).toEqual({
      models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }],
      ratios: [
        { id: "1:1", width: 1, height: 1 },
        { id: "16:9", width: 16, height: 9 },
      ],
      defaultRatio: "16:9",
      maxReferences: 10,
    });
  });

  it("falls back to the first ratio when the default is not offered, and to 10 references when unstated", () => {
    const c = parseCapabilities({ models: [{ id: "m", label: "M" }], ratios: [{ id: "1:1", width: 1, height: 1 }], defaultRatio: "21:9" });
    expect(c?.defaultRatio).toBe("1:1");
    expect(c?.maxReferences).toBe(10);
  });

  it("returns null for anything that is not contract-shaped", () => {
    expect(parseCapabilities(null)).toBeNull();
    expect(parseCapabilities({ error: { code: "busy" } })).toBeNull();
    expect(parseCapabilities({ models: [], ratios: [{ id: "1:1", width: 1, height: 1 }] })).toBeNull();
    expect(parseCapabilities({ models: [{ id: 1 }], ratios: [{ id: "x" }] })).toBeNull();
  });
});

describe("reduce", () => {
  const start = initialState();

  it("starts resting, with the first model and the default ratio", () => {
    expect(start).toEqual({ mode: "chat", model: "qwen-image-2.1", ratio: "16:9", text: "" });
    expect(initialState(FALLBACK_CAPABILITIES).ratio).toBe("16:9");
  });

  it("enters and leaves image mode, keeping the options", () => {
    let s = reduce(start, { type: "enterImage" });
    s = reduce(s, { type: "setRatio", ratio: "1:1" });
    expect(s.mode).toBe("image");
    s = reduce(s, { type: "leaveImage" });
    expect(s).toMatchObject({ mode: "chat", ratio: "1:1" });
  });

  it("chooses a model and a ratio, and clears the text once sent", () => {
    let s = reduce(start, { type: "setModel", model: "other" });
    s = reduce(s, { type: "setText", text: "a cat" });
    expect(s).toMatchObject({ model: "other", text: "a cat" });
    expect(reduce(s, { type: "sent" }).text).toBe("");
  });

  it("keeps offered choices when capabilities arrive, and replaces ones that are not offered", () => {
    if (!caps) throw new Error("caps");
    const kept = reduce({ ...start, ratio: "1:1" }, { type: "capabilities", capabilities: caps });
    expect(kept.ratio).toBe("1:1");
    const replaced = reduce({ ...start, model: "gone", ratio: "3:2" }, { type: "capabilities", capabilities: caps });
    expect(replaced).toMatchObject({ model: "qwen-image-2.1", ratio: "16:9" });
  });
});

describe("canSend", () => {
  it("needs text that is not only whitespace", () => {
    expect(canSend({ ...initialState(), text: "" })).toBe(false);
    expect(canSend({ ...initialState(), text: "  \n " })).toBe(false);
    expect(canSend({ ...initialState(), text: " x " })).toBe(true);
  });
});

describe("session round-trip", () => {
  const s: ComposerState = { mode: "image", model: "qwen-image-2.1", ratio: "1:1", text: "secret draft" };

  it("keeps the mode and options, never the text", () => {
    const raw = serialize(s);
    expect(raw).not.toContain("secret");
    expect(restore(raw, initialState())).toEqual({ ...s, text: "" });
  });

  it("falls back to the defaults for a missing, corrupt or wrong-shaped value", () => {
    const base = initialState();
    expect(restore(null, base)).toBe(base);
    expect(restore("{", base)).toBe(base);
    expect(restore("[1]", base)).toBe(base);
    expect(restore('{"mode":"video","ratio":5}', base)).toEqual(base);
  });
});

describe("shortModelLabel", () => {
  it("shortens the model name for the narrow layout", () => {
    expect(shortModelLabel("Qwen-Image 2.1")).toBe("Model 2.1");
    expect(shortModelLabel("Other")).toBe("Other");
  });
});
