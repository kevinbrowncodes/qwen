import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dropdown } from "./Dropdown";

const items = [
  { id: "1:1", label: "1:1", icon: "qwpcicon-a-1by1AspectRatio" },
  { id: "16:9", label: "16:9", icon: "qwpcicon-a-16by9AspectRatio" },
  { id: "9:16", label: "9:16" },
];

function setup(selected = "16:9") {
  const onSelect = vi.fn<(id: string) => void>();
  render(<Dropdown label="Aspect ratio" display={<span>{selected}</span>} items={items} selected={selected} onSelect={onSelect} />);
  return { onSelect, trigger: screen.getByRole("combobox", { name: "Aspect ratio" }) };
}

describe("Dropdown", () => {
  it("opens on click, marks the selected item with the reference's class and check, and picks on click", () => {
    const { onSelect, trigger } = setup();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const selected = screen.getByRole("option", { name: "16:9" });
    expect(selected.className).toContain("qwen-chat-v2-dropdown-menu-item-selected");
    expect(selected.querySelector(".qwen-chat-v2-dropdown-menu-item-check")).not.toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "1:1" }));
    expect(onSelect).toHaveBeenCalledWith("1:1");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("works by keyboard: Enter opens on the selected item, arrows move, Enter picks, focus returns", () => {
    const { onSelect, trigger } = setup();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("option", { name: "16:9" }).getAttribute("data-active")).toBe("true");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "9:16" }).getAttribute("data-active")).toBe("true");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "1:1" }).getAttribute("data-active")).toBe("true");
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("9:16");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape, on Tab and on an outside click without picking", () => {
    const { onSelect, trigger } = setup();
    fireEvent.keyDown(trigger, { key: " " });
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores other keys while closed, and follows the mouse while open", () => {
    const { trigger } = setup("1:1");
    fireEvent.keyDown(trigger, { key: "a" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.mouseEnter(screen.getByRole("option", { name: "9:16" }));
    expect(screen.getByRole("option", { name: "9:16" }).getAttribute("data-active")).toBe("true");
  });
});
