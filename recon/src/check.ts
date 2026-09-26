import { openReference, readSessionSignals, waitForHome } from "./browser.ts";
import { classifySession, exitCodeFor, type SessionState } from "./session.ts";

/**
 * Headless: opens the reference with the saved profile and prints one line,
 * `session: signed-in | signed-out | unknown`, exiting 0 / 1 / 2. Prints
 * nothing else — no URLs, no cookie names.
 */
async function main(): Promise<number> {
  const { context, page } = await openReference(true);
  let state: SessionState = "unknown";
  try {
    await waitForHome(page, 20_000);
    await page.waitForTimeout(1_500);
    state = classifySession(await readSessionSignals(page));
  } finally {
    await context.close();
  }
  console.log(`session: ${state}`);
  return exitCodeFor(state);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("recon:check failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
