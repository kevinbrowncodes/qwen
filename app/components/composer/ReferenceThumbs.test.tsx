import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceThumbs } from "./ReferenceThumbs";

let created = 0;
const revoked: string[] = [];
beforeEach(() => {
  created = 0;
  revoked.length = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:thumb-${String(++created)}`, revokeObjectURL: (u: string) => revoked.push(u) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const items = [
  { key: "a", file: new File(["a"], "a.png", { type: "image/png" }) },
  { key: "b", file: new File(["b"], "b.png", { type: "image/png" }) },
];

describe("ReferenceThumbs", () => {
  it("renders nothing without references", () => {
    const { container } = render(<ReferenceThumbs items={[]} onRemove={() => undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a thumbnail per file with a Remove file button that names its item", () => {
    const onRemove = vi.fn<(key: string) => void>();
    render(<ReferenceThumbs items={items} onRemove={onRemove} />);
    expect(screen.getAllByTestId("reference-thumb")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "b.png" }).getAttribute("src")).toMatch(/^blob:thumb-/);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove file" })[1] ?? document.body);
    expect(onRemove).toHaveBeenCalledWith("b");
  });

  it("revokes every object URL it created, under StrictMode's double mount too", () => {
    const { unmount } = render(
      <StrictMode>
        <ReferenceThumbs items={items} onRemove={() => undefined} />
      </StrictMode>,
    );
    unmount();
    expect(revoked).toHaveLength(created);
    expect(created).toBeGreaterThanOrEqual(2);
  });
});
