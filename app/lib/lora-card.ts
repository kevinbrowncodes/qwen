/**
 * What a LoRA's info card says (STORY_030), as plain data the component renders: the made-for line, each subject's
 * claim and bench result, and the facts. Pure, so every wording is unit-tested. Trigger, strength and guidance always
 * show (the server always knows them); the other facts are left out when unknown, never shown blank.
 */
import type { LoraInfo } from "./composer-state";
import { settingText } from "./generation-settings";

export const NOT_STATED = "not stated";
export const NOT_TESTED = "not tested";
export const USE_LABEL = "Use this LoRA";
export const IN_USE_LABEL = "In use";

export interface CardAbility {
  readonly subject: string;
  readonly claimed: string;
  readonly bench: string;
}

export interface CardFact {
  readonly key: "creator" | "source" | "downloads" | "trigger" | "strength" | "guidance";
  readonly label: string;
  readonly value: string;
  /** The source page, for the Source row only. */
  readonly href?: string;
  readonly title?: string;
}

export interface CardContent {
  readonly madeFor: string | null;
  readonly abilities: readonly CardAbility[];
  /** Whose judgement the bench lines are; only when at least one bench line exists. */
  readonly benchNote: string | null;
  readonly facts: readonly CardFact[];
}

/** "civitai.com" for https://civitai.com/models/1, without a leading www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "18,951 (2026-10-07)": the count is a snapshot, so its date always goes with it. */
export function downloadsText(count: number, readOn: string | null): string {
  const n = count.toLocaleString("en-US");
  return readOn === null ? n : `${n} (${readOn})`;
}

export function loraCard(info: LoraInfo): CardContent {
  const abilities = info.abilities.map((a) => ({ subject: a.subject, claimed: a.claimed ?? NOT_STATED, bench: a.bench ?? NOT_TESTED }));
  const benched = info.abilities.some((a) => a.bench !== null);
  const facts: CardFact[] = [];
  if (info.creator !== null) facts.push({ key: "creator", label: "Creator", value: info.creator });
  if (info.origin !== null) {
    const title = info.madeForReadOn === null ? undefined : `Read from the creator's page on ${info.madeForReadOn}`;
    facts.push({ key: "source", label: "Source", value: hostOf(info.origin), href: info.origin, ...(title === undefined ? {} : { title }) });
  }
  if (info.downloads !== null) facts.push({ key: "downloads", label: "Downloads", value: downloadsText(info.downloads, info.downloadsReadOn) });
  facts.push({ key: "trigger", label: "Trigger", value: info.trigger ?? "—" });
  facts.push({ key: "strength", label: "Strength", value: settingText(info.scale) });
  facts.push({ key: "guidance", label: "Guidance", value: settingText(info.guidance) });
  return { madeFor: info.madeFor, abilities, benchNote: benched ? info.benchSource : null, facts };
}
