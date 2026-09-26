"use client";
/**
 * The composer (STORY_009 resting, STORY_010 image mode), in the reference's markup. Resting: one row with `+`, the
 * textarea and Send. Image mode: the textarea, then a footer with `+`, the blue "Create Image" pill and the model and
 * aspect-ratio dropdowns (docs/recon/2026-09-26/states/composer-image-mode@1437.json). The state is a pure reducer
 * (lib/composer-state.ts); options survive a reload within the session.
 */
import { useEffect, useReducer, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { canSend, FALLBACK_CAPABILITIES, initialState, parseCapabilities, reduce, restore, serialize, shortModelLabel, showsRatio, STORAGE_KEY, type Capabilities, type ComposerState } from "@/lib/composer-state";
import { useNarrow } from "@/lib/use-narrow";
import { Dropdown } from "../Dropdown";
import { Icon } from "../Icon";
import { ModeMenu } from "./ModeMenu";
import { ReferenceThumbs } from "./ReferenceThumbs";

const ACCEPT = "image/png,image/jpeg,image/webp";
let nextKey = 0;

export interface ComposerProps {
  /** Called with the composer's state when the owner sends (STORY_012 creates the job). */
  readonly onSubmit?: (state: ComposerState) => void;
}

const RATIO_ICON = (id: string): string => `qwpcicon-a-${id.replace(":", "by")}AspectRatio`;

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function Composer({ onSubmit }: ComposerProps) {
  const narrow = useNarrow();
  const iconSet = narrow ? "appicon" : "qwpcicon";
  const [state, dispatch] = useReducer(reduce, FALLBACK_CAPABILITIES, initialState);
  const [caps, setCaps] = useState<Capabilities>(FALLBACK_CAPABILITIES);
  const restored = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Reads each file's first bytes; the reducer checks them as the server will (STORY_011). */
  const attach = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const candidates = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, head: new Uint8Array(await f.slice(0, 16).arrayBuffer()) })));
    dispatch({ type: "attach", items: files.map((file) => ({ key: `ref-${String(++nextKey)}`, file })), candidates });
  };

  // Restore the session's options once, then keep them written (decide-once state lives in a ref: CLAUDE.md §6b).
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const back = restore(readStored(), initialState(FALLBACK_CAPABILITIES));
      if (back.mode === "image") dispatch({ type: "enterImage" });
      dispatch({ type: "setModel", model: back.model });
      dispatch({ type: "setRatio", ratio: back.ratio });
      return;
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, serialize(state));
    } catch {
      // private mode: options just do not survive a reload
    }
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/capabilities", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const parsed = parseCapabilities(body);
        if (parsed) {
          setCaps(parsed);
          dispatch({ type: "capabilities", capabilities: parsed });
        }
      })
      .catch(() => {
        // the server is down: keep the contract's fallback; submitting shows the server's answer (STORY_012)
      });
    return () => {
      controller.abort();
    };
  }, []);

  const model = caps.models.find((m) => m.id === state.model) ?? caps.models[0];
  const sendable = canSend(state);
  const send = (): void => {
    if (!sendable) return;
    onSubmit?.(state);
    dispatch({ type: "sent" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const placement = narrow ? "top" : "bottom";

  const modeMenu = (
    <ModeMenu
      iconSet={iconSet}
      placement={placement}
      onCreateImage={() => {
        dispatch({ type: "enterImage" });
        textarea.current?.focus();
      }}
      onUpload={() => {
        fileInput.current?.click();
      }}
    />
  );
  const sendButton = (
    <div className="message-input-right-button-send">
      <div className="chat-prompt-send-button">
        <button type="button" className={`send-button${sendable ? "" : " disabled"}`} aria-label="Send" disabled={!sendable} onClick={send}>
          <Icon id="qwpcicon-sendChat" className="icon-send" />
        </button>
      </div>
    </div>
  );
  const input = (
    <textarea
      ref={textarea}
      rows={1}
      className="message-input-textarea"
      placeholder="Ask Qwen"
      autoComplete="off"
      aria-label="Prompt"
      value={state.text}
      onChange={(e) => {
        dispatch({ type: "setText", text: e.target.value });
      }}
      onKeyDown={onKeyDown}
      onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = [...e.clipboardData.files];
        if (files.length > 0) {
          e.preventDefault();
          void attach(files);
        }
      }}
    />
  );
  const picker = (
    <input
      ref={fileInput}
      id="filesUpload"
      type="file"
      multiple
      accept={ACCEPT}
      aria-label="Upload files"
      tabIndex={-1}
      hidden
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        void attach(files);
      }}
    />
  );
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    const files = [...e.dataTransfer.files];
    if (files.length === 0) return;
    e.preventDefault();
    void attach(files);
  };

  return (
    <div className="message-input">
      <div className="message-input-wrapper message-input-wrapper-position">
        <div
          className={`message-input-container${state.mode === "image" ? " clone-image-mode" : ""}`}
          data-testid="composer"
          data-mode={state.mode}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={onDrop}
        >
          {picker}
          {state.mode === "image" ? (
            <div>
              <ReferenceThumbs
                items={state.references}
                onRemove={(key) => {
                  dispatch({ type: "removeReference", key });
                }}
              />
              {input}
              <div className="message-input-column-footer">
                <div className="mode-select">
                  {modeMenu}
                  <div className="mode-select-current-mode" data-testid="image-pill">
                    <Icon id={`${iconSet}-aiPicture`} className="mode-select-current-mode-icon" />
                    {narrow ? null : <span>Create Image</span>}
                    <button
                      type="button"
                      className="clone-icon-button mode-select-current-mode-close"
                      aria-label="Leave Create Image"
                      onClick={() => {
                        dispatch({ type: "leaveImage" });
                      }}
                    >
                      <Icon id="qwpcicon-close2" />
                    </button>
                  </div>
                  <div className="message-input-column-footer-submode">
                    <Dropdown
                      label="Image model"
                      display={<span>{model ? (narrow ? shortModelLabel(model.label) : model.label) : ""}</span>}
                      items={caps.models.map((m) => ({ id: m.id, label: m.label }))}
                      selected={state.model}
                      onSelect={(id) => {
                        dispatch({ type: "setModel", model: id });
                      }}
                      placement={placement}
                    />
                    {showsRatio(state) ? (
                      <Dropdown
                        label="Aspect ratio"
                        display={<span>{state.ratio}</span>}
                        items={caps.ratios.map((r) => ({ id: r.id, label: r.id, icon: RATIO_ICON(r.id) }))}
                        selected={state.ratio}
                        onSelect={(id) => {
                          dispatch({ type: "setRatio", ratio: id });
                        }}
                        placement={placement}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="message-input-right-button">{sendButton}</div>
              </div>
            </div>
          ) : (
            <div>
              <div className="message-input-container-area">
                <div className="mode-select">{modeMenu}</div>
                {input}
                <div className="message-input-right-button">{sendButton}</div>
              </div>
            </div>
          )}
        </div>
        {state.error ? (
          <div className="clone-composer-error" role="alert">
            {state.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
