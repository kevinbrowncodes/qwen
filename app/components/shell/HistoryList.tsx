"use client";
/**
 * Every generation in the sidebar (STORY_013), in the reference's session-list markup: an "All images" folder, day
 * labels (`.list-folder-chats`), and a row per generation titled by its prompt, the open one highlighted. Each row's
 * "…" (Chat Menu) offers Delete, or Stop while it runs; Delete asks first.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/history";
import { groupByDay, isRunning, titleOf } from "@/lib/history-view";
import { Icon } from "../Icon";

export interface HistoryListProps {
  readonly entries: readonly HistoryEntry[];
  readonly activeId: string | null;
  readonly now: Date;
  readonly iconSet: "qwpcicon" | "appicon";
  readonly onDelete: (id: string) => void;
  readonly onStop: (id: string) => void;
  readonly onNavigate?: () => void;
  /** Asks before deleting; injected so tests need no dialog. */
  readonly confirm?: (message: string) => boolean;
}

function RowMenu({ entry, iconSet, onDelete, onStop, confirm }: { readonly entry: HistoryEntry; readonly iconSet: string; readonly onDelete: () => void; readonly onStop: () => void; readonly confirm: (m: string) => boolean }) {
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
  const running = isRunning(entry);
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
                else if (confirm("Delete this image? This cannot be undone.")) onDelete();
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

export function HistoryList({ entries, activeId, now, iconSet, onDelete, onStop, onNavigate, confirm = (m) => window.confirm(m) }: HistoryListProps) {
  const groups = groupByDay(entries, now);
  return (
    <div className="session-list-wrapper">
      <div className="session-list">
        <div className="list-folder">
          <div className="folder-button">
            <div className="folder-name">All images</div>
          </div>
          <div className="folder-content">
            {groups.length === 0 ? <div className="list-folder-chats clone-empty-list">No images yet</div> : null}
            {groups.map((g) => (
              <div key={g.label} className="list-folder-pt" role="group" aria-label={g.label}>
                <div className="list-folder-chats">{g.label}</div>
                {g.entries.map((e) => (
                  <div key={e.id} className="chat-item-drag" data-testid="history-row">
                    <Link href={`/g/${encodeURIComponent(e.id)}`} className={`chat-item-drag-link${e.id === activeId ? " chat-item-drag-active" : ""}`} aria-current={e.id === activeId ? "page" : undefined} onClick={onNavigate}>
                      <div className="chat-item-drag-link-content">
                        <div className="chat-item-drag-link-content-tip-text chat-item-drag-link-content-tip">
                          <span className="chat-item-title-text">{titleOf(e.prompt)}</span>
                          {isRunning(e) ? <span className="clone-spinner" aria-label="Generating" /> : null}
                        </div>
                      </div>
                    </Link>
                    <RowMenu
                      entry={e}
                      iconSet={iconSet}
                      confirm={confirm}
                      onDelete={() => {
                        onDelete(e.id);
                      }}
                      onStop={() => {
                        onStop(e.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
