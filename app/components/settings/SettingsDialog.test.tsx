import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentZoom, ZOOM_KEY } from "@/lib/ui-zoom";
import { SettingsDialog } from "./SettingsDialog";

// STORY_020: the Settings dialog and its zoom control.
afterEach(() => {
  document.documentElement.style.cssText = "";
  delete document.documentElement.dataset["zoom"];
  window.localStorage.clear();
});

function open(onClose = vi.fn()) {
  render(
    <StrictMode>
      <SettingsDialog onClose={onClose} />
    </StrictMode>,
  );
  return onClose;
}

describe("SettingsDialog", () => {
  it("offers the six steps, with the stored one checked and focused", () => {
    window.localStorage.setItem(ZOOM_KEY, "1.5");
    open();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["1×", "1.25×", "1.5×", "2×", "3×", "4×"]);
    expect(screen.getByRole("radio", { checked: true }).textContent).toBe("1.5×");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "1.5×" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("applies and remembers a step the moment it is clicked", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "2×" }));
    expect(screen.getByRole("radio", { checked: true }).textContent).toBe("2×");
    expect(currentZoom()).toBe(2);
    expect(window.localStorage.getItem(ZOOM_KEY)).toBe("2");
  });

  it("moves between steps with the arrow keys, wrapping at the ends", () => {
    open();
    const group = screen.getByRole("radiogroup", { name: "Zoom" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(currentZoom()).toBe(1.25);
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(currentZoom()).toBe(4);
    fireEvent.keyDown(group, { key: "a" });
    expect(currentZoom()).toBe(4);
  });

  it("closes on Escape, on ✕, and on the backdrop but not inside the dialog", () => {
    const onClose = open();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByTestId("settings-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
