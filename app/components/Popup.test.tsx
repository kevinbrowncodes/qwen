import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { anchorFor, clampLeft, placementFor, Popup } from "./Popup";

describe("anchorFor", () => {
  it("sits below the trigger with a gap, or above it for the pinned composer", () => {
    expect(anchorFor({ left: 10, top: 100, bottom: 132 }, "bottom")).toEqual({ left: 10, top: 136, placement: "bottom" });
    expect(anchorFor({ left: 10, top: 100, bottom: 132 }, "top")).toEqual({ left: 10, top: 96, placement: "top" });
  });
});

describe("placementFor (BUG_010)", () => {
  it("opens upward from a trigger in the lower half of the window, whatever was asked", () => {
    expect(placementFor({ top: 1040, bottom: 1072 }, "bottom", 1080)).toBe("top");
    expect(placementFor({ top: 1040, bottom: 1072 }, "top", 1080)).toBe("top");
  });
  it("keeps the side asked for in the upper half", () => {
    expect(placementFor({ top: 530, bottom: 562 }, "bottom", 1200)).toBe("bottom");
    expect(placementFor({ top: 100, bottom: 132 }, "top", 1080)).toBe("top");
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

describe("clampLeft (STORY_019)", () => {
  it("leaves a popup that fits where it is", () => {
    expect(clampLeft(100, 200, 390)).toBe(100);
  });
  it("pulls one that would run off the right edge back in, 8px from it", () => {
    expect(clampLeft(300, 200, 390)).toBe(182);
  });
  it("never pushes one past the left edge, even when it is wider than the viewport", () => {
    expect(clampLeft(300, 500, 390)).toBe(8);
  });
});
