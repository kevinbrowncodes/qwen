"use client";
/**
 * The composer as the pages use it (STORY_012): sending creates the job FIRST and only then shows it (CLAUDE.md §4c:
 * send first, paint second). A refused create keeps the text and shows the server's message.
 *
 * STORY_025: a send creates the composer's count of jobs, one after another. On the home page they start a chat
 * (STORY_031: the first job's id names it, and the rest join it) and the page moves to it; on a chat's page they join
 * that chat and `onCreated` adds them to the page. Either way the page changes only after every create has been
 * answered, so a navigation never cancels one.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComposerState } from "@/lib/composer-state";
import { remember } from "@/lib/pending";
import { announceHistoryChanged } from "@/lib/use-history";
import { batchMessage, requestFrom, submitBatch, type GenerationRequest } from "@/lib/submit";
import { Composer, type Injected } from "./Composer";

export type OnCreated = (ids: readonly string[]) => void;

export function useSubmit(onCreated?: OnCreated, chat?: string): { readonly submit: (req: GenerationRequest, count?: number) => Promise<boolean>; readonly error: string | null; readonly busy: boolean } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (req: GenerationRequest, count = 1): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const outcome = await submitBatch(chat === undefined ? req : { ...req, chat }, count);
    setBusy(false);
    setError(batchMessage(outcome, count));
    const [first] = outcome.ids;
    if (first !== undefined) {
      for (const id of outcome.ids) remember(id, req);
      announceHistoryChanged();
      if (onCreated) {
        onCreated(outcome.ids);
      } else {
        router.push(`/g/${encodeURIComponent(first)}`);
      }
    }
    // The composer clears only when every image asked for was queued; otherwise the text stays to send again.
    return outcome.message === null;
  };
  return { submit, error, busy };
}

/** `chat` is the chat a send joins (STORY_031); the home page passes none, so its send starts one. */
export function ComposerHost({ onCreated, inject, chat }: { readonly onCreated?: OnCreated; readonly inject?: Injected | null; readonly chat?: string }) {
  const { submit, error, busy } = useSubmit(onCreated, chat);
  return <Composer onSubmit={(state: ComposerState) => submit(requestFrom(state), state.count)} externalError={error} busy={busy} inject={inject ?? null} />;
}
