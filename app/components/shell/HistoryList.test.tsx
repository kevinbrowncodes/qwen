import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/history";
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
const entry = (id: string, days: number, status: HistoryEntry["status"] = "done"): HistoryEntry => ({
  id,
  prompt: `a prompt for ${id}\nsecond line`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  createdAt: ago(days),
  updatedAt: ago(days),
  status,
  progress: 0,
});

function setup(confirmAnswer = true) {
  const onDelete = vi.fn<(id: string) => void>();
  const onStop = vi.fn<(id: string) => void>();
  const confirm = vi.fn(() => confirmAnswer);
  render(<HistoryList entries={[entry("a", 0, "running"), entry("b", 0), entry("c", 1)]} activeId="b" now={now} iconSet="qwpcicon" onDelete={onDelete} onStop={onStop} confirm={confirm} />);
  return { onDelete, onStop, confirm };
}

describe("HistoryList", () => {
  it("groups by day, titles rows by the prompt's first line, and highlights the open one", () => {
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
    expect(onStop).toHaveBeenCalledWith("a");
  });

  it("asks before deleting, and deletes only when confirmed", () => {
    const yes = setup(true);
    const row = screen.getAllByTestId("history-row")[1] ?? document.body;
    fireEvent.click(within(row).getByRole("button", { name: "Chat Menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(yes.confirm).toHaveBeenCalled();
    expect(yes.onDelete).toHaveBeenCalledWith("b");
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
    render(<HistoryList entries={[]} activeId={null} now={now} iconSet="qwpcicon" onDelete={() => undefined} onStop={() => undefined} />);
    expect(screen.getByText("No images yet")).toBeTruthy();
  });
});
