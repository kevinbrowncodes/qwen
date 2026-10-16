import { describe, expect, it } from "vitest";
import type { LoraInfo } from "./composer-state";
import { downloadsText, hostOf, loraCard, NOT_STATED, NOT_TESTED } from "./lora-card";

// STORY_030: what a LoRA's info card says, in the two shapes the stub sends (full and bare).
const bare: LoraInfo = { scale: 1, guidance: null, trigger: null, madeFor: null, madeForReadOn: null, creator: null, origin: null, downloads: null, downloadsReadOn: null, abilities: [], benchSource: null };
const full: LoraInfo = {
  scale: 0.9,
  guidance: 4,
  trigger: "d3np3n1s",
  madeFor: "General NSFW for text-to-image and edits.",
  madeForReadOn: "2026-10-16",
  creator: "TheseAlpacas",
  origin: "https://civitai.com/models/2958918?modelVersionId=3357315",
  downloads: 18951,
  downloadsReadOn: "2026-10-07",
  abilities: [
    { subject: "Penis", claimed: "Trained on it.", bench: "Plausible in 1 of 4 edits." },
    { subject: "Anus", claimed: null, bench: null },
  ],
  benchSource: "Assistant's review (2026-10-11).",
};

describe("loraCard", () => {
  it("gives a bare LoRA only its trigger, strength and guidance, with no made-for line, abilities or note", () => {
    expect(loraCard(bare)).toEqual({
      madeFor: null,
      abilities: [],
      benchNote: null,
      facts: [
        { key: "trigger", label: "Trigger", value: "—" },
        { key: "strength", label: "Strength", value: "1" },
        { key: "guidance", label: "Guidance", value: "default" },
      ],
    });
  });

  it("gives a described LoRA every fact in order, the source as its host linking to the page", () => {
    const card = loraCard(full);
    expect(card.madeFor).toBe("General NSFW for text-to-image and edits.");
    expect(card.facts.map((f) => [f.label, f.value])).toEqual([
      ["Creator", "TheseAlpacas"],
      ["Source", "civitai.com"],
      ["Downloads", "18,951 (2026-10-07)"],
      ["Trigger", "d3np3n1s"],
      ["Strength", "0.9"],
      ["Guidance", "4"],
    ]);
    expect(card.facts[1]).toMatchObject({ href: full.origin, title: "Read from the creator's page on 2026-10-16" });
  });

  it("says 'not stated' and 'not tested' where nothing is known, and names the bench only when a bench line exists", () => {
    const card = loraCard(full);
    expect(card.abilities).toEqual([
      { subject: "Penis", claimed: "Trained on it.", bench: "Plausible in 1 of 4 edits." },
      { subject: "Anus", claimed: NOT_STATED, bench: NOT_TESTED },
    ]);
    expect(card.benchNote).toBe("Assistant's review (2026-10-11).");
    const untested = loraCard({ ...full, abilities: [{ subject: "Penis", claimed: "Flaccid and uncut.", bench: null }] });
    expect(untested.benchNote).toBeNull();
  });

  it("leaves the source without a title when the made-for date is unknown", () => {
    expect(loraCard({ ...full, madeForReadOn: null }).facts[1]).not.toHaveProperty("title");
  });
});

describe("hostOf and downloadsText", () => {
  it("shows a page by its host, without www", () => {
    expect(hostOf("https://huggingface.co/JoyFusionAI/x")).toBe("huggingface.co");
    expect(hostOf("https://www.civitai.com/models/1")).toBe("civitai.com");
    expect(hostOf("not a url")).toBe("not a url");
  });

  it("groups thousands and keeps the count's date", () => {
    expect(downloadsText(18951, "2026-10-07")).toBe("18,951 (2026-10-07)");
    expect(downloadsText(605, null)).toBe("605");
  });
});
