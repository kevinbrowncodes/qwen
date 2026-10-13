import { describe, expect, it } from "vitest";
import { envValue } from "./env-file.ts";

describe("envValue", () => {
  it("reads a plain value, with or without export", () => {
    expect(envValue("HANDS_API_TOKEN=abc\n", "HANDS_API_TOKEN")).toBe("abc");
    expect(envValue("export HANDS_URL=http://hands.local\n", "HANDS_URL")).toBe("http://hands.local");
  });

  it("strips matching quotes", () => {
    expect(envValue('HANDS_API_TOKEN="a b"\n', "HANDS_API_TOKEN")).toBe("a b");
    expect(envValue("HANDS_API_TOKEN='x'\n", "HANDS_API_TOKEN")).toBe("x");
  });

  it("gives none for a commented-out line, an empty value and a missing key", () => {
    expect(envValue("# HANDS_API_TOKEN=abc\n", "HANDS_API_TOKEN")).toBeUndefined();
    expect(envValue("HANDS_API_TOKEN=\n", "HANDS_API_TOKEN")).toBeUndefined();
    expect(envValue("CIVITAI_TOKEN=zzz\n", "HANDS_API_TOKEN")).toBeUndefined();
  });

  it("ignores other variables and odd lines", () => {
    expect(envValue("junk line\nCIVITAI_TOKEN=zzz\nHANDS_API_TOKEN=abc\n", "HANDS_API_TOKEN")).toBe("abc");
  });
});
