import { describe, expect, it } from "vitest";
import { assertNoIdentity, containsIdentity, IdentityLeakError } from "./identity-guard.ts";

// A made-up identity: the real one is only ever read from the owner's saved page at run time.
const identity = { displayName: "Fixture Person", avatarSrc: "data:image/png;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0123456789abcdefghijklmnopqrstuvwxyzAAAA" };

describe("containsIdentity", () => {
  it("finds the name inside plain text", () => {
    expect(containsIdentity("Welcome back, Fixture Person!", identity)).toBe(true);
  });

  it("finds the name inside an HTML attribute", () => {
    expect(containsIdentity('<div title="Chats of Fixture Person">', identity)).toBe(true);
  });

  it("finds the name inside JSON, including when JSON escaping changed it", () => {
    expect(containsIdentity(JSON.stringify({ user: "Fixture Person" }), identity)).toBe(true);
    const quoted = { displayName: 'Fixture "FP" Person', avatarSrc: "" };
    expect(containsIdentity(JSON.stringify({ user: quoted.displayName }), quoted)).toBe(true);
  });

  it("finds the avatar's image data even when the data: prefix differs", () => {
    const payload = identity.avatarSrc.slice(identity.avatarSrc.indexOf(",") + 1);
    expect(containsIdentity(`<img src="data:image/webp;base64,${payload}">`, identity)).toBe(true);
  });

  it("treats a link to an image generated on the reference as a leak", () => {
    expect(containsIdentity('style="background: url(https://cdn.qwenlm.ai/output/abc/t2i/x.png)"', identity)).toBe(true);
  });

  it("passes clean output", () => {
    expect(containsIdentity('<div class="user-menu-btn-text">Owner</div><img src="data:image/svg+xml,x">', identity)).toBe(false);
  });

  it("does not guard on a name too short to be distinctive", () => {
    expect(containsIdentity("an ordinary sentence", { displayName: "an", avatarSrc: "" })).toBe(false);
  });
});

describe("assertNoIdentity", () => {
  it("names every leaking file, and never the name itself", () => {
    const outputs = new Map<string, string>([
      ["b.json", '{"user":"Fixture Person"}'],
      ["clean.md", "nothing here"],
      ["a.html", "<p>Fixture Person</p>"],
    ]);
    let caught: unknown;
    try {
      assertNoIdentity(outputs, identity);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(IdentityLeakError);
    const err = caught as IdentityLeakError;
    expect(err.files).toEqual(["a.html", "b.json"]);
    expect(err.message).not.toContain("Fixture Person");
  });

  it("checks binary outputs too", () => {
    const outputs = new Map<string, Uint8Array>([["x.bin", new TextEncoder().encode("..Fixture Person..")]]);
    expect(() => assertNoIdentity(outputs, identity)).toThrow(IdentityLeakError);
  });

  it("returns quietly when nothing leaks", () => {
    expect(() => assertNoIdentity(new Map([["ok.md", "Owner"]]), identity)).not.toThrow();
  });
});
