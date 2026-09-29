import { describe, expect, it } from "vitest";
import { activeRatio, canSend, MATCH_REFERENCE, NO_LORA, FALLBACK_CAPABILITIES, initialState, parseCapabilities, reduce, restore, serialize, shortModelLabel, type ComposerState } from "./composer-state";

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
      loras: [],
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
    expect(start).toEqual({ mode: "chat", model: "qwen-image-2.1", ratio: "16:9", editRatio: "match", lora: "none", text: "", references: [], error: null });
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
  const s: ComposerState = { mode: "image", model: "qwen-image-2.1", ratio: "1:1", editRatio: "3:4", lora: "fake-detail", text: "secret draft", references: [], error: null };

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

describe("references (STORY_011)", () => {
  const file = (name: string): File => new File(["x"], name, { type: "image/png" });
  const a = { key: "a", file: file("a.png") };
  const b = { key: "b", file: file("b.png") };

  it("adding enters image mode, keeps the order, and shows the edit's ratio, Match reference by default (STORY_017)", () => {
    let s = reduce(initialState(), { type: "addReferences", items: [a] });
    s = reduce(s, { type: "addReferences", items: [b] });
    expect(s.mode).toBe("image");
    expect(s.references.map((r) => r.key)).toEqual(["a", "b"]);
    expect(activeRatio(s)).toBe(MATCH_REFERENCE);
  });

  it("removing the last one shows the text-to-image ratio again, as it was chosen", () => {
    let s = reduce({ ...initialState(), ratio: "3:4" }, { type: "addReferences", items: [a] });
    s = reduce(s, { type: "removeReference", key: "a" });
    expect(activeRatio(s)).toBe("3:4");
    expect(s.ratio).toBe("3:4");
  });

  it("a refusal keeps what is attached, and the next change clears it", () => {
    let s = reduce(initialState(), { type: "addReferences", items: [a] });
    s = reduce(s, { type: "refuse", message: "photo.gif is not a PNG, JPEG or WebP image." });
    expect(s.references).toHaveLength(1);
    expect(s.error).toBe("photo.gif is not a PNG, JPEG or WebP image.");
    expect(reduce(s, { type: "removeReference", key: "a" }).error).toBeNull();
  });

  it("sending clears the text and the references, never the options", () => {
    const s = reduce(reduce({ ...initialState(), text: "x", ratio: "1:1" }, { type: "addReferences", items: [a] }), { type: "sent" });
    expect(s).toMatchObject({ text: "", references: [], ratio: "1:1", mode: "image" });
  });

  it("never stores the references", () => {
    const s = reduce(initialState(), { type: "addReferences", items: [a] });
    expect(serialize(s)).not.toContain("a.png");
  });
});

describe("attach (STORY_011)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const text = new TextEncoder().encode("not an image");
  const item = (key: string): { key: string; file: File } => ({ key, file: new File(["x"], `${key}.png`) });

  it("attaches files that pass, counting what is already attached", () => {
    let s = reduce(initialState(), { type: "attach", items: [item("a")], candidates: [{ name: "a.png", size: 4, head: png }] });
    expect(s.references).toHaveLength(1);
    const ten = Array.from({ length: 10 }, (_, i) => item(String(i)));
    s = reduce(s, { type: "attach", items: ten, candidates: ten.map((t) => ({ name: t.file.name, size: 4, head: png })) });
    expect(s.references).toHaveLength(1);
    expect(s.error).toBe("Attach at most 10 reference images.");
  });

  it("refuses a file that is not an image, keeping what is attached", () => {
    const s = reduce(initialState(), { type: "attach", items: [item("fake")], candidates: [{ name: "fake.png", size: 12, head: text }] });
    expect(s.references).toHaveLength(0);
    expect(s.error).toBe("fake.png is not a PNG, JPEG or WebP image.");
  });
});

describe("edges", () => {
  it("defaults to the first ratio when the server names none", () => {
    expect(parseCapabilities({ models: [{ id: "m", label: "M" }], ratios: [{ id: "3:2", width: 3, height: 2 }] })?.defaultRatio).toBe("3:2");
  });

  it("has no model to choose when the capabilities list none", () => {
    const none = { ...FALLBACK_CAPABILITIES, models: [] };
    expect(initialState(none).model).toBe("");
    expect(reduce({ ...initialState(), model: "gone" }, { type: "capabilities", capabilities: none }).model).toBe("");
  });
});

describe("the edit's ratio (STORY_017)", () => {
  const a = { key: "a", file: new File(["x"], "a.png", { type: "image/png" }) };

  it("is chosen apart from the text-to-image ratio", () => {
    let s = reduce({ ...initialState(), ratio: "4:3" }, { type: "addReferences", items: [a] });
    s = reduce(s, { type: "setEditRatio", ratio: "1:1" });
    expect(activeRatio(s)).toBe("1:1");
    expect(s.ratio).toBe("4:3");
    expect(activeRatio(reduce(s, { type: "removeReference", key: "a" }))).toBe("4:3");
  });

  it("survives a reload, and falls back to Match reference when the server no longer offers it", () => {
    const s = { ...initialState(), editRatio: "9:16" };
    expect(restore(serialize(s), initialState()).editRatio).toBe("9:16");
    const caps = parseCapabilities({ models: [{ id: "qwen-image-2.1", label: "Q" }], ratios: [{ id: "1:1", width: 1, height: 1 }] });
    if (!caps) throw new Error("caps");
    expect(reduce(s, { type: "capabilities", capabilities: caps }).editRatio).toBe(MATCH_REFERENCE);
  });
});

describe("add-ons (STORY_019)", () => {
  const withLoras = parseCapabilities({
    models: [{ id: "qwen-image-2.1", label: "Q" }],
    ratios: [{ id: "1:1", width: 1, height: 1 }],
    loras: [{ id: "uncensored", label: "Uncensored" }, { id: "none", label: "reserved" }, { id: 3, label: "bad" }, "junk"],
  });

  it("reads the server's add-ons, skipping malformed ones and the reserved id none", () => {
    expect(withLoras?.loras).toEqual([{ id: "uncensored", label: "Uncensored" }]);
  });

  it("defaults to none and is chosen with setLora, leaving the other options alone", () => {
    expect(initialState().lora).toBe(NO_LORA);
    const s = reduce({ ...initialState(), ratio: "1:1" }, { type: "setLora", lora: "uncensored" });
    expect(s).toMatchObject({ lora: "uncensored", ratio: "1:1" });
  });

  it("keeps an offered add-on when capabilities arrive, and falls back to none when it is gone", () => {
    if (!withLoras) throw new Error("caps");
    const chosen = { ...initialState(), lora: "uncensored" };
    expect(reduce(chosen, { type: "capabilities", capabilities: withLoras }).lora).toBe("uncensored");
    expect(reduce(chosen, { type: "capabilities", capabilities: { ...withLoras, loras: [] } }).lora).toBe(NO_LORA);
  });

  it("survives a reload, and an older stored session without one reads as none", () => {
    expect(restore(serialize({ ...initialState(), lora: "uncensored" }), initialState()).lora).toBe("uncensored");
    expect(restore('{"mode":"image"}', initialState()).lora).toBe(NO_LORA);
  });
});
