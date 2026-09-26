import { describe, expect, it } from "vitest";
import { contentDisposition, resultFileName } from "./content-disposition";

describe("content disposition", () => {
  it("names the file from the job id's first eight characters", () => {
    expect(resultFileName("0b7f6a1e-1234-4cde")).toBe("qwen-0b7f6a1e.png");
    expect(resultFileName("a-b")).toBe("qwen-ab.png");
    expect(resultFileName("--")).toBe("qwen-image.png");
  });

  it("is inline for display and attachment for download", () => {
    expect(contentDisposition("abcdefgh99", "inline")).toBe('inline; filename="qwen-abcdefgh.png"');
    expect(contentDisposition("abcdefgh99", "attachment")).toBe('attachment; filename="qwen-abcdefgh.png"');
  });
});
