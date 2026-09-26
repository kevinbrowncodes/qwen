import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The recon package root (the directory holding package.json). */
export const RECON_ROOT = path.resolve(here, "..");

/** Persistent Chromium profile holding the owner's session. Gitignored. Never read by code. */
export const PROFILE_DIR = path.join(RECON_ROOT, ".profile");

/** Raw capture output (DOM dumps, HARs, downloaded media). Gitignored. */
export const OUT_DIR = path.join(RECON_ROOT, "out");

export const REFERENCE_URL = "https://chat.qwen.ai/";

export const VIEWPORT = { width: 1440, height: 900 } as const;
