import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/history";
import { Sidebar } from "./Sidebar";

let pathname = "/";
let entries: HistoryEntry[] = [];
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} aria-label={typeof rest["aria-label"] === "string" ? rest["aria-label"] : undefined} aria-current={rest["aria-current"] === "page" ? "page" : undefined}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/use-history", () => ({
  HISTORY_CHANGED: "qwen:history-changed",
  useHistory: () => ({ entries, loaded: true, remove: vi.fn(), stop: vi.fn(), removeChat: vi.fn(), stopAll: vi.fn() }),
}));

/** An entry created `hoursAgo` before `now`, a chat of its own. Dates come from the clock (CLAUDE.md §6b). */
const entry = (id: string, at: Date): HistoryEntry => ({
  id,
  chatId: id,
  prompt: `prompt ${id}`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  createdAt: at.toISOString(),
  updatedAt: at.toISOString(),
  status: "done",
  progress: 100,
});
const daysAgo = (now: Date, days: number, hour = 12): Date => {
  const d = new Date(now);
  d.setDate(now.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const open = () =>
  render(
    <StrictMode>
      <Sidebar iconSet="qwpcicon" onToggle={() => undefined} onNavigate={() => undefined} />
    </StrictMode>,
  );

afterEach(() => {
  pathname = "/";
  entries = [];
  vi.useRealTimers();
});

describe("Sidebar (BUG_008)", () => {
  it("collapsed: renders only the toggle and the two icon links, by name", () => {
    render(<Sidebar rail iconSet="qwpcicon" onToggle={() => undefined} onNavigate={() => undefined} />);
    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "New image" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "My Library" }).getAttribute("href")).toBe("/library");
    expect(screen.queryByText("My Library")).toBeNull();
    expect(screen.queryByText("History")).toBeNull();
    expect(screen.queryByRole("img", { name: "Qwen" })).toBeNull();
  });

  it("open: renders the logo, the labels and the history list", () => {
    open();
    expect(screen.getByRole("img", { name: "Qwen" })).toBeTruthy();
    expect(screen.getByText("My Library")).toBeTruthy();
    expect(screen.getByText("No images yet")).toBeTruthy();
  });
});

describe("today's chats and History (STORY_032)", () => {
  it("lists only today's chats, and offers History when an earlier chat exists", () => {
    const now = new Date();
    entries = [entry("today", daysAgo(now, 0, 0)), entry("older", daysAgo(now, 2))];
    open();
    expect(screen.getAllByTestId("history-row").map((r) => r.textContent)).toEqual(["prompt today"]);
    expect(screen.getByText("History").closest("a")?.getAttribute("href")).toBe("/history");
    expect(screen.queryByText("Yesterday")).toBeNull();
  });

  it("says no chats yet today when every chat is earlier, and has no History row without any history", () => {
    entries = [entry("older", daysAgo(new Date(), 3))];
    const first = open();
    expect(screen.getByText("No chats yet today")).toBeTruthy();
    first.unmount();
    entries = [];
    open();
    expect(screen.queryByText("History")).toBeNull();
  });

  it("marks History as the open place on its page, and while an earlier chat is open", () => {
    entries = [entry("older", daysAgo(new Date(), 2))];
    pathname = "/history";
    const first = open();
    expect(screen.getByText("History").closest("a")?.getAttribute("aria-current")).toBe("page");
    first.unmount();
    pathname = "/g/older";
    open();
    expect(screen.getByText("History").closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(screen.queryAllByTestId("history-row")).toHaveLength(0);
  });

  it("moves yesterday's chat out within a minute of midnight, and leaves no timer behind", () => {
    vi.useFakeTimers();
    const beforeMidnight = new Date();
    beforeMidnight.setHours(23, 59, 30, 0);
    vi.setSystemTime(beforeMidnight);
    entries = [entry("late", new Date(beforeMidnight.getTime() - 60_000))];
    const view = open();
    expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryAllByTestId("history-row")).toHaveLength(0);
    expect(screen.getByText("No chats yet today")).toBeTruthy();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
