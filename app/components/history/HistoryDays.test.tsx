import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/history";
import { dayKey, longDate } from "@/lib/history-view";
import { HistoryDays } from "./HistoryDays";

// STORY_032: the History page, one earlier day at a time. Days are derived from the clock (CLAUDE.md §6b).
let search = "";
let entries: HistoryEntry[] = [];
const push = vi.fn();
const removeChat = vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true));
const stopAll = vi.fn<(ids: readonly string[]) => Promise<void>>(() => Promise.resolve());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/use-history", () => ({
  HISTORY_CHANGED: "qwen:history-changed",
  useHistory: () => ({ entries, loaded: true, remove: vi.fn(), stop: vi.fn(), removeChat, stopAll }),
}));

const now = new Date();
const at = (daysAgo: number, hour: number): Date => {
  const d = new Date(now);
  d.setDate(now.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const day = (daysAgo: number): string => dayKey(at(daysAgo, 12));
const entry = (id: string, when: Date, chatId = id, status: HistoryEntry["status"] = "done"): HistoryEntry => ({
  id,
  chatId,
  prompt: `prompt ${id}`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  createdAt: when.toISOString(),
  updatedAt: when.toISOString(),
  status,
  progress: 100,
  ...(status === "done" ? { result: { width: 64, height: 36, mimeType: "image/png" } } : {}),
});

/** Today's chat, a chat of two images 2 days ago (newest at 21:40), one 2 days ago at 18:05, and one 5 days ago. */
function seed(): void {
  const late = at(2, 21);
  late.setMinutes(40);
  const early = at(2, 18);
  early.setMinutes(5);
  entries = [entry("today", at(0, 0)), entry("h2", late, "h"), entry("l", early), entry("h", at(2, 9)), entry("old", at(5, 12))];
}
const page = (confirm: (m: string) => boolean = () => true) =>
  render(
    <StrictMode>
      <HistoryDays confirm={confirm} />
    </StrictMode>,
  );
const rows = (): string[] => screen.queryAllByTestId("history-day-row").map((r) => r.textContent);

afterEach(() => {
  search = "";
  entries = [];
  push.mockClear();
  removeChat.mockClear();
  stopAll.mockClear();
});

describe("HistoryDays", () => {
  it("opens at the most recent earlier day, with each chat's thumbnail, title, time and count, newest first", () => {
    seed();
    page();
    expect(screen.getByRole("heading", { name: longDate(day(2), now) })).toBeTruthy();
    expect(screen.getByText("Chats from before today")).toBeTruthy();
    expect(rows()).toEqual(["prompt hlast 21:402 images", "prompt llast 18:051 image"]);
    const first = screen.getAllByTestId("history-day-row")[0];
    expect(first?.querySelector("a")?.getAttribute("href")).toBe("/g/h");
    expect(first?.querySelector("img")?.getAttribute("src")).toBe("/api/jobs/h2/result");
  });

  it("honours ?day=, and steps over empty days with ‹ and ›, disabled at each end", () => {
    seed();
    search = `day=${day(5)}`;
    const view = page();
    expect(rows()).toEqual(["prompt oldlast 12:001 image"]);
    expect(screen.getByRole("button", { name: "Earlier day" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Later day" }));
    expect(push).toHaveBeenCalledWith(`/history?day=${day(2)}`);
    view.unmount();
    search = `day=${day(2)}`;
    page();
    expect(screen.getByRole("button", { name: "Later day" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Earlier day" }));
    expect(push).toHaveBeenLastCalledWith(`/history?day=${day(5)}`);
  });

  it("shows a picked day with no chats, and moves to any day chosen in the date input", () => {
    seed();
    search = `day=${day(3)}`;
    page();
    expect(screen.getByText("No chats on this day.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Earlier day" })).not.toBeDisabled();
    const input = screen.getByLabelText("Pick a day");
    expect(input.getAttribute("min")).toBe(day(5));
    expect(input.getAttribute("max")).toBe(day(1));
    fireEvent.change(input, { target: { value: day(5) } });
    expect(push).toHaveBeenCalledWith(`/history?day=${day(5)}`);
    fireEvent.click(screen.getByRole("button", { name: "Choose a day" }));
  });

  it("ignores a ?day= that is today or not a day, and says so when nothing is earlier than today", () => {
    seed();
    search = `day=${dayKey(now)}`;
    const view = page();
    expect(screen.getByRole("heading", { name: longDate(day(2), now) })).toBeTruthy();
    view.unmount();
    entries = [entry("today", at(0, 0))];
    search = "day=nonsense";
    page();
    expect(screen.getByText("No earlier chats.")).toBeTruthy();
  });

  it("deletes a chat from its row after asking, and stops a running one", () => {
    seed();
    entries = [...entries, entry("run", at(2, 1), "run", "running")];
    const ask = vi.fn<(m: string) => boolean>(() => true);
    page(ask);
    const hRow = screen.getAllByTestId("history-day-row")[0] ?? document.body;
    fireEvent.click(hRow.querySelector('[aria-label="Chat Menu"]') ?? document.body);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(ask).toHaveBeenCalledWith("Delete this chat and its 2 images? This cannot be undone.");
    expect(removeChat).toHaveBeenCalledWith("h");
    const runRow = screen.getAllByTestId("history-day-row").find((r) => r.textContent.startsWith("prompt run")) ?? document.body;
    fireEvent.click(runRow.querySelector('[aria-label="Chat Menu"]') ?? document.body);
    fireEvent.click(screen.getByRole("menuitem", { name: "Stop" }));
    expect(stopAll).toHaveBeenCalledWith(["run"]);
  });
});
