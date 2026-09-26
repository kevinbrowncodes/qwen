import { openReference, readSessionSignals } from "./browser.ts";
import { REFERENCE_URL } from "./config.ts";
import { CONFIRMATIONS_REQUIRED, classifySession, countConfirmation, type SessionState } from "./session.ts";

const TIMEOUT_MS = 10 * 60_000;
const POLL_MS = 2_000;

/**
 * Headed: opens the reference in a window the owner signs in to. This script
 * never types, never reads a cookie, never prints a URL beyond the fixed
 * reference address. It only polls the session classifier until it reads
 * signed in for several consecutive polls, then closes the browser so the
 * profile is written to disk.
 */
async function main(): Promise<number> {
  console.log(`A Chromium window is opening on ${REFERENCE_URL}.`);
  console.log("Sign in there with your Qwen account. This script never reads what you type.");
  console.log("Waiting for the session to read as signed in (up to 10 minutes)…");

  const { context, page } = await openReference(false);
  const deadline = Date.now() + TIMEOUT_MS;
  let state: SessionState = "unknown";
  let run = 0;
  let lastReported: SessionState | undefined;
  try {
    while (Date.now() < deadline) {
      try {
        state = classifySession(await readSessionSignals(page));
      } catch {
        state = "unknown"; // mid-navigation; try again on the next tick
      }
      if (state !== lastReported) {
        console.log(`  … session reads as ${state}${state === "signed-in" ? ", confirming" : ""}`);
        lastReported = state;
      }
      run = countConfirmation(run, state);
      if (run >= CONFIRMATIONS_REQUIRED) break;
      await page.waitForTimeout(POLL_MS).catch(() => undefined);
    }
    if (run >= CONFIRMATIONS_REQUIRED) {
      // Give the site a moment to finish writing its session before the profile is flushed.
      await page.waitForTimeout(3_000).catch(() => undefined);
    }
  } finally {
    await context.close();
  }

  if (run >= CONFIRMATIONS_REQUIRED) {
    console.log("Signed in. The session is saved in recon/.profile/ (gitignored). You can close this.");
    return 0;
  }
  console.log(`Timed out after 10 minutes without reading as signed in (last state: ${state}).`);
  console.log("Run pnpm recon:login again when you are ready to sign in.");
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("recon:login failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
