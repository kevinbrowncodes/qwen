/**
 * The last check before anything recon writes lands in docs/recon/ (STORY_002).
 *
 * The owner's display name and avatar are read from their own saved page at
 * run time, never typed into code or a test, and never printed. If either
 * turns up in any output, nothing is written. Its error names the file, not
 * the secret: a guard whose message leaks what it guards has failed open.
 */

export type Identity = {
  /** The display name as the page shows it. */
  displayName: string;
  /** The avatar image's src (a data: URI in the saved page). */
  avatarSrc: string;
};

/** Values shorter than this are too likely to occur by chance to guard on. */
export const MIN_GUARDED_LENGTH = 3;

function needles(identity: Identity): string[] {
  const out: string[] = [];
  const name = identity.displayName.trim();
  if (name.length >= MIN_GUARDED_LENGTH) {
    out.push(name);
    // The same name as it would sit inside a JSON string or an HTML attribute.
    const jsonEscaped = JSON.stringify(name).slice(1, -1);
    if (jsonEscaped !== name) out.push(jsonEscaped);
    const htmlEscaped = name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    if (htmlEscaped !== name) out.push(htmlEscaped);
  }
  if (identity.avatarSrc.length >= MIN_GUARDED_LENGTH) {
    // A data URI's payload is what identifies; its prefix is common to every PNG.
    const comma = identity.avatarSrc.indexOf(",");
    const payload = comma >= 0 ? identity.avatarSrc.slice(comma + 1) : identity.avatarSrc;
    out.push(payload.length > 64 ? payload.slice(0, 64) : payload);
  }
  return out;
}

/**
 * Links to images generated on the reference. They never enter git (CLAUDE.md
 * §3e), and their paths carry the account's ids, so they fail the guard too.
 */
export const FORBIDDEN_LINKS = [/cdn\.qwenlm\.ai\/output\//];

export function containsIdentity(content: string, identity: Identity): boolean {
  return needles(identity).some((n) => content.includes(n)) || FORBIDDEN_LINKS.some((re) => re.test(content));
}

export class IdentityLeakError extends Error {
  readonly files: string[];
  constructor(files: string[]) {
    super(`identity guard: the owner's identity appears in ${files.length} output file(s): ${files.join(", ")}. Nothing was written.`);
    this.name = "IdentityLeakError";
    this.files = files;
  }
}

/** Throws IdentityLeakError naming every output file that carries the identity. */
export function assertNoIdentity(outputs: ReadonlyMap<string, string | Uint8Array>, identity: Identity): void {
  const leaking: string[] = [];
  for (const [file, content] of outputs) {
    const text = typeof content === "string" ? content : Buffer.from(content).toString("latin1");
    if (containsIdentity(text, identity)) leaking.push(file);
  }
  if (leaking.length > 0) throw new IdentityLeakError(leaking.sort());
}
