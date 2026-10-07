import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobStatusResponse } from "@/lib/job-api";
import { GenerationView, type GenerationViewProps } from "./GenerationView";

// STORY_024: the Info button and its panel, rendered in StrictMode (CLAUDE.md §6b).
const labels = { models: [{ id: "qwen-image-2.1", label: "Qwen-Image 2.1" }], loras: [{ id: "fake-detail", label: "Fake detail" }] };
const done: JobStatusResponse = {
  id: "j1",
  status: "done",
  progress: 100,
  createdAt: "2026-10-07T10:00:00.000Z",
  updatedAt: "2026-10-07T10:02:06.000Z",
  request: { prompt: "a red bicycle", ratio: "16:9", model: "qwen-image-2.1", seed: 42, referenceImages: 0, lora: "fake-detail", loraScale: 0.8, loraGuidance: null, promptSent: "a red bicycle, sharp focus" },
  result: { url: "/api/jobs/j1/result", mimeType: "image/png", width: 1376, height: 768, sizeBytes: 9 },
};

function view(props: Partial<GenerationViewProps> = {}) {
  return render(
    <StrictMode>
      <GenerationView job={done} prompt="a red bicycle" ratio="16:9" referenceFiles={[]} referenceCount={0} problem={null} onEdit={() => undefined} labels={labels} {...props} />
    </StrictMode>,
  );
}

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

describe("the Info panel", () => {
  it("is closed by default and toggles from the Info button", () => {
    view();
    const info = screen.getByRole("button", { name: "Info" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("settings-panel")).toBeNull();
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Settings" });
    expect(info).toHaveAttribute("aria-controls", panel.id);
    expect(within(panel).getByText("Fake detail")).toBeVisible();
    expect(within(panel).getByText("strength 0.8 · guidance default")).toBeVisible();
    expect(within(panel).getByText("a red bicycle, sharp focus")).toBeVisible();
    expect(within(panel).getByText("16:9 · 1376 × 768")).toBeVisible();
    fireEvent.click(info);
    expect(screen.queryByTestId("settings-panel")).toBeNull();
  });

  it("Copy writes the seed and Copy all every row to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy seed" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy seed" })).toHaveTextContent("Copied");
    });
    expect(writeText).toHaveBeenLastCalledWith("42");
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2);
    });
    expect(String(writeText.mock.lastCall?.[0]).split("\n")).toEqual([
      "Prompt: a red bicycle",
      "Sent: a red bicycle, sharp focus",
      "Model: Qwen-Image 2.1",
      "Size: 16:9 · 1376 × 768",
      "Seed: 42",
      "Add-on: Fake detail · strength 0.8 · guidance default",
      "Time: 2 min 6 s",
    ]);
  });

  it("offers Same seed again only when the request can be sent again", () => {
    const onSameSeed = vi.fn();
    const { unmount } = view({ onSameSeed });
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Same seed again" }));
    expect(onSameSeed).toHaveBeenCalledTimes(1);
    unmount();
    view();
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.queryByRole("button", { name: "Same seed again" })).toBeNull();
  });

  it("shows under a failed job's notice too, with how long it ran", () => {
    view({ job: { ...done, status: "failed", updatedAt: "2026-10-07T10:00:40.000Z", result: undefined, error: { code: "generation_failed", message: "out of memory" } } });
    expect(screen.getByTestId("notice")).toContainElement(screen.getByRole("button", { name: "Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(within(screen.getByTestId("settings-panel")).getByText("failed after 40 s")).toBeVisible();
  });
});
