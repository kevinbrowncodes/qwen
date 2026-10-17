import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/history";
import { chatsOf, type ChatSummary } from "@/lib/history-view";
import { HistoryList } from "./HistoryList";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} className={typeof rest["className"] === "string" ? rest["className"] : undefined} aria-current={rest["aria-current"] === "page" ? "page" : undefined}>
      {children}
    </a>
  ),
}));

const now = new Date();
const ago = (days: number): string => {
  const d = new Date(now);
  d.setDate(now.getDate() - days);
  return d.toISOString();
};
const entry = (id: string, days: number, status: HistoryEntry["status"] = "done", chatId = id): HistoryEntry => ({
  id,
  chatId,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  prompt: `a prompt for ${id}\nsecond line`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  createdAt: ago(days),
  updatedAt: ago(days),
  status,
  progress: 0,
});

// STORY_031: a row per chat. Chat "b" has two turns (b, then b2), newest first as history keeps them.
function setup(confirmAnswer = true) {
  const onDelete = vi.fn<(chat: ChatSummary) => void>();
  const onStop = vi.fn<(chat: ChatSummary) => void>();
  const confirm = vi.fn<(message: string) => boolean>(() => confirmAnswer);
  const chats = chatsOf([entry("a", 0, "running"), entry("b2", 0, "done", "b"), entry("b", 0), entry("c", 1)]);
  render(<HistoryList chats={chats} activeId="b" now={now} iconSet="qwpcicon" onDelete={onDelete} onStop={onStop} confirm={confirm} />);
  return { onDelete, onStop, confirm };
}

describe("HistoryList", () => {
  it("lists one row per chat, groups by day, titles rows by the first prompt's first line, and highlights the open one", () => {
    setup();
    expect(screen.getByRole("group", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Yesterday" })).toBeTruthy();
    const rows = screen.getAllByTestId("history-row");
    expect(rows.map((r) => r.textContent)).toEqual(["a prompt for a", "a prompt for b", "a prompt for c"]);
    const active = within(rows[1] ?? document.body).getByRole("link");
    expect(active.className).toContain("chat-item-drag-active");
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("shows a spinner for a running generation, and offers Stop instead of Delete", () => {
    const { onStop } = setup();
    const running = screen.getAllByTestId("history-row")[0] ?? document.body;
    expect(within(running).getByLabelText("Generating")).toBeTruthy();
    fireEvent.click(within(running).getByRole("button", { name: "Chat Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: "a", runningIds: ["a"] }));
  });

  it("asks before deleting, and deletes only when confirmed", () => {
    const yes = setup(true);
    const row = screen.getAllByTestId("history-row")[1] ?? document.body;
    fireEvent.click(within(row).getByRole("button", { name: "Chat Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(yes.confirm).toHaveBeenCalledWith("Delete this chat and its 2 images? This cannot be undone.");
    expect(yes.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "b", count: 2 }));
  });

  it("does not delete when the question is declined, and closes the menu on an outside click", () => {
    const no = setup(false);
    const row = screen.getAllByTestId("history-row")[2] ?? document.body;
    fireEvent.click(within(row).getByRole("button", { name: "Chat Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(no.onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Chat Menu" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("says so when there is nothing yet", () => {
    render(<HistoryList chats={[]} activeId={null} now={now} iconSet="qwpcicon" onDelete={() => undefined} onStop={() => undefined} />);
    expect(screen.getByText("No images yet")).toBeTruthy();
  });
});
