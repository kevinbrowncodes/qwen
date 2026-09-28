import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The proxy's routing, read from the committed Caddyfile (CHORE_004): qwen.local goes to the app over plain http, any
// other name is a 404, and nothing else is proxied.
const caddyfile = readFileSync(new URL("../Caddyfile", import.meta.url), "utf8").replace(/#.*$/gm, "");
const sites = [...caddyfile.matchAll(/^([^\s{}][^{\n]*?)\s*\{/gm)].map((m) => m[1]);

void test("there are exactly two sites: qwen.local and the port-80 fallback", () => {
  assert.deepEqual(sites, ["http://qwen.local", ":80"]);
});

void test("qwen.local, and only it, proxies to the app", () => {
  assert.deepEqual([...caddyfile.matchAll(/reverse_proxy\s+(\S+)/g)].map((m) => m[1]), ["qwen-app:3100"]);
});

void test("the fallback answers 404, and there is no automatic https (a .local name cannot get a certificate)", () => {
  assert.match(caddyfile, /:80\s*\{\s*respond "Not found" 404\s*\}/);
  assert.match(caddyfile, /auto_https off/);
});
