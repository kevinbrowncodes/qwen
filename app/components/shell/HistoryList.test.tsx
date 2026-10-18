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
// STORY_032: the sidebar passes today's chats only; the list shows what it is given under one "Today" label.
function setup(confirmAnswer = true) {
  const onDelete = vi.fn<(chat: ChatSummary) => void>();
  const onStop = vi.fn<(chat: ChatSummary) => void>();
  const onRename = vi.fn<(chat: ChatSummary, title: string | null) => void>();
  const confirm = vi.fn<(message: string) => boolean>(() => confirmAnswer);
  const chats = chatsOf([entry("a", 0, "running"), entry("b2", 0, "done", "b"), entry("b", 0), entry("c", 0)]);
  render(<HistoryList chats={chats} activeId="b" iconSet="qwpcicon" onDelete={onDelete} onStop={onStop} onRename={onRename} confirm={confirm} />);
  return { onDelete, onStop, onRename, confirm };
}

describe("HistoryList", () => {
  it("lists one row per chat under Today, titles rows by the first prompt's first line, and highlights the open one", () => {
    setup();
    expect(screen.getByRole("group", { name: "Today" })).toBeTruthy();
    expect(screen.queryByText("All images")).toBeNull();
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
    render(<HistoryList chats={[]} activeId={null} iconSet="qwpcicon" onDelete={() => undefined} onStop={() => undefined} onRename={() => undefined} />);
    expect(screen.getByText("No images yet")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Today" })).toBeNull();
  });

  it("says no chats yet today, under Today, when only earlier days have chats (STORY_032)", () => {
    render(<HistoryList chats={[]} hasEarlier activeId={null} iconSet="qwpcicon" onDelete={() => undefined} onStop={() => undefined} onRename={() => undefined} />);
    expect(screen.getByRole("group", { name: "Today" }).textContent).toBe("TodayNo chats yet today");
  });

  // STORY_033: Rename, in place.
  const openRename = (index: number): HTMLInputElement => {
    const row = screen.getAllByTestId("history-row")[index] ?? document.body;
    fireEvent.click(within(row).getByRole("button", { name: "Chat Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = within(row).getByRole("textbox", { name: "Chat name" });
    if (!(input instanceof HTMLInputElement)) throw new Error("not an input");
    return input;
  };

  it("offers Rename first, above Delete, and above Stop while a turn runs", () => {
    setup();
    const [running, idle] = screen.getAllByTestId("history-row");
    fireEvent.click(within(running ?? document.body).getByRole("button", { name: "Chat Menu" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Rename", "Stop"]);
    fireEvent.mouseDown(document.body);
    fireEvent.click(within(idle ?? document.body).getByRole("button", { name: "Chat Menu" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Rename", "Delete"]);
  });

  it("turns the title into a focused input with its text selected, and the row stops being a link", () => {
    setup();
    const input = openRename(1);
    expect(input.value).toBe("a prompt for b");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    expect(input.maxLength).toBe(100);
    expect(input.closest("a")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("saves the trimmed name on Enter, once, and puts the row back", () => {
    const { onRename } = setup();
    const input = openRename(1);
    fireEvent.change(input, { target: { value: "  Beach set, take 2 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), "Beach set, take 2");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves on leaving the input, and asks to clear the name when it is left blank on a renamed chat", () => {
    const onRename = vi.fn<(chat: ChatSummary, title: string | null) => void>();
    const chats = chatsOf([{ ...entry("n", 0), title: "Named" }]);
    render(<HistoryList chats={chats} activeId={null} iconSet="qwpcicon" onDelete={() => undefined} onStop={() => undefined} onRename={onRename} />);
    expect(screen.getByTestId("history-row").textContent).toBe("Named");
    const input = openRename(0);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: "n" }), null);
  });

  it("Escape puts the old title back and saves nothing, nor does an unchanged name", () => {
    const { onRename } = setup();
    let input = openRename(2);
    fireEvent.change(input, { target: { value: "something else" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(screen.getAllByTestId("history-row")[2]?.textContent).toBe("a prompt for c");
    input = openRename(2);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
  });
});
