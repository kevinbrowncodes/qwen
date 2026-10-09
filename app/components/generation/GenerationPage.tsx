"use client";
/**
 * The page at /g/<id> (STORY_012): the generations, the composer below them, and the footer line. What this page
 * session started is known at once (lib/pending.ts); anything else comes from history.
 *
 * STORY_025: the page holds a list of cards, the URL's job first and then every job sent from this page during the
 * visit, in order. Each card polls, stops and resends on its own. A reload starts again from the URL's job.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ComposerHost, useSubmit, type OnCreated } from "@/components/composer/ComposerHost";
import type { Injected } from "@/components/composer/Composer";
import type { Labels } from "@/lib/generation-settings";
import { resultFileName } from "@/lib/content-disposition";
import { recall, recallBatch } from "@/lib/pending";
import { useCapabilities } from "@/lib/use-capabilities";
import { useGeneration } from "@/lib/use-generation";
import { announceHistoryChanged } from "@/lib/use-history";
import { GenerationView } from "./GenerationView";

interface Known {
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly referenceCount: number;
  readonly files: readonly File[];
  /** Regenerate uses the same add-on (STORY_019). */
  readonly lora: string | null;
}

function fromPending(id: string): Known | null {
  const req = recall(id);
  return req ? { prompt: req.prompt, ratio: req.ratio, model: req.model, referenceCount: req.references.length, files: req.references, lora: req.lora } : null;
}

let nonce = 0;

interface CardProps {
  readonly id: string;
  readonly labels: Labels;
  readonly onCreated: OnCreated;
  readonly onEdit: (id: string, url: string) => void;
}

/** One generation on the page: its own poll, Stop, Regenerate and Same seed again, which add cards to this page. */
function GenerationCard({ id, labels, onCreated, onEdit }: CardProps) {
  const [known] = useState<Known | null>(() => fromPending(id));
  const onTerminal = useCallback(() => {
    announceHistoryChanged();
  }, []);
  const { job, problem, stop } = useGeneration(id, onTerminal);
  const { submit } = useSubmit(onCreated);

  // Reopened from history (or after a reload): the prompt and options come from the job's own echo.
  const echo = job?.request;
  const shown: Known | null = known ?? (echo ? { prompt: echo.prompt, ratio: echo.ratio, model: echo.model, referenceCount: echo.referenceImages, files: [], lora: echo.lora ?? null } : null);

  const canResend = shown !== null && (shown.referenceCount === 0 || shown.files.length === shown.referenceCount);
  // Regenerate draws a new seed; Same seed again (STORY_024) sends this job's, from its echo. Each makes one image.
  const resend = (seed?: number): void => {
    if (shown) void submit({ prompt: shown.prompt, ratio: shown.ratio, model: shown.model, lora: shown.lora, references: shown.files, ...(seed === undefined ? {} : { seed }) });
  };

  if (!shown) {
    return problem ? (
      <div className="qwen-chat-message" data-testid="generation" data-job-id={id}>
        <div className="clone-generation-notice" role="status">
          {problem}
        </div>
      </div>
    ) : null;
  }
  return (
    <GenerationView
      id={id}
      job={job}
      prompt={shown.prompt}
      ratio={shown.ratio}
      referenceFiles={shown.files}
      referenceCount={shown.referenceCount}
      problem={problem}
      onEdit={(url) => {
        onEdit(id, url);
      }}
      onRegenerate={
        canResend
          ? () => {
              resend();
            }
          : undefined
      }
      labels={labels}
      onSameSeed={
        canResend && echo
          ? () => {
              resend(echo.seed);
            }
          : undefined
      }
      onStop={() => void stop()}
    />
  );
}

export function GenerationPage({ id }: { readonly id: string }) {
  const [ids, setIds] = useState<readonly string[]>(() => [id, ...recallBatch(id)]);
  const [inject, setInject] = useState<Injected | null>(null);
  const capabilities = useCapabilities();
  const scroller = useRef<HTMLDivElement>(null);
  // The count the page opened with: only cards added after it scroll into view (decide-once state in a ref, §6b).
  const shownCount = useRef(ids.length);

  const append = useCallback<OnCreated>((more) => {
    setIds((prev) => [...prev, ...more]);
  }, []);
  const onEdit = useCallback((jobId: string, url: string) => {
    void fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        setInject({ files: [new File([blob], resultFileName(jobId), { type: blob.type || "image/png" })], nonce: ++nonce });
      });
  }, []);

  // A card added by a send scrolls into view; a result loading higher up never moves the page.
  useEffect(() => {
    if (ids.length <= shownCount.current) return;
    shownCount.current = ids.length;
    const cards = scroller.current?.querySelectorAll('[data-testid="generation"]');
    const last = cards?.[cards.length - 1];
    if (last instanceof HTMLElement && typeof last.scrollIntoView === "function") last.scrollIntoView({ block: "end" });
  }, [ids.length]);

  return (
    <div className="clone-chat-page">
      <div className="chat-container clone-chat-scroll" ref={scroller}>
        {ids.map((jobId) => (
          <GenerationCard key={jobId} id={jobId} labels={capabilities} onCreated={append} onEdit={onEdit} />
        ))}
        <div className="chat-container-bottom" />
      </div>
      <ComposerHost onCreated={append} inject={inject} />
      <div className="clone-statement">AI-generated content may not be accurate.</div>
    </div>
  );
}
