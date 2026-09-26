import { describe, expect, it } from "vitest";
import { MAX_REFERENCE_BYTES, sniffImage, validateAddition, validateReferences } from "./upload-validation";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const gif = new TextEncoder().encode("GIF89a");
const text = new TextEncoder().encode("hello, I am not a PNG");
const file = (head: Uint8Array, size = 100, name = "a.png") => ({ name, size, head });

describe("sniffImage", () => {
  it("recognises PNG, JPEG and WebP by their bytes and nothing else", () => {
    expect([png, jpeg, webp, gif, text, new Uint8Array()].map(sniffImage)).toEqual(["image/png", "image/jpeg", "image/webp", null, null, null]);
  });
});

describe("validateReferences", () => {
  it("accepts none, and ten", () => {
    expect(validateReferences([])).toEqual({ ok: true });
    expect(validateReferences(Array.from({ length: 10 }, () => file(png)))).toEqual({ ok: true });
  });

  it("refuses eleven", () => {
    expect(validateReferences(Array.from({ length: 11 }, () => file(png)))).toMatchObject({ ok: false, status: 400, code: "validation", field: "referenceImage" });
  });

  it("refuses a GIF, and a text file named .png", () => {
    expect(validateReferences([file(gif, 10, "a.gif")])).toMatchObject({ ok: false, status: 415 });
    const verdict = validateReferences([file(text, 10, "fake.png")]);
    expect(verdict).toMatchObject({ ok: false, status: 415 });
    expect(verdict.ok ? "" : verdict.message).toContain("fake.png");
  });

  it("accepts 20 MB and refuses one byte more", () => {
    expect(validateReferences([file(jpeg, MAX_REFERENCE_BYTES)])).toEqual({ ok: true });
    expect(validateReferences([file(webp, MAX_REFERENCE_BYTES + 1)])).toMatchObject({ ok: false, status: 413, code: "too_large" });
  });
});

describe("validateAddition", () => {
  it("counts the images already attached", () => {
    expect(validateAddition(9, [file(png)])).toEqual({ ok: true });
    expect(validateAddition(9, [file(png), file(png)])).toMatchObject({ ok: false, message: "Attach at most 10 reference images." });
  });

  it("checks each new file's type and size", () => {
    expect(validateAddition(0, [file(png), file(gif, 10, "photo.gif")])).toMatchObject({ ok: false, message: "photo.gif is not a PNG, JPEG or WebP image." });
  });
});
