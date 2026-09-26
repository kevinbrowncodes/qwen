/**
 * The only place the app reads the generation server's address (STORY_007). The model endpoint is configuration,
 * never a literal (CLAUDE.md §4a): MODEL_BASE_URL and, optionally, MODEL_API_KEY. HISTORY_FILE says where history is kept.
 */
export interface AppConfig {
  /** Absolute http(s) base URL of the generation server, without a trailing slash. */
  readonly modelBaseUrl: string;
  /** Bearer token sent to the generation server, when one is configured. */
  readonly modelApiKey: string | undefined;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

export function readConfig(env: Env = process.env): AppConfig {
  const raw = env["MODEL_BASE_URL"]?.trim();
  if (raw === undefined || raw === "") throw new ConfigError("MODEL_BASE_URL is not set");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("MODEL_BASE_URL is not an absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ConfigError("MODEL_BASE_URL must use http or https");
  const key = env["MODEL_API_KEY"]?.trim();
  return { modelBaseUrl: raw.replace(/\/+$/, ""), modelApiKey: key === undefined || key === "" ? undefined : key };
}

/** Where history is kept; a file in the working directory when HISTORY_FILE is unset (dev only). */
export function historyFile(env: Env = process.env): string {
  const raw = env["HISTORY_FILE"]?.trim();
  return raw === undefined || raw === "" ? "history.json" : raw;
}
