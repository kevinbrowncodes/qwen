"use client";
/**
 * The sidebar's chats (STORY_013; STORY_031: a row per chat, not per image), in the reference's session-list markup: a
 * day label (`.list-folder-chats`) and a row per chat titled by its first prompt, the open one highlighted. Each row's "…" (Chat Menu) offers Delete for the whole chat, or Stop while any turn runs;
 * Delete asks first.
 *
 * STORY_033: the menu's Rename turns the row's title into an input in place (the reference's `chat-item-drag-input`);
 * Enter or leaving it saves, Escape puts the old title back.
 *
 * STORY_032: the sidebar passes today's chats only, so the list is one "Today" group; earlier days are on the History
 * page, which shares this row menu.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TITLE_MAX } from "@/lib/history";
import { chatTitle, deleteChatMessage, renameTo, type ChatSummary } from "@/lib/history-view";
import { Icon } from "../Icon";

export interface HistoryListProps {
  /** Today's chats (STORY_032), newest first. */
  readonly chats: readonly ChatSummary[];
  /** Whether any chat is from an earlier day: then an empty Today says so, rather than "No images yet". */
  readonly hasEarlier?: boolean;
  /** The open chat's id. */
  readonly activeId: string | null;
  readonly iconSet: "qwpcicon" | "appicon";
  readonly onDelete: (chat: ChatSummary) => void;
  readonly onStop: (chat: ChatSummary) => void;
  /** Names the chat, or clears its name with null (STORY_033); only called when the name changed. */
  readonly onRename: (chat: ChatSummary, title: string | null) => void;
  readonly onNavigate?: () => void;
  /** Asks before deleting; injected so tests need no dialog. */
  readonly confirm?: (message: string) => boolean;
}

/** A chat's title as an input (STORY_033), focused with its text selected. Enter or leaving it saves; Escape does not. */
export function RenameInput({ chat, onSave, onDone }: { readonly chat: ChatSummary; readonly onSave: (title: string | null) => void; readonly onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  // Enter or Escape settles it once; the blur that follows (the input leaving the page) must not save again.
  const settled = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (save: boolean): void => {
    if (settled.current) return;
    settled.current = true;
    const next = save ? renameTo(chat, input.current?.value ?? "") : undefined;
    if (next !== undefined) onSave(next);
    onDone();
  };
  return (
    <input
      ref={input}
      type="text"
      className="chat-item-drag-input"
      aria-label="Chat name"
      defaultValue={chatTitle(chat)}
      maxLength={TITLE_MAX}
      onBlur={() => {
        finish(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          finish(e.key === "Enter");
        }
      }}
    />
  );
}

interface MenuItemProps {
  readonly label: string;
  readonly danger?: boolean;
  readonly onChoose: () => void;
}

function MenuItem({ label, danger = false, onChoose }: MenuItemProps) {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      className={`qwen-chat-v2-dropdown-menu-item${danger ? " clone-danger" : ""}`}
      onClick={onChoose}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.click();
      }}
    >
      <span className="qwen-chat-v2-dropdown-menu-item-label">{label}</span>
    </div>
  );
}

interface RowMenuProps {
  readonly chat: ChatSummary;
  readonly iconSet: string;
  readonly onDelete: () => void;
  readonly onStop: () => void;
  readonly onRename: () => void;
  readonly confirm: (m: string) => boolean;
}

/** A chat row's "…" (Chat Menu): Rename (STORY_033), then Stop while a turn runs, otherwise Delete the chat after asking. */
export function RowMenu({ chat, iconSet, onDelete, onStop, onRename, confirm }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  const running = chat.running;
  return (
    <div className={`chat-item-drag-web${open ? " clone-menu-open" : ""}`} ref={root}>
      <div className="qwen-chat-v2-dropdown-menu clone-dropdown">
        <div className="qwen-chat-v2-dropdown-menu-trigger">
          <div className="chat-menu-trigger">
            <button
              type="button"
              aria-label="Chat Menu"
              aria-haspopup="menu"
              aria-expanded={open}
              className="chat-item-drag-web-default-btn"
              onClick={() => {
                setOpen((o) => !o);
              }}
            >
              <Icon id={`${iconSet}-more`} className="chat-item-drag-web-default-btn-icon" />
            </button>
          </div>
        </div>
        {open ? (
          <div role="menu" aria-label="Chat Menu" className="qwen-chat-v2-dropdown-menu-popup clone-row-menu">
            <MenuItem
              label="Rename"
              onChoose={() => {
                setOpen(false);
                onRename();
              }}
            />
            <MenuItem
              label={running ? "Stop" : "Delete"}
              danger={!running}
              onChoose={() => {
                setOpen(false);
                if (running) onStop();
                else if (confirm(deleteChatMessage(chat.count))) onDelete();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HistoryList({ chats, hasEarlier = false, activeId, iconSet, onDelete, onStop, onRename, onNavigate, confirm = (m) => window.confirm(m) }: HistoryListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="session-list-wrapper">
      <div className="session-list">
        <div className="list-folder">
          <div className="folder-content">
            {chats.length === 0 && !hasEarlier ? <div className="list-folder-chats clone-empty-list">No images yet</div> : null}
            {chats.length > 0 || hasEarlier ? (
              <div className="list-folder-pt" role="group" aria-label="Today">
                <div className="list-folder-chats">Today</div>
                {chats.length === 0 ? <div className="list-folder-chats clone-empty-list">No chats yet today</div> : null}
                {chats.map((c) => (
                  <div key={c.id} className="chat-item-drag" data-testid="history-row">
                    {editing === c.id ? (
                      // While renaming, the row is not a link, so a click in the input never opens the chat.
                      <div className="chat-item-drag-link clone-renaming">
                        <div className="chat-item-drag-link-content">
                          <RenameInput
                            chat={c}
                            onSave={(title) => {
                              onRename(c, title);
                            }}
                            onDone={() => {
                              setEditing(null);
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Link href={`/g/${encodeURIComponent(c.id)}`} className={`chat-item-drag-link${c.id === activeId ? " chat-item-drag-active" : ""}`} aria-current={c.id === activeId ? "page" : undefined} onClick={onNavigate}>
                          <div className="chat-item-drag-link-content">
                            <div className="chat-item-drag-link-content-tip-text chat-item-drag-link-content-tip">
                              <span className="chat-item-title-text">{chatTitle(c)}</span>
                              {c.running ? <span className="clone-spinner" aria-label="Generating" /> : null}
                            </div>
                          </div>
                        </Link>
                        <RowMenu
                          chat={c}
                          iconSet={iconSet}
                          confirm={confirm}
                          onDelete={() => {
                            onDelete(c);
                          }}
                          onStop={() => {
                            onStop(c);
                          }}
                          onRename={() => {
                            setEditing(c.id);
                          }}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
