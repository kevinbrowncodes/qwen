import { StrictMode } from "react";
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

describe("Dropdown with an info card (STORY_030)", () => {
  const detailOptions = { infoIcon: "qwpcicon-info", backIcon: "qwpcicon-arrowLeft", pickLabel: "Use this LoRA", selectedLabel: "In use" };
  const loras = [
    { id: "none", label: "None" },
    { id: "a", label: "Alpha", detail: <p>Alpha card</p> },
    { id: "b", label: "Beta", detail: <p>Beta card</p> },
  ];
  function setupCards(selected = "none") {
    const onSelect = vi.fn<(id: string) => void>();
    render(
      <StrictMode>
        <Dropdown label="LoRA" display={<span>{selected}</span>} items={loras} selected={selected} onSelect={onSelect} detailOptions={detailOptions} />
      </StrictMode>,
    );
    const trigger = screen.getByRole("combobox", { name: "LoRA" });
    fireEvent.click(trigger);
    return { onSelect, trigger };
  }
  const infoButton = (name: string): HTMLElement => {
    const button = screen.getByRole("option", { name }).querySelector<HTMLElement>(".clone-dropdown-item-info");
    if (!button) throw new Error(`no info button on ${name}`);
    return button;
  };

  it("gives an info button only to items with a card, and keeps each option's text its label", () => {
    setupCards();
    expect(screen.getByRole("option", { name: "None" }).querySelector(".clone-dropdown-item-info")).toBeNull();
    expect(infoButton("Alpha").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["None", "Alpha", "Beta"]);
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAccessibleDescription("Press right arrow for details");
  });

  it("opens the card in place of the list without picking, and goes back to the list with that row active", () => {
    const { onSelect } = setupCards();
    fireEvent.click(infoButton("Beta"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    const card = screen.getByRole("group", { name: "About Beta" });
    expect(card.textContent).toContain("Beta card");
    fireEvent.mouseDown(card);
    expect(screen.getByRole("group", { name: "About Beta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to the list" }));
    expect(screen.getByRole("option", { name: "Beta" }).getAttribute("data-active")).toBe("true");
  });

  it("picks from the card and closes; an outside click closes without picking", () => {
    const first = setupCards();
    fireEvent.click(infoButton("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Use this LoRA" }));
    expect(first.onSelect).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(first.trigger);
    fireEvent.click(first.trigger);
    fireEvent.click(infoButton("Alpha"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("group")).toBeNull();
    expect(first.onSelect).toHaveBeenCalledTimes(1);
  });

  it("says In use, disabled, on the card of the item already chosen", () => {
    setupCards("a");
    fireEvent.click(infoButton("Alpha"));
    const button = screen.getByRole("button", { name: "In use" });
    expect(button).toBeDisabled();
  });

  it("works by keyboard: ArrowRight opens the active item's card, ArrowLeft returns, Enter picks, Escape closes", () => {
    const { onSelect, trigger } = setupCards();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(screen.getByRole("group", { name: "About Alpha" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(trigger, { key: "ArrowLeft" });
    expect(screen.getByRole("option", { name: "Alpha" }).getAttribute("data-active")).toBe("true");
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("a");
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shows no info button and ignores ArrowRight without detail options", () => {
    const onSelect = vi.fn<(id: string) => void>();
    render(<Dropdown label="LoRA" display={<span>x</span>} items={loras} selected="none" onSelect={onSelect} />);
    const trigger = screen.getByRole("combobox", { name: "LoRA" });
    fireEvent.click(trigger);
    expect(document.querySelector(".clone-dropdown-item-info")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("closes the card on Tab without picking", () => {
    const { onSelect, trigger } = setupCards();
    fireEvent.click(infoButton("Alpha"));
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
