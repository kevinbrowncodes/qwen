/**
 * One variable's value from the text of a .env file (STORY_027). A copy of CHORE_005's parser in
 * spark/model-server/src/fetch-loras.ts: recon is its own workspace package, installed in its own container, so it
 * does not import across packages. `NAME=value` or `export NAME=value`, surrounding quotes stripped; none for a
 * missing, commented-out or empty entry; every other line is ignored, and nothing in the file is ever executed.
 */
export function envValue(text: string, name: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match?.[1] !== name) continue;
    let value = (match[2] ?? "").trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    return value === "" ? undefined : value;
  }
  return undefined;
}
