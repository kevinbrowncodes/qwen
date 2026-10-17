/**
 * How history is shown (STORY_013), pure: day groups for the sidebar (Today, Yesterday, then dates), a one-line
 * title, the finished images for My Library, and the two newest for the sidebar's thumbnails.
 */
import type { HistoryEntry } from "./history";

export interface DayGroup {
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
}

/** A day as `YYYY-MM-DD` in the viewer's local time. */
export function dayKey(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The label for a day in the viewer's local time. `now` is injected so tests derive dates from the clock. */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(d);
  if (key === today) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** Groups entries (already newest first) by day, keeping their order. */
export function groupByDay(entries: readonly HistoryEntry[], now: Date): DayGroup[] {
  const groups: Array<{ label: string; entries: HistoryEntry[] }> = [];
  for (const e of entries) {
    const label = dayLabel(e.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(e);
    else groups.push({ label, entries: [e] });
  }
  return groups;
}

/** The prompt's first line, trimmed; the sidebar clips it with an ellipsis. */
export function titleOf(prompt: string): string {
  const first = prompt.split("\n").map((l) => l.trim()).find((l) => l !== "");
  return first ?? "Untitled image";
}

export function finished(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return entries.filter((e) => e.status === "done" && e.result !== undefined);
}

export function latestFinished(entries: readonly HistoryEntry[], n = 2): HistoryEntry[] {
  return finished(entries).slice(0, n);
}

export function isRunning(e: Pick<HistoryEntry, "status">): boolean {
  return e.status === "queued" || e.status === "running";
}

export function resultUrl(id: string): string {
  return `/api/jobs/${encodeURIComponent(id)}/result`;
}

export interface ChatDayGroup {
  readonly label: string;
  readonly chats: readonly ChatSummary[];
}

/** The sidebar's chats (STORY_031), already newest-activity first, grouped by the day of each chat's newest turn. */
export function groupChatsByDay(chats: readonly ChatSummary[], now: Date): ChatDayGroup[] {
  const groups: Array<{ label: string; chats: ChatSummary[] }> = [];
  for (const c of chats) {
    const label = dayLabel(c.newestAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.chats.push(c);
    else groups.push({ label, chats: [c] });
  }
  return groups;
}

/** Where an image opens (STORY_031): its chat, at that image's turn. */
export function turnHref(e: Pick<HistoryEntry, "id" | "chatId">): string {
  return `/g/${encodeURIComponent(e.chatId)}#${encodeURIComponent(e.id)}`;
}

/** The sidebar's question before a chat is deleted. */
export function deleteChatMessage(count: number): string {
  return count === 1 ? "Delete this chat and its image? This cannot be undone." : `Delete this chat and its ${String(count)} images? This cannot be undone.`;
}

/** One row of the sidebar (STORY_031): a chat, titled by its first remaining turn and dated by its newest. */
export interface ChatSummary {
  readonly id: string;
  /** The first remaining turn's prompt. */
  readonly prompt: string;
  /** When the newest turn was created: the sidebar orders and groups chats by it. */
  readonly newestAt: string;
  readonly count: number;
  readonly running: boolean;
  /** The chat's turns that are still queued or running, for the row's Stop. */
  readonly runningIds: readonly string[];
  /** The newest finished image, for a thumbnail (STORY_032); null when no turn has finished. */
  readonly thumbId: string | null;
}

/**
 * A chat's turns, oldest first. `entries` are newest first, as `parseEntries` and `addEntry` keep them, so this is
 * their reverse: turns created in the same millisecond come out in the order they were added (BUG_005).
 */
export function turnsOf(entries: readonly HistoryEntry[], chatId: string): HistoryEntry[] {
  return entries.filter((e) => e.chatId === chatId).reverse();
}

/** The chat a job belongs to, or null for an unknown job. */
export function chatIdOf(entries: readonly HistoryEntry[], jobId: string): string | null {
  return entries.find((e) => e.id === jobId)?.chatId ?? null;
}

/** One summary per chat, the chat with the newest turn first (a chat just added to moves to the top). */
export function chatsOf(entries: readonly HistoryEntry[]): ChatSummary[] {
  const order: string[] = [];
  const turns = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const list = turns.get(e.chatId);
    if (list) list.push(e);
    else {
      turns.set(e.chatId, [e]);
      order.push(e.chatId);
    }
  }
  // `entries` are newest first, so each chat's first-seen entry is its newest turn and `order` is newest activity first.
  return order.map((id) => {
    const list = turns.get(id) ?? [];
    const newest = list[0];
    const first = list[list.length - 1];
    const runningIds = list.filter(isRunning).map((e) => e.id);
    const thumbId = list.find((e) => e.status === "done" && e.result !== undefined)?.id ?? null;
    return { id, prompt: first?.prompt ?? "", newestAt: newest?.createdAt ?? "", count: list.length, running: runningIds.length > 0, runningIds, thumbId };
  });
}

// ---- Today and earlier days (STORY_032): a chat belongs to the local calendar day of its newest turn. ----

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local day of an ISO time, or null for a time that does not parse. */
export function dayOf(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/** A `YYYY-MM-DD` key as local midnight, or null for anything else. */
export function parseDay(key: string): Date | null {
  if (!DAY.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return null;
  const date = new Date(y, m - 1, d);
  return dayKey(date) === key ? date : null;
}

/** The chats whose newest turn is today: the sidebar's list. */
export function todaysChats(chats: readonly ChatSummary[], now: Date): ChatSummary[] {
  const today = dayKey(now);
  return chats.filter((c) => dayOf(c.newestAt) === today);
}

/** The days before today that have chats, newest first. */
export function pastDays(chats: readonly ChatSummary[], now: Date): string[] {
  const today = dayKey(now);
  const days = new Set<string>();
  for (const c of chats) {
    const day = dayOf(c.newestAt);
    if (day !== null && day < today) days.add(day);
  }
  return [...days].sort().reverse();
}

/** A day's chats, newest first (chats are kept newest first). */
export function chatsOn(chats: readonly ChatSummary[], day: string): ChatSummary[] {
  return chats.filter((c) => dayOf(c.newestAt) === day);
}

/** The nearest day with chats before ("older") or after ("newer") `day`, which itself may have none; null at either end. */
export function stepDay(days: readonly string[], day: string, direction: "older" | "newer"): string | null {
  if (direction === "older") return days.find((d) => d < day) ?? null;
  return [...days].reverse().find((d) => d > day) ?? null;
}

/** The day before `now`, as a key: the latest day the History page shows. */
export function yesterdayOf(now: Date): string {
  const d = new Date(now);
  d.setDate(now.getDate() - 1);
  return dayKey(d);
}

function dateText(key: string, now: Date, style: "long" | "short"): string {
  const date = parseDay(key);
  if (date === null) return key;
  const year = date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const };
  return date.toLocaleDateString("en-US", { weekday: style, month: style, day: "numeric", ...year });
}

/** "Thursday, October 16": the History page's day on desktop. */
export function longDate(key: string, now: Date): string {
  return dateText(key, now, "long");
}

/** "Thu, Oct 16": the same on the phone. */
export function shortDate(key: string, now: Date): string {
  return dateText(key, now, "short");
}

/** "21:40": the local time of an ISO time, 24-hour. */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "1 image" or "3 images". */
export function imageCount(n: number): string {
  return n === 1 ? "1 image" : `${String(n)} images`;
}
