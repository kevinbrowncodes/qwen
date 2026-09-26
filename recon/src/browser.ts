import { chromium, type BrowserContext, type Page } from "playwright";
import { PROFILE_DIR, REFERENCE_URL, VIEWPORT } from "./config.ts";
import type { SessionSignals } from "./session.ts";

/**
 * Opens the reference in a persistent-profile Chromium. `channel: "chromium"`
 * makes the headed login and the headless check use the same binary, so the
 * profile one writes the other can read. The reference serves a mobile-app
 * pitch page to non-browser clients (observed 2026-09-26), so recon always
 * goes through a real desktop-shaped browser.
 */
export async function openReference(headless: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    channel: "chromium",
    viewport: { ...VIEWPORT },
    locale: "en-US",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  return { context, page };
}

/**
 * The home marker: a control whose accessible name is exactly "New Chat"
 * (observed 2026-09-26, logged out: an icon button in the top bar). Signed in
 * may render more than one such control, so the locator takes the first.
 */
function homeMarker(page: Page) {
  const name = /^new chat$/i;
  return page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
}

/** Waits up to `timeoutMs` for the home to render (the "New Chat" control). */
export async function waitForHome(page: Page, timeoutMs: number): Promise<boolean> {
  return homeMarker(page)
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

/** Reads the signals the session classifier needs. Never touches cookies or storage. */
export async function readSessionSignals(page: Page): Promise<SessionSignals> {
  const homeRendered = await homeMarker(page).isVisible({ timeout: 1_000 }).catch(() => false);
  const control = page.getByText(/^\s*log in\s*$/i).first();
  const logInControlVisible = await control.isVisible({ timeout: 1_000 }).catch(() => false);
  return { url: page.url(), homeRendered, logInControlVisible };
}
