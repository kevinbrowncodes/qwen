"use client";
/**
 * The composer as the pages use it (STORY_012): sending creates the job FIRST and only then moves to its view
 * (CLAUDE.md §4c: send first, paint second). A refused create keeps the text and shows the server's message.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComposerState } from "@/lib/composer-state";
import { remember } from "@/lib/pending";
import { announceHistoryChanged } from "@/lib/use-history";
import { requestFrom, submitGeneration, type GenerationRequest } from "@/lib/submit";
import { Composer, type Injected } from "./Composer";

export function useSubmit(): { readonly submit: (req: GenerationRequest) => Promise<boolean>; readonly error: string | null; readonly busy: boolean } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (req: GenerationRequest): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const outcome = await submitGeneration(req);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return false;
    }
    remember(outcome.id, req);
    announceHistoryChanged();
    router.push(`/g/${encodeURIComponent(outcome.id)}`);
    return true;
  };
  return { submit, error, busy };
}

export function ComposerHost({ running, onStop, inject }: { readonly running?: boolean; readonly onStop?: () => void; readonly inject?: Injected | null }) {
  const { submit, error, busy } = useSubmit();
  return (
    <Composer
      onSubmit={(state: ComposerState) => submit(requestFrom(state))}
      externalError={error}
      busy={busy}
      running={running}
      onStop={onStop}
      inject={inject ?? null}
    />
  );
}
