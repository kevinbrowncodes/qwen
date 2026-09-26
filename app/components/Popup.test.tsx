import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { anchorFor, Popup } from "./Popup";

describe("anchorFor", () => {
  it("sits below the trigger with a gap, or above it for the pinned composer", () => {
    expect(anchorFor({ left: 10, top: 100, bottom: 132 }, "bottom")).toEqual({ left: 10, top: 136 });
    expect(anchorFor({ left: 10, top: 100, bottom: 132 }, "top")).toEqual({ left: 10, top: 96 });
  });
});

function Harness() {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={ref} type="button">
        trigger
      </button>
      <Popup anchorRef={ref} placement="bottom">
        {(a) => <div data-testid="popup" data-top={a.top} />}
      </Popup>
    </div>
  );
}

describe("Popup", () => {
  it("renders on <body>, outside its parent", () => {
    const { container } = render(<Harness />);
    const popup = document.querySelector("[data-testid=popup]");
    expect(popup).not.toBeNull();
    expect(container.contains(popup)).toBe(false);
    expect(popup?.parentElement).toBe(document.body);
  });
});
