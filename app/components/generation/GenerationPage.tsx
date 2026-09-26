"use client";
/**
 * The page at /g/<id> (STORY_012): the generation, the composer below it (Stop while it runs), and the footer line.
 * What this page session started is known at once (lib/pending.ts); anything else comes from history.
 */
import { useCallback, useState } from "react";
import { ComposerHost, useSubmit } from "@/components/composer/ComposerHost";
import type { Injected } from "@/components/composer/Composer";
import { resultFileName } from "@/lib/content-disposition";
import { recall } from "@/lib/pending";
import { useGeneration } from "@/lib/use-generation";
import { GenerationView } from "./GenerationView";

interface Known {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly referenceCount: number;
  readonly files: readonly File[];
}

function fromPending(id: string): Known | null {
  const req = recall(id);
  return req ? { prompt: req.prompt, ratio: req.ratio, model: req.model, referenceCount: req.references.length, files: req.references } : null;
}

let nonce = 0;

export function GenerationPage({ id }: { readonly id: string }) {
  const [known] = useState<Known | null>(() => fromPending(id));
  const [inject, setInject] = useState<Injected | null>(null);
  const onTerminal = useCallback(() => {
    window.dispatchEvent(new CustomEvent("qwen:history-changed"));
  }, []);
  const { job, problem, stop } = useGeneration(id, onTerminal);
  const { submit } = useSubmit();

  // Reopened from history (or after a reload): the prompt and options come from the job's own echo.
  const echo = job?.request;
  const shown: Known | null = known ?? (echo ? { prompt: echo.prompt, ratio: echo.ratio, model: echo.model, referenceCount: echo.referenceImages, files: [] } : null);

  const running = job !== null && (job.status === "queued" || job.status === "running");
  const canResend = shown !== null && (shown.referenceCount === 0 || shown.files.length === shown.referenceCount);

  return (
    <div className="clone-chat-page">
      <div className="chat-container clone-chat-scroll">
        {shown ? (
          <GenerationView
            job={job}
            prompt={shown.prompt}
            ratio={shown.ratio}
            referenceFiles={shown.files}
            referenceCount={shown.referenceCount}
            problem={problem}
            onEdit={(url) => {
              void fetch(url)
                .then((r) => r.blob())
                .then((blob) => {
                  setInject({ files: [new File([blob], resultFileName(id), { type: blob.type || "image/png" })], nonce: ++nonce });
                });
            }}
            onRegenerate={canResend ? () => void submit({ prompt: shown.prompt, ratio: shown.ratio, model: shown.model, references: shown.files }) : undefined}
          />
        ) : problem ? (
          <div className="qwen-chat-message">
            <div className="clone-generation-notice" role="status">
              {problem}
            </div>
          </div>
        ) : null}
        <div className="chat-container-bottom" />
      </div>
      <ComposerHost running={running} onStop={() => void stop()} inject={inject} />
      <div className="clone-statement">AI-generated content may not be accurate.</div>
    </div>
  );
}
