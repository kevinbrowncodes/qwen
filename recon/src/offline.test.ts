import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// curate and harvest promise to make no request (STORY_002, STORY_003): they
// read the owner's capture from disk and nothing else. This reads their
// sources and every local module they import, and fails on anything that
// could reach the network.
const OFFLINE_ENTRIES = ["curate.ts", "harvest.ts", "interactions.ts"];
const NETWORK = [/\bfetch\s*\(/, /from\s+"node:(?:http|https|net|tls|dgram)"/, /from\s+"playwright"/, /\bXMLHttpRequest\b/, /\bWebSocket\b/];

function localImports(file: string): string[] {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  return [...src.matchAll(/from\s+"\.\/([\w-]+\.ts)"/g)].map((m) => m[1]).filter((x): x is string => x !== undefined);
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const f = todo.pop();
    if (f === undefined || seen.has(f)) continue;
    seen.add(f);
    todo.push(...localImports(f));
  }
  return seen;
}

describe("offline recon scripts", () => {
  const present = new Set(readdirSync(new URL(".", import.meta.url)));
  for (const entry of OFFLINE_ENTRIES.filter((e) => present.has(e))) {
    it(`${entry} and the modules it imports contain no network call`, () => {
      for (const file of closure(entry)) {
        const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
        for (const pattern of NETWORK) expect(src, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});
