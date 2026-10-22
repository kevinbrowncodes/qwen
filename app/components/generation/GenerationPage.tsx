"use client";
/**
 * The page at /g/<id> (STORY_012): the generations, the composer below them, and the footer line. What this page
 * session started is known at once (lib/pending.ts); anything else comes from history.
 *
 * STORY_025: the page holds a list of cards, each polling, stopping and resending on its own.
 *
 * STORY_031: the page is a chat. Its cards are every turn history records for the chat, oldest first, then the turns
 * sent during the visit (shown at once, before history has them: send first, paint second). Every send from the page
 * joins the chat. A reload, or reopening from the sidebar, shows the same turns. A URL naming a later turn, or a
 * `#<job id>` from My Library, opens the chat at that turn.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposerHost, useSubmit, type OnCreated } from "@/components/composer/ComposerHost";
import { useImageViewer } from "@/components/ImageViewer";
import type { Injected } from "@/components/composer/Composer";
import type { Labels } from "@/lib/generation-settings";
import { resultFileName } from "@/lib/content-disposition";
import { chatIdOf, turnsOf } from "@/lib/history-view";
import { recall } from "@/lib/pending";
import { useCapabilities } from "@/lib/use-capabilities";
import { useGeneration } from "@/lib/use-generation";
import { announceHistoryChanged, useHistory } from "@/lib/use-history";
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
  readonly chat: string;
  readonly labels: Labels;
  readonly onCreated: OnCreated;
  readonly onEdit: (id: string, url: string) => void;
  readonly onDelete: (id: string) => void;
  /** Outlined: the turn My Library opened the chat at (STORY_031). */
  readonly highlighted: boolean;
  /** Starred in history (STORY_039). */
  readonly favorite: boolean;
  readonly onStar: (id: string, on: boolean) => void;
}

/** One turn of the chat: its own poll, Stop, Delete, Regenerate and Same seed again, which add turns to this chat. */
function GenerationCard({ id, chat, labels, onCreated, onEdit, onDelete, highlighted, favorite, onStar }: CardProps) {
  const [known] = useState<Known | null>(() => fromPending(id));
  const onTerminal = useCallback(() => {
    announceHistoryChanged();
  }, []);
  const { job, problem, stop } = useGeneration(id, onTerminal);
  const { submit } = useSubmit(onCreated, chat);

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
      onDelete={() => {
        onDelete(id);
      }}
      highlighted={highlighted}
      favorite={favorite}
      onStar={() => {
        onStar(id, !favorite);
      }}
    />
  );
}

/** The turn a URL asks for: `#<job id>` (from My Library), else a URL naming a later turn; null for the newest. */
function targetOf(urlId: string, chatId: string): string | null {
  const hash = typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1));
  if (hash !== "") return hash;
  return urlId === chatId ? null : urlId;
}

export function GenerationPage({ id }: { readonly id: string }) {
  const router = useRouter();
  const { entries, loaded, setFavorite } = useHistory();
  // The chat: the URL's own id until history says the URL names a later turn of another chat.
  const chatId = chatIdOf(entries, id) ?? id;
  /** Turns sent during this visit, shown before history records them. */
  const [added, setAdded] = useState<readonly string[]>([]);
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [inject, setInject] = useState<Injected | null>(null);
  const capabilities = useCapabilities();
  const scroller = useRef<HTMLDivElement>(null);
  // STORY_039: a star is read from history and written through it; the action row and the viewer share it.
  const starred = useMemo(() => new Set(entries.filter((e) => e.favoritedAt !== undefined).map((e) => e.id)), [entries]);
  const onStar = useCallback(
    (jobId: string, on: boolean) => {
      void setFavorite(jobId, on);
    },
    [setFavorite],
  );
  // STORY_038: a click on any finished image of the chat opens the viewer over the chat's images.
  const viewer = useImageViewer({
    isStarred: (jobId) => starred.has(jobId),
    toggle: (jobId) => {
      onStar(jobId, !starred.has(jobId));
    },
  });

  const ids = useMemo(() => {
    const recorded = loaded ? turnsOf(entries, chatId).map((e) => e.id) : [];
    const base = recorded.length > 0 ? recorded : [id];
    return [...new Set([...base, ...added])].filter((jobId) => !deleted.has(jobId));
  }, [entries, loaded, chatId, id, added, deleted]);

  // Decide-once state lives in refs (CLAUDE.md §6b): whether the page has opened, how many turns it has shown since,
  // and the turn still to be scrolled to. A card draws nothing until its job's status arrives, so the scroll waits for
  // that turn to appear.
  const opened = useRef(false);
  const shownCount = useRef(0);
  const scrollTarget = useRef<{ readonly id: string; readonly outline: boolean } | null>(null);
  const tryScroll = useCallback((): void => {
    const target = scrollTarget.current;
    if (!target || !scroller.current) return;
    const card = Array.from(scroller.current.querySelectorAll<HTMLElement>('[data-testid="generation"]')).find((c) => c.dataset["jobId"] === target.id);
    if (!card) return;
    scrollTarget.current = null;
    if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "end" });
    if (target.outline) setHighlight(target.id);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const watch = new MutationObserver(tryScroll);
    watch.observe(el, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
    };
  }, [tryScroll]);

  const append = useCallback<OnCreated>((more) => {
    setAdded((prev) => [...prev, ...more]);
  }, []);
  const onEdit = useCallback((jobId: string, url: string) => {
    void fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        setInject({ files: [new File([blob], resultFileName(jobId), { type: blob.type || "image/png" })], nonce: ++nonce });
      });
  }, []);
  // Delete on a card removes that one image (STORY_031): the request first, then the page (CLAUDE.md §4c).
  const onDelete = useCallback(
    (jobId: string) => {
      if (!window.confirm("Delete this image? This cannot be undone.")) return;
      void fetch(`/api/history/${encodeURIComponent(jobId)}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) return;
        const left = ids.filter((other) => other !== jobId);
        setDeleted((prev) => new Set([...prev, jobId]));
        announceHistoryChanged();
        if (left.length === 0) router.push("/");
        else if (jobId === id && id !== chatId) router.replace(`/g/${encodeURIComponent(chatId)}`);
      });
    },
    [ids, id, chatId, router],
  );

  // Opening: scroll to the asked-for turn (outlined) or to the newest, once history has the chat. After that, a turn
  // added by a send scrolls into view; a result loading higher up never moves the page.
  useEffect(() => {
    if (!loaded) return;
    const newest = ids[ids.length - 1];
    if (!opened.current) {
      opened.current = true;
      shownCount.current = ids.length;
      const target = targetOf(id, chatId);
      if (target !== null && ids.includes(target)) scrollTarget.current = { id: target, outline: true };
      else if (newest !== undefined) scrollTarget.current = { id: newest, outline: false };
      tryScroll();
      return;
    }
    if (ids.length <= shownCount.current || newest === undefined) return;
    shownCount.current = ids.length;
    scrollTarget.current = { id: newest, outline: false };
    tryScroll();
  }, [loaded, ids, id, chatId, tryScroll]);

  // The outline goes at the next click or key. Listening from mount means a key pressed just after the outline appears
  // is never missed; clearing a highlight that is already null changes nothing.
  useEffect(() => {
    const clear = (): void => {
      setHighlight(null);
    };
    window.addEventListener("pointerdown", clear);
    window.addEventListener("keydown", clear);
    return () => {
      window.removeEventListener("pointerdown", clear);
      window.removeEventListener("keydown", clear);
    };
  }, []);

  return (
    <div className="clone-chat-page">
      <div className="chat-container clone-chat-scroll" ref={scroller} onClick={viewer.onClick} onKeyDown={viewer.onKeyDown}>
        {ids.map((jobId) => (
          <GenerationCard key={jobId} id={jobId} chat={chatId} labels={capabilities} onCreated={append} onEdit={onEdit} onDelete={onDelete} highlighted={highlight === jobId} favorite={starred.has(jobId)} onStar={onStar} />
        ))}
        <div className="chat-container-bottom" />
      </div>
      <ComposerHost onCreated={append} inject={inject} chat={chatId} />
      <div className="clone-statement">AI-generated content may not be accurate.</div>
      {viewer.viewer}
    </div>
  );
}
