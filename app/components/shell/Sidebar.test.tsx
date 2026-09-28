import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} aria-label={typeof rest["aria-label"] === "string" ? rest["aria-label"] : undefined}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/use-history", () => ({ useHistory: () => ({ entries: [], loaded: true, remove: vi.fn(), stop: vi.fn() }) }));

describe("Sidebar (BUG_008)", () => {
  it("collapsed: renders only the toggle and the two icon links, by name", () => {
    render(<Sidebar rail iconSet="qwpcicon" onToggle={() => undefined} onNavigate={() => undefined} />);
    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "New image" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "My Library" }).getAttribute("href")).toBe("/library");
    expect(screen.queryByText("My Library")).toBeNull();
    expect(screen.queryByText("All images")).toBeNull();
    expect(screen.queryByRole("img", { name: "Qwen" })).toBeNull();
  });

  it("open: renders the logo, the labels and the history list", () => {
    render(<Sidebar iconSet="qwpcicon" onToggle={() => undefined} onNavigate={() => undefined} />);
    expect(screen.getByRole("img", { name: "Qwen" })).toBeTruthy();
    expect(screen.getByText("My Library")).toBeTruthy();
    expect(screen.getByText("All images")).toBeTruthy();
  });
});
