import { describe, expect, it } from "vitest";
import { endpoints, endpointsJson, parseEndpointSource, placeholders, renderEndpoints } from "./endpoints-model.ts";

const raw = {
  source: "resource timing",
  method_note: "no methods",
  endpoints: {
    chat: [
      { host: "chat.qwen.ai", path: "/api/v2/chats/", likely: "chat list" },
      { host: "chat.qwen.ai", path: "/api/v2/chats/pinned" },
      { host: "chat.qwen.ai", path: "/api/v2/chats/0b7f6a1e-1234-4cde-9abc-0123456789ab?x=1" },
    ],
    auth: [{ host: "auth.qwen.ai", path: "/api/v2/auths/refresh" }],
    noise: [
      { host: "aplus.qwen.ai", path: "/v.gif" },
      { host: "ss.qwen.ai", path: "/check" },
      { host: "cdn.qwenlm.ai", path: "/output/abc/t2i/x.png" },
      { host: "assets.alicdn.com", path: "/g/x.css" },
    ],
    users: [{ host: "chat.qwen.ai", path: "/api/v2/users/status", also: "beacon" }],
  },
  not_observed: ["send / image generation / streaming endpoint", "file upload endpoint"],
  not_observed_reason: "timing records were cleared",
  skipped: ["analytics (aplus.qwen.ai)"],
};

describe("placeholders", () => {
  it("replaces uuids, long numbers and long hex, drops the query, and leaves words alone", () => {
    expect(placeholders("/api/v2/chats/0b7f6a1e-1234-4cde-9abc-0123456789ab?x=1")).toBe("/api/v2/chats/:uuid");
    expect(placeholders("/api/v2/files/12345678")).toBe("/api/v2/files/:id");
    expect(placeholders("/api/v2/blob/0123456789abcdef0123")).toBe("/api/v2/blob/:hex");
    expect(placeholders("/api/v2/chats/pinned")).toBe("/api/v2/chats/pinned");
  });
});

describe("endpoints", () => {
  const src = parseEndpointSource(raw);
  const list = endpoints(src);

  it("keeps the source's groups in order and drops noise hosts", () => {
    expect(list.map((e) => `${e.group} ${e.host}${e.path}`)).toEqual([
      "chat chat.qwen.ai/api/v2/chats/",
      "chat chat.qwen.ai/api/v2/chats/pinned",
      "chat chat.qwen.ai/api/v2/chats/:uuid",
      "auth auth.qwen.ai/api/v2/auths/refresh",
      "users chat.qwen.ai/api/v2/users/status",
    ]);
  });

  it("carries the notes", () => {
    expect(list[0]?.note).toBe("likely chat list");
    expect(list.at(-1)?.note).toBe("also sent as a beacon");
  });

  it("states what was not observed, in both files", () => {
    const md = renderEndpoints(src, list, "2026-09-26");
    expect(md).toContain("**This is not the protocol.**");
    expect(md).toContain("- send / image generation / streaming endpoint");
    expect(md).toContain("Why: timing records were cleared.");
    const json = JSON.parse(endpointsJson(src, list, "2026-09-26"));
    expect(json.not_observed).toEqual(raw.not_observed);
    expect(JSON.stringify(json)).not.toContain("?x=1");
  });

  it("refuses a file without endpoints", () => {
    expect(() => parseEndpointSource({ not_observed: [] })).toThrow();
  });
});
