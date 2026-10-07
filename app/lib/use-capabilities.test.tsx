import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_CAPABILITIES } from "./composer-state";
import { useCapabilities } from "./use-capabilities";

// STORY_024: the generation page's labels come from the server's capabilities, with the contract's fallback.
function Probe() {
  const caps = useCapabilities();
  return <p>{caps.loras.map((l) => l.label).join(",") || "none"}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCapabilities", () => {
  it("reads the server's add-ons", async () => {
    const body = { ...FALLBACK_CAPABILITIES, loras: [{ id: "a", label: "Add-on A" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(await screen.findByText("Add-on A")).toBeTruthy();
  });

  it("keeps the fallback when the server is down, refuses, or answers off-contract", async () => {
    for (const fetchImpl of [vi.fn().mockRejectedValue(new Error("down")), vi.fn().mockResolvedValue(new Response("{}", { status: 503 })), vi.fn().mockResolvedValue(new Response("{}"))]) {
      vi.stubGlobal("fetch", fetchImpl);
      const { unmount } = render(<Probe />);
      await waitFor(() => {
        expect(fetchImpl).toHaveBeenCalled();
      });
      expect(screen.getByText("none")).toBeTruthy();
      unmount();
    }
  });
});
