/**
 * The server side of the app's API routes (STORY_007): every call to the generation server goes through here. Reads
 * the base URL and key from config, adds the bearer header, and turns failures into the contract's error shape. The
 * upstream URL never appears in a response.
 */
import { ConfigError, readConfig } from "./config";
import { isApiError } from "./job-api";

export interface RouteError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export function errorResponse({ status, code, message, field }: RouteError): Response {
  return Response.json({ error: { code, message, ...(field === undefined ? {} : { field }) } }, { status });
}

export const NOT_CONFIGURED = "The generation server is not configured";
export const NOT_REACHABLE = "The generation server is not reachable";

/** Forwards a request upstream. A missing config or a network failure answers 503 busy without saying where. */
export async function forward(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  let config;
  try {
    config = readConfig();
  } catch (error) {
    if (error instanceof ConfigError) return errorResponse({ status: 503, code: "busy", message: NOT_CONFIGURED });
    throw error;
  }
  const headers = new Headers(init.headers);
  if (config.modelApiKey !== undefined) headers.set("authorization", `Bearer ${config.modelApiKey}`);
  try {
    return await fetch(`${config.modelBaseUrl}${pathAndQuery}`, { ...init, headers, redirect: "manual" });
  } catch {
    return errorResponse({ status: 503, code: "busy", message: NOT_REACHABLE });
  }
}

export function badGateway(what: string): Response {
  return errorResponse({ status: 502, code: "bad_gateway", message: `The generation server answered outside the contract (${what}).` });
}

/** Reads an upstream JSON body; undefined when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** An upstream answer that is not 2xx: a contract error keeps its status and body; anything else is a bad gateway. */
export async function relayError(response: Response): Promise<Response> {
  const body = await readJson(response);
  if (isApiError(body)) return Response.json(body, { status: response.status });
  return badGateway(`status ${String(response.status)} without a contract error`);
}

/** Wraps a handler so an unexpected throw becomes a contract error without a stack trace in the body. */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error";
    return errorResponse({ status: 500, code: "internal", message });
  }
}

/** Which stub script to ask for, when a test names one; the model server ignores both. */
export function scriptQuery(request: Request): string {
  const script = request.headers.get("x-stub-script") ?? new URL(request.url).searchParams.get("script");
  return script === null || script === "" ? "" : `?script=${encodeURIComponent(script)}`;
}
