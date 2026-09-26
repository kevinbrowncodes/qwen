import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containsIdentity } from "./identity-guard.ts";
import { cleanSnapshot, MASKED_NAME, PLACEHOLDER_AVATAR, SnapshotError } from "./snapshot.ts";

const saved = readFileSync(new URL("./fixtures/saved-page.html", import.meta.url), "utf8");

describe("cleanSnapshot", () => {
  const cleaned = cleanSnapshot(saved);

  it("removes every script, script preload and inline handler", () => {
    expect(cleaned.html).not.toMatch(/<script/i);
    expect(cleaned.html).not.toContain("modulepreload");
    expect(cleaned.html).not.toMatch(/\son[a-z]+=/i);
    expect(cleaned.html).not.toContain("javascript:");
    expect(cleaned.removedScripts).toBe(2);
  });

  it("drops the style and elements the capture extension injected (BUG_001)", () => {
    expect(cleaned.html).not.toContain("claude-agent");
    expect(cleaned.html).toContain(".anticon { display: inline-flex; }");
  });

  it("reads the identity from the user button and masks it everywhere it appears", () => {
    expect(cleaned.identity.displayName).toBe("Fixture Person");
    expect(cleaned.identity.avatarSrc.startsWith("data:image/png;base64,")).toBe(true);
    expect(containsIdentity(cleaned.html, cleaned.identity)).toBe(false);
    expect(cleaned.html).toContain(`>${MASKED_NAME}</div>`);
    expect(cleaned.html).toContain('title="Chats of Owner"');
    expect(cleaned.html).toContain(PLACEHOLDER_AVATAR.replaceAll("&", "&amp;"));
  });

  it("replaces images generated on the reference, and the ids beside them", () => {
    expect(cleaned.html).not.toContain("cdn.qwenlm.ai/output");
    expect(cleaned.html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(cleaned.html).toContain('data-id=":id"');
    expect(cleaned.html).toContain("fill='%233e474e'");
  });

  it("points stylesheet links at the harvested css and drops their query", () => {
    expect(cleaned.html).toContain('href="../assets/css/main.css"');
    expect(cleaned.html).toContain('href="../assets/css/index5.css"');
    expect(cleaned.html).not.toContain("./Qwen_files/main.css");
  });

  it("drops crossorigin from relinked local files, which a page opened from disk would refuse (BUG_002)", () => {
    expect(cleaned.html).toContain('<link rel="stylesheet" href="../assets/css/main.css">');
  });

  it("reports a stylesheet link with no harvested file as dead (BUG_002)", () => {
    const only = cleanSnapshot(saved, { cssBase: "../assets/css/", brandBase: "../assets/brand/", availableCss: new Set(["main.css"]) });
    expect(only.deadLinks).toContain("./Qwen_files/index5.css?v=1");
    expect(only.deadLinks).not.toContain("./Qwen_files/main.css");
  });

  it("points the logo at the harvested brand folder and lists every other local file as dead", () => {
    expect(cleaned.html).toContain('src="../assets/brand/qwen-logo-dark.svg"');
    expect(cleaned.deadLinks).toEqual(["./Qwen_files/O1CN01guide.png"]);
  });

  it("keeps the icon sprite and the inline styles untouched", () => {
    expect(cleaned.html).toContain('<symbol id="qwpcicon-sendChat" viewBox="0 0 24 24"><path d="M12 4l8 8h-5v8H9v-8H4z"></path></symbol>');
    expect(cleaned.html).toContain(".anticon { display: inline-flex; }");
    expect(cleaned.html).toContain('style="font-size: 13.3973px;"');
  });

  it("stops rather than returning an unmasked page when the user button is missing", () => {
    expect(() => cleanSnapshot("<html><body><p>no user here</p></body></html>")).toThrow(SnapshotError);
  });

  it("stops when the name or the avatar cannot be found", () => {
    const noAvatar = saved.replace(/<img class="user-img"[^>]*>/, "");
    expect(() => cleanSnapshot(noAvatar)).toThrow(/avatar/);
    const noName = saved.replace('<div class="user-menu-btn-text user-menu-btn-content-right">Fixture Person</div>', "");
    expect(() => cleanSnapshot(noName)).toThrow(/name/);
  });
});
