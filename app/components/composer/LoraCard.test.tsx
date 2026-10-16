import { render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import type { LoraInfo } from "@/lib/composer-state";
import { LoraCard } from "./LoraCard";

// STORY_030: the card's body in the stub's two shapes.
const bare: LoraInfo = { scale: 1, guidance: null, trigger: null, madeFor: null, madeForReadOn: null, creator: null, origin: null, downloads: null, downloadsReadOn: null, abilities: [], benchSource: null };
const full: LoraInfo = {
  scale: 0.8,
  guidance: 3,
  trigger: "sharp focus",
  madeFor: "Sharper fine detail in skin, hair and fabric.",
  madeForReadOn: "2026-10-16",
  creator: "Stub Creator",
  origin: "https://example.com/loras/fake-detail",
  downloads: 18951,
  downloadsReadOn: "2026-10-07",
  abilities: [
    { subject: "Penis", claimed: "Trained on it.", bench: "Plausible in 1 of 4 edits." },
    { subject: "Anus", claimed: null, bench: null },
  ],
  benchSource: "Assistant's review (2026-10-11).",
};

describe("LoraCard", () => {
  it("shows what it was made for, each subject's claim and bench with the bench's source, and every fact in order", () => {
    render(
      <StrictMode>
        <LoraCard info={full} />
      </StrictMode>,
    );
    expect(screen.getByRole("heading", { name: "Made for" })).toBeInTheDocument();
    expect(screen.getByText("Sharper fine detail in skin, hair and fabric.")).toBeInTheDocument();
    const [penis, anus] = screen.getAllByTestId("lora-ability");
    expect(penis?.textContent).toBe("PenisClaimedTrained on it.BenchPlausible in 1 of 4 edits.");
    expect(anus?.textContent).toBe("AnusClaimednot statedBenchnot tested");
    expect(screen.getByText("Bench: Assistant's review (2026-10-11).")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^lora-fact-/).map((f) => f.textContent)).toEqual([
      "CreatorStub Creator",
      "Sourceexample.com ↗",
      "Downloads18,951 (2026-10-07)",
      "Triggersharp focus",
      "Strength0.8",
      "Guidance3",
    ]);
    const link = within(screen.getByTestId("lora-fact-source")).getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/loras/fake-detail");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Read from the creator's page on 2026-10-16");
  });

  it("shows a bare LoRA's trigger, strength and guidance only", () => {
    render(<LoraCard info={bare} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByTestId(/^lora-fact-/).map((f) => f.textContent)).toEqual(["Trigger—", "Strength1", "Guidancedefault"]);
  });

  it("leaves out the bench's source when no subject has a bench line", () => {
    render(<LoraCard info={{ ...full, abilities: [{ subject: "Penis", claimed: "Flaccid and uncut.", bench: null }] }} />);
    expect(screen.getByRole("heading", { name: "Capabilities" })).toBeInTheDocument();
    expect(screen.queryByText(/^Bench: /)).toBeNull();
  });
});
