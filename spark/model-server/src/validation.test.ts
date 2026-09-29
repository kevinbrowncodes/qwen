import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HttpError, validateRequest } from "./validation.ts";
import { CAPABILITIES } from "./capabilities.ts";

interface Case {
  readonly body: Record<string, unknown>;
  readonly status: number;
  readonly code?: string;
  readonly field?: string;
}

function expand(body: Record<string, unknown>): Record<string, unknown> {
  const p = body["prompt"];
  const m = typeof p === "string" ? /^REPEAT_(\d+)$/.exec(p) : null;
  return m?.[1] ? { ...body, prompt: "x".repeat(Number(m[1])) } : body;
}

const vectors: unknown = JSON.parse(readFileSync(new URL("../../../docs/contracts/validation-vectors.json", import.meta.url), "utf8"));
const cases: Case[] = typeof vectors === "object" && vectors !== null && "cases" in vectors && Array.isArray(vectors.cases) ? (vectors.cases as Case[]) : [];

describe("the contract's shared validation vectors", () => {
  it("has cases to run", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  for (const c of cases) {
    it(`${JSON.stringify(c.body).slice(0, 70)} → ${String(c.status)}`, () => {
      const run = (): unknown => validateRequest(CAPABILITIES, expand(c.body), [], () => 7);
      if (c.status === 202) {
        expect(run()).toMatchObject({ seed: typeof c.body["seed"] === "number" ? c.body["seed"] : 7 });
        return;
      }
      try {
        run();
        expect.unreachable("should have refused");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpError);
        expect(e).toMatchObject({ status: c.status, code: c.code, field: c.field });
      }
    });
  }
});

describe("references", () => {
  const file = (contentType: string) => ({ field: "referenceImage", filename: "a", contentType, data: Buffer.from("x") });

  it("an edit needs no ratio, and may name one (v1.1)", () => {
    expect(validateRequest(CAPABILITIES, { prompt: "x" }, [file("image/png")], () => 1)).toMatchObject({ ratio: null, referenceImages: 1 });
    expect(validateRequest(CAPABILITIES, { prompt: "x", ratio: "1:1" }, [file("image/png")], () => 1)).toMatchObject({ ratio: "1:1" });
  });

  it("refuses eleven, and a type that is not an image", () => {
    expect(() => validateRequest(CAPABILITIES, { prompt: "x" }, Array.from({ length: 11 }, () => file("image/png")), () => 1)).toThrow(/at most 10/);
    expect(() => validateRequest(CAPABILITIES, { prompt: "x" }, [file("image/gif")], () => 1)).toThrow(HttpError);
  });

  it("reads a seed sent as text in a multipart form", () => {
    expect(validateRequest(CAPABILITIES, { prompt: "x", ratio: "1:1", seed: "42" }, [], () => 1).seed).toBe(42);
  });
});

describe("the contract's shared add-on vectors (v1.2, STORY_019)", () => {
  interface LoraCase {
    readonly body: Record<string, unknown>;
    readonly status: number;
    readonly lora?: string | null;
    readonly code?: string;
    readonly field?: string;
  }
  const loraCases: LoraCase[] = typeof vectors === "object" && vectors !== null && "loraCases" in vectors && Array.isArray(vectors.loraCases) ? (vectors.loraCases as LoraCase[]) : [];
  const caps = { ...CAPABILITIES, loras: [{ id: "fake-detail", label: "Fake detail" }] };

  it("has add-on cases to run", () => {
    expect(loraCases.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of loraCases) {
    it(`add-on ${JSON.stringify(c.body["lora"] ?? "(absent)")} → ${String(c.status)}`, () => {
      const run = (): unknown => validateRequest(caps, c.body, [], () => 7);
      if (c.status === 202) {
        expect(run()).toMatchObject({ lora: c.lora ?? null });
        return;
      }
      expect(run).toThrow(HttpError);
      try {
        run();
      } catch (e) {
        expect(e).toMatchObject({ status: c.status, code: c.code, field: c.field });
      }
    });
  }

  it("offers nothing when no add-on is installed", () => {
    expect(() => validateRequest(CAPABILITIES, { prompt: "x", ratio: "1:1", lora: "fake-detail" }, [], () => 1)).toThrow(/not offered/);
  });
});

describe("the contract's shared edit vectors (v1.1, STORY_017)", () => {
  interface EditCase {
    readonly body: Record<string, unknown>;
    readonly status: number;
    readonly ratio?: string | null;
    readonly code?: string;
    readonly field?: string;
  }
  const edits: EditCase[] = typeof vectors === "object" && vectors !== null && "editCases" in vectors && Array.isArray(vectors.editCases) ? (vectors.editCases as EditCase[]) : [];
  const png = { field: "referenceImage", filename: "a.png", contentType: "image/png", data: Buffer.from("x") };

  it("has edit cases to run", () => {
    expect(edits.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of edits) {
    it(`edit ${JSON.stringify(c.body)} → ${String(c.status)}`, () => {
      const run = (): unknown => validateRequest(CAPABILITIES, c.body, [png], () => 7);
      if (c.status === 202) {
        expect(run()).toMatchObject({ ratio: c.ratio ?? null, referenceImages: 1 });
        return;
      }
      expect(run).toThrow(HttpError);
      try {
        run();
      } catch (e) {
        expect(e).toMatchObject({ status: c.status, code: c.code, field: c.field });
      }
    });
  }
});
