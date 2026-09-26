import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crc32, encodePng, pngSize, referenceFixture, resultFixture } from "./png.ts";

describe("png", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("encodes a PNG whose header states its size", () => {
    expect(pngSize(encodePng(3, 2, () => [0, 0, 0]))).toEqual({ width: 3, height: 2 });
    expect(() => pngSize(Buffer.from("not a png at all, really not"))).toThrow();
  });

  it("rebuilds the committed fixtures byte for byte", () => {
    expect(resultFixture().equals(readFileSync(new URL("../fixtures/result.png", import.meta.url)))).toBe(true);
    expect(referenceFixture().equals(readFileSync(new URL("../fixtures/reference.png", import.meta.url)))).toBe(true);
    expect(pngSize(resultFixture())).toEqual({ width: 64, height: 36 });
    expect(resultFixture().length).toBeLessThan(2048);
  });
});
