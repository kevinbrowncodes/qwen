/**
 * The model server never listens beyond loopback without a key (STORY_036). On the Spark, Docker published it on
 * 127.0.0.1 only; natively on the Mac Studio 2026 it listens on the LAN, where the app on the Mac Studio 2022 reaches
 * it, so every request there must carry MODEL_API_KEY as a bearer token.
 */
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** Null when listening on `host` is allowed, else the message to exit with: the rule, and the fix. */
export function bindProblem(host: string, apiKey: string | undefined): string | null {
  if (apiKey !== undefined && apiKey !== "") return null;
  if (LOOPBACK.has(host.trim().toLowerCase())) return null;
  return [
    `[model] refusing to listen on ${host} without MODEL_API_KEY: beyond loopback, every request must carry the key (STORY_036).`,
    "[model] Fix: set MODEL_API_KEY (the Mac Studio 2026 reads it from ~/qwen-model/.env), or listen on HOST=127.0.0.1.",
  ].join("\n");
}
