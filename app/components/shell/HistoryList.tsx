"use client";
/**
 * The sidebar's chats (STORY_013; STORY_031: a row per chat, not per image), in the reference's session-list markup: a
 * day label (`.list-folder-chats`) and a row per chat titled by its first prompt, the open one highlighted. Each row's "…" (Chat Menu) offers Delete for the whole chat, or Stop while any turn runs;
 * Delete asks first.
 *
 * STORY_032: the sidebar passes today's chats only, so the list is one "Today" group; earlier days are on the History
 * page, which shares this row menu.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteChatMessage, titleOf, type ChatSummary } from "@/lib/history-view";
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
  readonly onNavigate?: () => void;
  /** Asks before deleting; injected so tests need no dialog. */
  readonly confirm?: (message: string) => boolean;
}

/** A chat row's "…" (Chat Menu): Stop while a turn runs, otherwise Delete the chat after asking. */
export function RowMenu({ chat, iconSet, onDelete, onStop, confirm }: { readonly chat: ChatSummary; readonly iconSet: string; readonly onDelete: () => void; readonly onStop: () => void; readonly confirm: (m: string) => boolean }) {
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
            <div
              role="menuitem"
              tabIndex={0}
              className={`qwen-chat-v2-dropdown-menu-item${running ? "" : " clone-danger"}`}
              onClick={() => {
                setOpen(false);
                if (running) onStop();
                else if (confirm(deleteChatMessage(chat.count))) onDelete();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.click();
              }}
            >
              <span className="qwen-chat-v2-dropdown-menu-item-label">{running ? "Stop" : "Delete"}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HistoryList({ chats, hasEarlier = false, activeId, iconSet, onDelete, onStop, onNavigate, confirm = (m) => window.confirm(m) }: HistoryListProps) {
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
                    <Link href={`/g/${encodeURIComponent(c.id)}`} className={`chat-item-drag-link${c.id === activeId ? " chat-item-drag-active" : ""}`} aria-current={c.id === activeId ? "page" : undefined} onClick={onNavigate}>
                      <div className="chat-item-drag-link-content">
                        <div className="chat-item-drag-link-content-tip-text chat-item-drag-link-content-tip">
                          <span className="chat-item-title-text">{titleOf(c.prompt)}</span>
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
                    />
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
