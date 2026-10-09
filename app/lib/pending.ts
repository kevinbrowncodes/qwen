/**
 * What the browser still holds about generations it started in this page session (STORY_012): the prompt and the
 * reference files, so the generation view can show them at once and Regenerate can resend an edit. Files never
 * leave the browser except in the create request; after a reload an edit shows its reference count instead.
 */
import type { GenerationRequest } from "./submit";

const pending = new Map<string, GenerationRequest>();

export function remember(id: string, req: GenerationRequest): void {
  pending.set(id, req);
}

export function recall(id: string): GenerationRequest | undefined {
  return pending.get(id);
}

export function forget(id: string): void {
  pending.delete(id);
}

/**
 * A send of several images from the home page (STORY_025): the jobs after the first, kept under the first's id so the
 * page it moves to shows them all. Read once by that page; a reload starts from the URL's job alone.
 */
const batches = new Map<string, readonly string[]>();

export function rememberBatch(firstId: string, rest: readonly string[]): void {
  if (rest.length > 0) batches.set(firstId, rest);
}

export function recallBatch(firstId: string): readonly string[] {
  return batches.get(firstId) ?? [];
}
