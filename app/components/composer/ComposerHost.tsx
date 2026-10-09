"use client";
/**
 * The composer as the pages use it (STORY_012): sending creates the job FIRST and only then shows it (CLAUDE.md §4c:
 * send first, paint second). A refused create keeps the text and shows the server's message.
 *
 * STORY_025: a send creates the composer's count of jobs, one after another. On the home page they are remembered with
 * the first and the page moves to it; on a generation page `onCreated` adds them to that page instead. Either way the
 * page changes only after every create has been answered, so a navigation never cancels one.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComposerState } from "@/lib/composer-state";
import { remember, rememberBatch } from "@/lib/pending";
import { announceHistoryChanged } from "@/lib/use-history";
import { batchMessage, requestFrom, submitBatch, type GenerationRequest } from "@/lib/submit";
import { Composer, type Injected } from "./Composer";

export type OnCreated = (ids: readonly string[]) => void;

export function useSubmit(onCreated?: OnCreated): { readonly submit: (req: GenerationRequest, count?: number) => Promise<boolean>; readonly error: string | null; readonly busy: boolean } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (req: GenerationRequest, count = 1): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const outcome = await submitBatch(req, count);
    setBusy(false);
    setError(batchMessage(outcome, count));
    const [first, ...rest] = outcome.ids;
    if (first !== undefined) {
      for (const id of outcome.ids) remember(id, req);
      announceHistoryChanged();
      if (onCreated) {
        onCreated(outcome.ids);
      } else {
        rememberBatch(first, rest);
        router.push(`/g/${encodeURIComponent(first)}`);
      }
    }
    // The composer clears only when every image asked for was queued; otherwise the text stays to send again.
    return outcome.message === null;
  };
  return { submit, error, busy };
}

export function ComposerHost({ onCreated, inject }: { readonly onCreated?: OnCreated; readonly inject?: Injected | null }) {
  const { submit, error, busy } = useSubmit(onCreated);
  return <Composer onSubmit={(state: ComposerState) => submit(requestFrom(state), state.count)} externalError={error} busy={busy} inject={inject ?? null} />;
}
