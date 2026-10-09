"use client";
/**
 * The composer (STORY_009 resting, STORY_010 image mode), in the reference's markup. Resting: one row with `+`, the
 * textarea and Send. Image mode: the textarea, then a footer with `+`, the blue "Create Image" pill and the model and
 * aspect-ratio dropdowns (docs/recon/2026-09-26/states/composer-image-mode@1437.json). The state is a pure reducer
 * (lib/composer-state.ts); options survive a reload within the session.
 */
import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { activeRatio, canSend, FALLBACK_CAPABILITIES, initialState, MATCH_REFERENCE, MAX_COUNT, NO_LORA, parseCapabilities, reduce, restore, serialize, shortModelLabel, STORAGE_KEY, type Capabilities, type ComposerState } from "@/lib/composer-state";
import { useFileDrop } from "@/lib/use-file-drop";
import { useNarrow } from "@/lib/use-narrow";
import { Dropdown } from "../Dropdown";
import { DropOverlay } from "./DropOverlay";
import { Icon } from "../Icon";
import { ModeMenu } from "./ModeMenu";
import { ReferenceThumbs } from "./ReferenceThumbs";

const ACCEPT = "image/png,image/jpeg,image/webp";
let nextKey = 0;

/** Files put into the composer from outside (the result's Edit, STORY_012); a new nonce attaches them again. */
export interface Injected {
  readonly files: readonly File[];
  readonly nonce: number;
}

export interface ComposerProps {
  /** Creates the job; resolves true when it was created, so the composer clears (STORY_012). */
  readonly onSubmit?: (state: ComposerState) => Promise<boolean>;
  /** The server's answer to the last submit, shown under the composer. */
  readonly externalError?: string | null;
  /** A submit is on its way: Send waits. Send is never replaced by Stop (STORY_025): each card has its own. */
  readonly busy?: boolean;
  readonly inject?: Injected | null;
}

const COUNTS = Array.from({ length: MAX_COUNT }, (_, i) => i + 1);

const RATIO_ICON = (id: string): string => `qwpcicon-a-${id.replace(":", "by")}AspectRatio`;

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function Composer({ onSubmit, externalError = null, busy = false, inject = null }: ComposerProps) {
  const narrow = useNarrow();
  const iconSet = narrow ? "appicon" : "qwpcicon";
  const [state, dispatch] = useReducer(reduce, FALLBACK_CAPABILITIES, initialState);
  const [caps, setCaps] = useState<Capabilities>(FALLBACK_CAPABILITIES);
  const restored = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Reads each file's first bytes; the reducer checks them as the server will (STORY_011). */
  const attach = useCallback(async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const candidates = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, head: new Uint8Array(await f.slice(0, 16).arrayBuffer()) })));
    dispatch({ type: "attach", items: files.map((file) => ({ key: `ref-${String(++nextKey)}`, file })), candidates });
  }, []);
  // A drop or paste anywhere on the page attaches through the same path as + (STORY_018).
  const dragging = useFileDrop(
    useCallback((files: File[]) => {
      void attach(files);
    }, [attach]),
    textarea,
  );

  // Edit on a result puts that image into the composer as a reference, once per nonce.
  const injectedNonce = useRef<number | null>(null);
  useEffect(() => {
    if (inject === null || injectedNonce.current === inject.nonce) return;
    injectedNonce.current = inject.nonce;
    void attach(inject.files);
    textarea.current?.focus();
  }, [inject, attach]);

  // Restore the session's options once, then keep them written (decide-once state lives in a ref: CLAUDE.md §6b).
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const back = restore(readStored(), initialState(FALLBACK_CAPABILITIES));
      if (back.mode === "image") dispatch({ type: "enterImage" });
      dispatch({ type: "setModel", model: back.model });
      dispatch({ type: "setRatio", ratio: back.ratio });
      dispatch({ type: "setEditRatio", ratio: back.editRatio });
      dispatch({ type: "setLora", lora: back.lora });
      dispatch({ type: "setCount", count: back.count });
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
  const sendable = canSend(state) && !busy;
  const send = (): void => {
    if (!sendable || !onSubmit) return;
    void onSubmit(state).then((sent) => {
      if (sent) dispatch({ type: "sent" });
    });
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
  // How many images one send queues (STORY_025; ours: the reference has no count). Arrowless on the phone, like the
  // add-on's icon, with the same 44px touch area.
  const countDropdown = (
    <Dropdown
      label="Number of images"
      className="clone-dropdown-icon-only"
      display={<span>{`×${String(state.count)}`}</span>}
      items={COUNTS.map((n) => ({ id: String(n), label: n === 1 ? "1 image" : `${String(n)} images` }))}
      selected={String(state.count)}
      onSelect={(id) => {
        dispatch({ type: "setCount", count: Number(id) });
      }}
      placement={placement}
    />
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
  return (
    <div className="message-input">
      {dragging ? <DropOverlay /> : null}
      <div className="message-input-wrapper message-input-wrapper-position">
        <div
          className={`message-input-container${state.mode === "image" ? " clone-image-mode" : ""}`}
          data-testid="composer"
          data-mode={state.mode}
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
              {/* On the phone the count sits beside the text: the footer row has no room left (STORY_025). */}
              {narrow ? (
                <div className="clone-text-row">
                  {input}
                  {countDropdown}
                </div>
              ) : (
                input
              )}
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
                    {/* Always shown in image mode (STORY_017); with a reference, "Match reference" leads and is the default. */}
                    <Dropdown
                      label="Aspect ratio"
                      display={<span>{activeRatio(state) === MATCH_REFERENCE ? "Match reference" : activeRatio(state)}</span>}
                      items={[
                        ...(state.references.length > 0 ? [{ id: MATCH_REFERENCE, label: "Match reference", icon: "qwpcicon-aiPicture" }] : []),
                        ...caps.ratios.map((r) => ({ id: r.id, label: r.id, icon: RATIO_ICON(r.id) })),
                      ]}
                      selected={activeRatio(state)}
                      onSelect={(id) => {
                        dispatch(state.references.length > 0 ? { type: "setEditRatio", ratio: id } : { type: "setRatio", ratio: id });
                      }}
                      placement={placement}
                    />
                    {/* Community add-ons (STORY_019), only when the server has some; narrow shows the icon alone. */}
                    {caps.loras.length > 0 ? (
                      <Dropdown
                        label="Add-on"
                        className="clone-dropdown-icon-only"
                        display={narrow ? <Icon id="appicon-toolbox" /> : <span>{caps.loras.find((l) => l.id === state.lora)?.label ?? "None"}</span>}
                        items={[{ id: NO_LORA, label: "None" }, ...caps.loras.map((l) => ({ id: l.id, label: l.label }))]}
                        selected={state.lora}
                        onSelect={(id) => {
                          dispatch({ type: "setLora", lora: id });
                        }}
                        placement={placement}
                      />
                    ) : null}
                    {narrow ? null : countDropdown}
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
        {state.error ?? externalError ? (
          <div className="clone-composer-error" role="alert">
            {state.error ?? externalError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
