"use client";
/**
 * History at /history (STORY_032, ours: the reference lists every chat in its sidebar): one earlier day at a time,
 * ‹ and › stepping between the days that have chats, a date picker for any day, and a row per chat with its newest
 * image, title, image count and the time of its newest turn. The day is in the URL (`?day=YYYY-MM-DD`), so a reload
 * or Back keeps it. Today's chats are in the sidebar, so the page never shows today.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { chatTitle, chatsOf, chatsOn, dayKey, imageCount, longDate, pastDays, resultUrl, shortDate, stepDay, timeOf, yesterdayOf } from "@/lib/history-view";
import { useHistory } from "@/lib/use-history";
import { useNarrow } from "@/lib/use-narrow";
import { useNow } from "@/lib/use-now";
import { Icon } from "../Icon";
import { RenameInput, RowMenu } from "../shell/HistoryList";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function HistoryDays({ confirm = (m: string) => window.confirm(m) }: { readonly confirm?: (message: string) => boolean }) {
  const { entries, loaded, removeChat, renameChat, stopAll } = useHistory();
  const router = useRouter();
  const params = useSearchParams();
  const narrow = useNarrow();
  const now = useNow();
  const picker = useRef<HTMLInputElement>(null);
  const iconSet = narrow ? "appicon" : "qwpcicon";

  const chats = chatsOf(entries);
  const days = pastDays(chats, now);
  const asked = params.get("day") ?? "";
  // A day in the URL counts when it is before today; otherwise the most recent earlier day with chats.
  const day = DAY.test(asked) && asked < dayKey(now) ? asked : (days[0] ?? null);
  const go = (to: string): void => {
    router.push(`/history?day=${to}`);
  };

  if (!loaded) return <div className="clone-history" />;
  return (
    <div className="clone-history">
      <p className="clone-history-sub">Chats from before today</p>
      {day === null ? (
        <p className="clone-history-empty">No earlier chats.</p>
      ) : (
        <>
          <DayNav
            label={narrow ? shortDate(day, now) : longDate(day, now)}
            older={stepDay(days, day, "older")}
            newer={stepDay(days, day, "newer")}
            iconSet={iconSet}
            onGo={go}
            onPick={() => {
              try {
                picker.current?.showPicker();
              } catch {
                // a browser without showPicker: the date input over the button still opens on a click
              }
            }}
          >
            <input
              ref={picker}
              type="date"
              className="clone-history-date"
              aria-label="Pick a day"
              value={day}
              min={days[days.length - 1]}
              max={yesterdayOf(now)}
              onChange={(e) => {
                if (DAY.test(e.target.value)) go(e.target.value);
              }}
            />
          </DayNav>
          <DayRows
            chats={chatsOn(chats, day)}
            iconSet={iconSet}
            confirm={confirm}
            onDelete={(id) => void removeChat(id)}
            onStop={(ids) => void stopAll(ids)}
            onRename={(id, title) => void renameChat(id, title)}
          />
        </>
      )}
    </div>
  );
}

interface DayNavProps {
  readonly label: string;
  readonly older: string | null;
  readonly newer: string | null;
  readonly iconSet: string;
  readonly onGo: (day: string) => void;
  readonly onPick: () => void;
  readonly children: React.ReactNode;
}

/** ‹ the day › and the date picker; an arrow with no day that way is disabled. */
function DayNav({ label, older, newer, iconSet, onGo, onPick, children }: DayNavProps) {
  return (
    <div className="clone-history-nav">
      <button type="button" className="clone-icon-button clone-history-step" aria-label="Earlier day" disabled={older === null} onClick={() => { if (older !== null) onGo(older); }}>
        <Icon id={`${iconSet}-left`} />
      </button>
      <h2 className="clone-history-day">{label}</h2>
      <button type="button" className="clone-icon-button clone-history-step" aria-label="Later day" disabled={newer === null} onClick={() => { if (newer !== null) onGo(newer); }}>
        <Icon id={`${iconSet}-right`} />
      </button>
      <span className="clone-history-pick">
        <button type="button" className="clone-icon-button clone-history-step" aria-label="Choose a day" onClick={onPick}>
          <Icon id="appicon-date" />
        </button>
        {children}
      </span>
    </div>
  );
}

interface DayRowsProps {
  readonly chats: ReturnType<typeof chatsOn>;
  readonly iconSet: "qwpcicon" | "appicon";
  readonly confirm: (message: string) => boolean;
  readonly onDelete: (chatId: string) => void;
  readonly onStop: (ids: readonly string[]) => void;
  readonly onRename: (chatId: string, title: string | null) => void;
}

/** A day's chats, newest first: the newest image, the title, the count and the time of the newest turn. */
function DayRows({ chats, iconSet, confirm, onDelete, onStop, onRename }: DayRowsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  if (chats.length === 0) return <p className="clone-history-empty">No chats on this day.</p>;
  return (
    <ul className="clone-history-rows">
      {chats.map((c) => {
        const renaming = editing === c.id;
        const content = (
          <>
            <span className="clone-history-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- a result from our own route */}
              {c.thumbId === null ? null : <img src={resultUrl(c.thumbId)} alt="" />}
            </span>
            <span className="clone-history-text">
              {renaming ? (
                <RenameInput
                  chat={c}
                  onSave={(title) => {
                    onRename(c.id, title);
                  }}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="clone-history-title">{chatTitle(c)}</span>
              )}
              <span className="clone-history-meta">last {timeOf(c.newestAt)}</span>
            </span>
            <span className="clone-history-count">{imageCount(c.count)}</span>
          </>
        );
        return (
          <li key={c.id} className="clone-history-row chat-item-drag" data-testid="history-day-row">
            {/* While renaming (STORY_033), the row is not a link, so a click in the input never opens the chat. */}
            {renaming ? (
              <div className="clone-history-link">{content}</div>
            ) : (
              <Link href={`/g/${encodeURIComponent(c.id)}`} className="clone-history-link">
                {content}
              </Link>
            )}
            {renaming ? null : (
              <RowMenu
                chat={c}
                iconSet={iconSet}
                confirm={confirm}
                onDelete={() => {
                  onDelete(c.id);
                }}
                onStop={() => {
                  onStop(c.runningIds);
                }}
                onRename={() => {
                  setEditing(c.id);
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
