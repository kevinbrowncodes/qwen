"use client";
/**
 * One generation (STORY_012), in the reference's chat markup: the user message (reference thumbnails above a
 * `#293652` bubble), then the reply: the animated `.qwen-media-skeleton` while it runs, the image with its hover
 * controls when done, or a notice when it failed, was moderated or was stopped. Readings: docs/recon/2026-09-26/states/
 * job-generating@1437.json, job-done@1437.json, edit-done@1437.json, job-done@393.json.
 */
import { useEffect, useId, useState } from "react";
import { settingsRows, type Labels } from "@/lib/generation-settings";
import { noticeFor, skeletonSize, statusLine } from "@/lib/generation-view";
import type { JobStatusResponse } from "@/lib/job-api";
import { useNarrow } from "@/lib/use-narrow";
import { Icon } from "../Icon";
import { SettingsPanel } from "./SettingsPanel";

const TRACKS = ["blue", "lilac", "peach", "rose", "cyan"] as const;

export interface GenerationViewProps {
  /** This card's job (STORY_025: a page holds several). */
  readonly id: string;
  readonly job: JobStatusResponse | null;
  readonly prompt: string;
  readonly ratio: string | null;
  readonly referenceFiles: readonly File[];
  readonly referenceCount: number;
  readonly problem: string | null;
  readonly onEdit: (resultUrl: string) => void;
  /** Absent when the request cannot be sent again (an edit whose files this page no longer holds). */
  readonly onRegenerate?: () => void;
  /** The model and add-on labels for the Info panel (STORY_024). */
  readonly labels: Labels;
  /** "Same seed again" (STORY_024); absent exactly when Regenerate is. */
  readonly onSameSeed?: () => void;
  /** Cancels this card's job (STORY_025: Stop moved from the composer to each queued or running card). */
  readonly onStop?: () => void;
}

function ReferenceTile({ file }: { readonly file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL must be made and revoked in the same effect
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [file]);
  return (
    <div className="user-image-item clone-user-image">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
      {url ? <img src={url} alt={file.name} /> : null}
    </div>
  );
}

function Skeleton({ ratio, status, narrow, onStop }: { readonly ratio: string | null; readonly status: string; readonly narrow: boolean; readonly onStop?: (() => void) | undefined }) {
  const size = skeletonSize(ratio, narrow ? 300 : 400);
  const line = statusLine(status);
  const iconSet = narrow ? "appicon" : "qwpcicon";
  return (
    <div className="clone-generating" data-testid="generating">
      <div className="qwen-image" style={{ width: size.width, height: size.height }}>
        <div className="qwen-image-generating">
          <div className="qwen-media-skeleton">
            <div className="qwen-media-skeleton-field">
              {TRACKS.map((c) => (
                <div key={c} className={`qwen-media-skeleton-track track-${c}`}>
                  <div className={`qwen-media-skeleton-blob blob-${c}`} />
                </div>
              ))}
              <div className="qwen-media-skeleton-glow" />
              <div className="qwen-media-skeleton-grain" />
            </div>
            <Icon id="qwpcicon-aiPicture" className="qwen-media-skeleton-icon" />
          </div>
        </div>
      </div>
      {line || onStop ? (
        <div className="clone-card-status" style={{ width: size.width }}>
          <span className="clone-status-text">{line}</span>
          {onStop ? (
            <button type="button" className="clone-icon-button clone-action clone-card-stop" aria-label="Stop" onClick={onStop}>
              <Icon id={`${iconSet}-stop-fill`} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GenerationView({ id, job, prompt, ratio, referenceFiles, referenceCount, problem, onEdit, onRegenerate, labels, onSameSeed, onStop }: GenerationViewProps) {
  const narrow = useNarrow();
  const [hover, setHover] = useState(false);
  // Closed by default, and not remembered (STORY_024).
  const [info, setInfo] = useState(false);
  const panelId = useId();
  const status = job?.status ?? "queued";
  const notice = job ? noticeFor(job) : null;
  const result = job?.status === "done" ? job.result : undefined;
  const iconSet = narrow ? "appicon" : "qwpcicon";
  const infoButton = (
    <button
      type="button"
      className="clone-icon-button clone-action"
      aria-label="Info"
      aria-expanded={info}
      aria-controls={info ? panelId : undefined}
      onClick={() => {
        setInfo((v) => !v);
      }}
    >
      <Icon id={`${iconSet}-info`} />
    </button>
  );
  const panel = info && job ? <SettingsPanel id={panelId} rows={settingsRows(job, labels)} onSameSeed={onSameSeed} /> : null;

  return (
    <div className="clone-messages" data-testid="generation" data-job-id={id}>
      <div className="qwen-chat-message qwen-chat-message-user">
        <div className="chat-user-message-container">
          {referenceFiles.length > 0 || referenceCount > 0 ? (
            <div className="user-image-list">
              <div className="user-image-list-row">
                {referenceFiles.length > 0
                  ? referenceFiles.map((f, i) => <ReferenceTile key={`${f.name}-${String(i)}`} file={f} />)
                  : Array.from({ length: referenceCount }, (_, i) => (
                      <div key={i} className="user-image-item clone-user-image clone-user-image-missing" aria-label="Reference image">
                        <Icon id="qwpcicon-aiPicture" />
                      </div>
                    ))}
              </div>
            </div>
          ) : null}
          <div className="chat-user-message-wrapper">
            <div className="chat-user-message" data-testid="user-bubble">
              <div className="user-message-content">{prompt}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="qwen-chat-message qwen-chat-message-assistant">
        {problem && !job ? <div className="clone-generation-notice" role="status">{problem}</div> : null}
        {result ? (
          <>
            <div className="chat-response-media-render">
              <div
                className={`image-tool-container${hover && !narrow ? " image-tool-container-hover" : ""}`}
                onMouseEnter={() => {
                  setHover(true);
                }}
                onMouseLeave={() => {
                  setHover(false);
                }}
              >
                <div className="qwen-image clone-result">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the result streams from our own route; it is never resized */}
                  <img className="ant-image-img qwen-image" src={result.url} alt={prompt} data-testid="result-image" />
                </div>
                {narrow ? null : (
                  <>
                    <div className="control-card-top">
                      <a className="upper-right-corner-item" href={`${result.url}?download=1`} download aria-label="Download">
                        <Icon id="qwpcicon-download" />
                      </a>
                    </div>
                    <div className="lower-center-container control-card-bottom">
                      <button
                        type="button"
                        className="lower-center-item clone-icon-button"
                        onClick={() => {
                          onEdit(result.url);
                        }}
                      >
                        <Icon id="qwpcicon-edit" />
                        <span className="lower-center-item-label">Edit</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="response-message-footer-actions clone-actions">
              {narrow ? (
                <>
                  <button
                    type="button"
                    className="clone-icon-button clone-action"
                    aria-label="Edit"
                    onClick={() => {
                      onEdit(result.url);
                    }}
                  >
                    <Icon id={`${iconSet}-edit`} />
                  </button>
                  <a className="clone-action" href={`${result.url}?download=1`} download aria-label="Download">
                    <Icon id={`${iconSet}-download`} />
                  </a>
                </>
              ) : null}
              {infoButton}
              {onRegenerate ? (
                <button type="button" className="clone-icon-button clone-action" aria-label="Regenerate" onClick={onRegenerate}>
                  <Icon id={`${iconSet}-refresh`} />
                </button>
              ) : null}
            </div>
            {panel}
          </>
        ) : notice ? (
          <>
            <div className="clone-generation-notice" role="status" data-testid="notice">
              <span>
                <Icon id={status === "cancelled" ? "qwpcicon-stop-fill" : "qwpcicon-errorPicture"} /> {notice}
              </span>
              <span className="clone-notice-actions">
                {infoButton}
                {onRegenerate ? (
                  <button type="button" className="clone-icon-button clone-notice-action" onClick={onRegenerate}>
                    <Icon id={`${iconSet}-refresh`} /> {status === "cancelled" ? "Regenerate" : "Try again"}
                  </button>
                ) : null}
              </span>
            </div>
            {panel}
          </>
        ) : job || !problem ? (
          <Skeleton ratio={ratio} status={status} narrow={narrow} onStop={status === "queued" || status === "running" ? onStop : undefined} />
        ) : null}
      </div>
    </div>
  );
}
