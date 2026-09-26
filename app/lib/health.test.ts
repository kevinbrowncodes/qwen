import { describe, expect, it } from "vitest";
import { health } from "./health";

describe("health", () => {
  it("reports ok and nothing else", () => {
    expect(health()).toStrictEqual({ status: "ok" });
  });
});
