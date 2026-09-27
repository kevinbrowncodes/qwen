/**
 * How history is shown (STORY_013), pure: day groups for the sidebar (Today, Yesterday, then dates), a one-line
 * title, the finished images for My Library, and the two newest for the sidebar's thumbnails.
 */
import type { HistoryEntry } from "./history";

export interface DayGroup {
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
}

function dayKey(d: Date): string {
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
