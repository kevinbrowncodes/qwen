import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { downloadUrl, envValue, fetchAll, localPath, plan, readEnvToken, readFetchManifest, readToken, statusLines, verify, type Bases, type FetchEntry } from "./fetch-loras.ts";

// STORY_021: the fetch engine behind spark/fetch-loras.sh, against a local fake of Hugging Face and Civitai.
const sha = (b: string | Uint8Array): string => createHash("sha256").update(b).digest("hex");
const GOOD = "good bytes of an add-on";
const OTHER = "other bytes";
const hf: FetchEntry = { id: "nsfw-v2", file: "NSFW Qwen by TheseAlpacas V2.safetensors", sha256: sha(GOOD), source: { kind: "huggingface", repo: "Mirror/Repo", revision: "abc123" } };
const civ: FetchEntry = { id: "erect", file: "qwen2.1_penisV01.safetensors", sha256: sha(OTHER), source: { kind: "civitai", versionId: 3348119 } };

describe("readFetchManifest", () => {
  const manifest = (loras: unknown[]): string => JSON.stringify({ loras });
  const good = { id: "a", file: "a.safetensors", sha256: sha("a").toUpperCase(), source: { kind: "huggingface", repo: "x/y", revision: "r" } };

  it("keeps a well-formed entry of each source kind, lower-casing the checksum", () => {
    const { entries, refused } = readFetchManifest(manifest([good, { ...good, id: "b", source: { kind: "civitai", modelId: 1, versionId: 2 } }]));
    expect(refused).toEqual([]);
    expect(entries).toEqual([
      { id: "a", file: "a.safetensors", sha256: sha("a"), source: { kind: "huggingface", repo: "x/y", revision: "r" } },
      { id: "b", file: "a.safetensors", sha256: sha("a"), source: { kind: "civitai", versionId: 2 } },
    ]);
  });

  it("refuses, by id and reason, an entry with no sha256, no source, an unknown kind, or an incomplete source", () => {
    const { entries, refused } = readFetchManifest(
      manifest([
        { ...good, id: "nohash", sha256: undefined },
        { ...good, id: "short", sha256: "abc" },
        { ...good, id: "nosource", source: undefined },
        { ...good, id: "odd", source: { kind: "ftp" } },
        { ...good, id: "norev", source: { kind: "huggingface", repo: "x/y" } },
        { ...good, id: "noversion", source: { kind: "civitai", modelId: 1 } },
        { id: "nofile", sha256: good.sha256 },
        "junk",
      ]),
    );
    expect(entries).toEqual([]);
    expect(refused.map((r) => r.id)).toEqual(["nohash", "short", "nosource", "odd", "norev", "noversion", "nofile", "(no id)"]);
    expect(refused[0]?.reason).toMatch(/sha256/);
    expect(refused[2]?.reason).toBe("no source");
    expect(refused[3]?.reason).toMatch(/unknown source kind "ftp"/);
    expect(refused[4]?.reason).toMatch(/repo and revision/);
    expect(refused[5]?.reason).toMatch(/versionId/);
  });

  it("reads nothing from a file that is not a manifest", () => {
    expect(readFetchManifest("{")).toEqual({ entries: [], refused: [{ id: "(manifest)", reason: "not JSON" }] });
    expect(readFetchManifest("[]")).toEqual({ entries: [], refused: [] });
  });
});

describe("downloadUrl and localPath", () => {
  it("encodes a Hugging Face file name with spaces a segment at a time, and carries the Civitai version id", () => {
    expect(downloadUrl(hf)).toBe("https://huggingface.co/Mirror/Repo/resolve/abc123/NSFW%20Qwen%20by%20TheseAlpacas%20V2.safetensors");
    expect(downloadUrl({ ...hf, file: "sub dir/x.safetensors" })).toBe("https://huggingface.co/Mirror/Repo/resolve/abc123/sub%20dir/x.safetensors");
    expect(downloadUrl(civ)).toBe("https://civitai.com/api/download/models/3348119?type=Model&format=SafeTensor");
  });

  it("lands the file under the entry's id by its base name, as the model server resolves it", () => {
    expect(localPath("/loras", { ...hf, file: "sub dir/x.safetensors" })).toBe("/loras/nsfw-v2/x.safetensors");
  });
});

describe("against a local fake of both sources", () => {
  /** Two servers: the sources, and the CDN Civitai redirects to. A different port is a different origin, so the
   * client must drop the bearer on the way, as it must for the real CDN's signed URL. */
  let sources: Server;
  let cdn: Server;
  let cdnBase = "";
  let bases: Bases;
  let dir = "";
  /** The authorization header each request carried, by path. */
  const seen: Array<{ path: string; auth: string | undefined }> = [];
  const CIVITAI_TOKEN = "civitai-secret";

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url ?? "";
    seen.push({ path: url, auth: req.headers.authorization });
    if (url.startsWith("/api/download/models/")) {
      if (req.headers.authorization !== `Bearer ${CIVITAI_TOKEN}`) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(302, { location: `${cdnBase}/cdn/erect.bin` }).end();
      return;
    }
    if (url === "/cdn/erect.bin") {
      res.writeHead(200, { "content-type": "application/octet-stream" }).end(OTHER);
      return;
    }
    if (url.includes("/resolve/abc123/NSFW%20Qwen%20by%20TheseAlpacas%20V2.safetensors")) {
      res.writeHead(200).end(GOOD);
      return;
    }
    if (url.includes("/resolve/abc123/wrong.safetensors")) {
      res.writeHead(200).end("not the bytes the manifest promises");
      return;
    }
    res.writeHead(404).end();
  };
  const listen = async (server: Server): Promise<string> => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return `http://127.0.0.1:${String(typeof address === "object" && address ? address.port : 0)}`;
  };
  const close = (server: Server): Promise<void> =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });

  beforeAll(async () => {
    sources = createServer(handle);
    cdn = createServer(handle);
    const base = await listen(sources);
    cdnBase = await listen(cdn);
    bases = { huggingface: base, civitai: base };
  });
  afterAll(async () => {
    await close(sources);
    await close(cdn);
  });
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "qwen-fetch-"));
    seen.length = 0;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("fetches a file whose hash matches into <id>/<file>, sending no token to Hugging Face when there is none", async () => {
    const lines: string[] = [];
    const outcome = await fetchAll([hf], dir, {}, bases, (l) => lines.push(l));
    expect(outcome).toEqual({ fetched: ["nsfw-v2"], waiting: [], failed: [] });
    expect(readFileSync(localPath(dir, hf), "utf8")).toBe(GOOD);
    expect(readdirSync(path.join(dir, "nsfw-v2"))).toEqual([hf.file]); // no .part left behind
    expect(seen[0]?.auth).toBeUndefined();
    expect(lines[0]).toMatch(/nsfw-v2 done, 0.0 MB, sha256 ok/);
  });

  it("removes a file whose hash differs and reports it", async () => {
    const wrong: FetchEntry = { ...hf, id: "wrong", file: "wrong.safetensors" };
    const outcome = await fetchAll([wrong], dir, {}, bases);
    expect(outcome.failed).toEqual([{ id: "wrong", reason: expect.stringMatching(/^sha256 mismatch: got [0-9a-f]{12}…, the manifest says [0-9a-f]{12}…$/) as string }]);
    expect(existsSync(path.join(dir, "wrong"))).toBe(true);
    expect(readdirSync(path.join(dir, "wrong"))).toEqual([]);
  });

  it("sends the Civitai token as a bearer, follows the redirect without it, and checks the hash", async () => {
    const outcome = await fetchAll([civ], dir, { civitai: CIVITAI_TOKEN }, bases);
    expect(outcome).toEqual({ fetched: ["erect"], waiting: [], failed: [] });
    expect(seen.map((s) => s.auth)).toEqual([`Bearer ${CIVITAI_TOKEN}`, undefined]);
    expect(readFileSync(localPath(dir, civ), "utf8")).toBe(OTHER);
  });

  it("leaves a Civitai entry waiting, by name, when there is no token, fetches the rest, and skips what is there", async () => {
    mkdirSync(path.join(dir, "already"));
    writeFileSync(path.join(dir, "already", "a.safetensors"), "x");
    const already: FetchEntry = { ...civ, id: "already", file: "a.safetensors" };
    const lines: string[] = [];
    const outcome = await fetchAll([already, civ, hf], dir, {}, bases, (l) => lines.push(l));
    expect(outcome).toEqual({ fetched: ["nsfw-v2"], waiting: ["erect"], failed: [] });
    expect(lines).toEqual([expect.stringMatching(/already already there/), expect.stringMatching(/erect waits for a Civitai token/), expect.stringMatching(/nsfw-v2 done/)]);
    expect(seen.map((s) => s.path)).toHaveLength(1);
  });

  it("reports an HTTP error as a failure and leaves nothing behind", async () => {
    const gone: FetchEntry = { ...hf, id: "gone", file: "gone.safetensors" };
    const outcome = await fetchAll([gone], dir, {}, bases);
    expect(outcome.failed).toEqual([{ id: "gone", reason: "HTTP 404" }]);
    expect(existsSync(path.join(dir, "gone", "gone.safetensors.part"))).toBe(false);
  });

  it("verifies what is on disk, and status says what is there", async () => {
    await fetchAll([hf], dir, {}, bases);
    const tampered: FetchEntry = { ...hf, id: "tampered" };
    mkdirSync(path.join(dir, "tampered"));
    writeFileSync(localPath(dir, tampered), "changed");
    expect(await verify([hf, tampered, civ], dir)).toEqual([
      { id: "nsfw-v2", verdict: "ok" },
      { id: "tampered", verdict: "mismatch" },
      { id: "erect", verdict: "missing" },
    ]);
    expect(plan([hf, civ], dir)).toEqual({ fetched: [hf], missing: [civ] });
    const lines = statusLines([hf, civ], dir);
    expect(lines[0]).toMatch(/^nsfw-v2\s+fetched\s+0\.0 MB\s+Mirror\/Repo$/);
    expect(lines[1]).toMatch(/^erect\s+missing\s+civitai version 3348119$/);
  });
});

describe("envValue and readEnvToken (CHORE_005)", () => {
  it("reads one variable from .env text, stripping quotes and an export, and ignores everything else", () => {
    expect(envValue("CIVITAI_TOKEN=abc123", "CIVITAI_TOKEN")).toBe("abc123");
    expect(envValue('MODEL_API_KEY=x\nCIVITAI_TOKEN="quoted value"\n', "CIVITAI_TOKEN")).toBe("quoted value");
    expect(envValue("export CIVITAI_TOKEN='single'", "CIVITAI_TOKEN")).toBe("single");
    expect(envValue("  CIVITAI_TOKEN = spaced  \r\n", "CIVITAI_TOKEN")).toBe("spaced");
    expect(envValue("CIVITAI_TOKEN=a=b", "CIVITAI_TOKEN")).toBe("a=b");
  });

  it("has none for a commented-out, empty or missing entry, or a name that only starts the same", () => {
    expect(envValue("# CIVITAI_TOKEN=old", "CIVITAI_TOKEN")).toBeUndefined();
    expect(envValue("CIVITAI_TOKEN=", "CIVITAI_TOKEN")).toBeUndefined();
    expect(envValue('CIVITAI_TOKEN=""', "CIVITAI_TOKEN")).toBeUndefined();
    expect(envValue("MODEL_API_KEY=x", "CIVITAI_TOKEN")).toBeUndefined();
    expect(envValue("CIVITAI_TOKEN_OLD=x", "CIVITAI_TOKEN")).toBeUndefined();
    expect(envValue("", "CIVITAI_TOKEN")).toBeUndefined();
  });

  it("reads the key from a .env file, and has none for an unset or unreadable path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qwen-env-"));
    try {
      writeFileSync(path.join(dir, ".env"), "MODEL_BASE_URL=http://x\nCIVITAI_TOKEN=from-env\n");
      expect(readEnvToken(path.join(dir, ".env"))).toBe("from-env");
      expect(readEnvToken(path.join(dir, "nope"))).toBeUndefined();
      expect(readEnvToken(undefined)).toBeUndefined();
      expect(readEnvToken("")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readToken", () => {
  it("reads and trims a token file, and has none for an unset, empty or unreadable path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qwen-token-"));
    try {
      writeFileSync(path.join(dir, "t"), "  secret-value\n");
      writeFileSync(path.join(dir, "empty"), "\n");
      expect(readToken(path.join(dir, "t"))).toBe("secret-value");
      expect(readToken(path.join(dir, "empty"))).toBeUndefined();
      expect(readToken(path.join(dir, "nope"))).toBeUndefined();
      expect(readToken(undefined)).toBeUndefined();
      expect(readToken("")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
