import { describe, expect, it } from "vitest";
import { ConfigError, historyFile, readConfig } from "./config";

describe("readConfig", () => {
  it("reads the base URL and trims a trailing slash", () => {
    expect(readConfig({ MODEL_BASE_URL: "http://stub:4110/" })).toEqual({ modelBaseUrl: "http://stub:4110", modelApiKey: undefined });
    expect(readConfig({ MODEL_BASE_URL: " https://model.example//", MODEL_API_KEY: " k " })).toEqual({ modelBaseUrl: "https://model.example", modelApiKey: "k" });
  });

  it("treats an empty key as no key", () => {
    expect(readConfig({ MODEL_BASE_URL: "http://a", MODEL_API_KEY: "  " }).modelApiKey).toBeUndefined();
  });

  it("refuses a missing, relative or non-http base URL", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({ MODEL_BASE_URL: "  " })).toThrow(/not set/);
    expect(() => readConfig({ MODEL_BASE_URL: "stub:4110" })).toThrow(/http or https/);
    expect(() => readConfig({ MODEL_BASE_URL: "/jobs" })).toThrow(/absolute/);
    expect(() => readConfig({ MODEL_BASE_URL: "ftp://a" })).toThrow(/http or https/);
  });
});

describe("historyFile", () => {
  it("uses HISTORY_FILE, or a local default", () => {
    expect(historyFile({ HISTORY_FILE: "/data/history.json" })).toBe("/data/history.json");
    expect(historyFile({})).toBe("history.json");
  });
});
