import { describe, expect, it } from "vitest";
import { isApiError, isCreateJobResponse, isJobStatus, isJobStatusResponse, isTerminal } from "./job-api";

const base = { id: "j1", status: "running", progress: 33, createdAt: "t", updatedAt: "t", request: { prompt: "p", ratio: "1:1", model: "m", seed: 1, referenceImages: 0 } };

describe("job-api checks", () => {
  it("knows the statuses and which are terminal", () => {
    expect(["queued", "running", "done", "failed", "cancelled", "paused"].map(isJobStatus)).toEqual([true, true, true, true, true, false]);
    expect(isTerminal("done") && isTerminal("failed") && isTerminal("cancelled")).toBe(true);
    expect(isTerminal("running") || isTerminal("queued")).toBe(false);
  });

  it("accepts a contract status, and an edit's null ratio", () => {
    expect(isJobStatusResponse(base)).toBe(true);
    expect(isJobStatusResponse({ ...base, request: { ...base.request, ratio: null } })).toBe(true);
  });

  it("requires a result when done and an error when failed", () => {
    expect(isJobStatusResponse({ ...base, status: "done" })).toBe(false);
    expect(isJobStatusResponse({ ...base, status: "done", result: { url: "/r", mimeType: "image/png", width: 1, height: 1, sizeBytes: 1 } })).toBe(true);
    expect(isJobStatusResponse({ ...base, status: "failed" })).toBe(false);
    expect(isJobStatusResponse({ ...base, status: "failed", error: { code: "moderated", message: "m" } })).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isJobStatusResponse(null)).toBe(false);
    expect(isJobStatusResponse({ ...base, status: "paused" })).toBe(false);
    expect(isJobStatusResponse({ ...base, request: {} })).toBe(false);
    expect(isJobStatusResponse({ ...base, createdAt: 1 })).toBe(false);
  });

  it("checks create answers and errors", () => {
    expect(isCreateJobResponse({ id: "a", status: "queued", progress: 0 })).toBe(true);
    expect(isCreateJobResponse({ id: "", status: "queued", progress: 0 })).toBe(false);
    expect(isApiError({ error: { code: "x", message: "y" } })).toBe(true);
    expect(isApiError({ error: "x" })).toBe(false);
  });
});
