/**
 * recon/run.sh hands <date> preflight | look | act | js | routine  (STORY_027 and STORY_028, EPIC_006)
 *
 * The recon client for Hands, the owner's tool that works the Mac the way a person does. Online to Hands only
 * (HANDS_URL from the repo's .env, mounted read-only by run.sh); it never addresses the reference. Every look is
 * saved under recon/out/<date>/hands/ the moment it arrives. The logic is in hands-client.ts; this file wires the
 * real file system and fetch.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OUT_DIR, RECON_ROOT } from "./config.ts";
import { type Files, runHands, USAGE } from "./hands-client.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const [date, ...rest] = process.argv.slice(2);
if (date === undefined || !DATE.test(date)) {
  console.error(USAGE);
  process.exitCode = 2;
} else {
  const envFile = process.env["HANDS_ENV_FILE"];
  let env = "";
  try {
    env = envFile === undefined || envFile === "" ? "" : readFileSync(envFile, "utf8");
  } catch {
    env = "";
  }
  const files: Files = {
    list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    read: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    write: (file, data) => {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data);
    },
    append: (file, line) => {
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, line);
    },
  };
  process.exitCode = await runHands(rest, {
    env,
    files,
    fetch: (url, init) => fetch(url, init),
    outDir: path.join(OUT_DIR, date, "hands"),
    readsDir: path.join(RECON_ROOT, "hands", "reads"),
    routinesDir: path.join(RECON_ROOT, "hands", "routines"),
    out: (line) => {
      console.log(line);
    },
    now: () => new Date().toISOString(),
  });
}
