import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the reference's anticon markup pointing at the sprite", () => {
    const { container } = render(<Icon id="qwpcicon-addBold" className="mode-select-open-icon" />);
    const span = container.querySelector("span.anticon.mode-select-open-icon");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("use")?.getAttribute("href")).toBe("/reference/sprite.svg#qwpcicon-addBold");
  });

  it("adds nothing interactive", () => {
    const { container } = render(<Icon id="x" />);
    expect(container.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
    expect(container.firstElementChild?.className).toBe("anticon");
  });
});
