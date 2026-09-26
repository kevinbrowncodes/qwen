/**
 * Status polling (STORY_012), pure: the delay before each poll and when to stop. 1 s, then ×1.5, capped at 4 s: quick
 * enough for the stub's scripted steps, gentle on the Spark during a real 30–40 s generation.
 */
import { isJobStatus, isTerminal } from "./job-api";

export const FIRST_DELAY_MS = 1000;
export const FACTOR = 1.5;
export const MAX_DELAY_MS = 4000;

/** The wait before poll number `attempt` (0-based). */
export function delayFor(attempt: number): number {
  return Math.min(Math.round(FIRST_DELAY_MS * FACTOR ** Math.max(0, attempt)), MAX_DELAY_MS);
}

export function isTerminalStatus(status: unknown): boolean {
  return isJobStatus(status) && isTerminal(status);
}
