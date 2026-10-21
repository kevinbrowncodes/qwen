/**
 * Merging two model servers' job indexes (STORY_037): the Spark's jobs.json joins the Mac Studio 2026's, so every image
 * made on the Spark is served from the 2026 after its PNG is copied across. Results are named by file only, so an entry
 * moves as it is. The 2026's own entries come first and win on an id clash; anything that is not a job with an id is
 * dropped, as Jobs.fromIndex would skip it.
 */
const isEntry = (v: unknown): v is { readonly id: string } & Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as Record<string, unknown>)["id"] === "string";

/** The merged index text, and how many entries each side contributed. */
export function mergeIndexes(here: string, incoming: string): { readonly text: string; readonly kept: number; readonly added: number } {
  const parse = (text: string): unknown[] => {
    try {
      const v: unknown = JSON.parse(text);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const mine = parse(here).filter(isEntry);
  const seen = new Set(mine.map((e) => e.id));
  const theirs = parse(incoming).filter(isEntry).filter((e) => !seen.has(e.id));
  return { text: JSON.stringify([...mine, ...theirs]), kept: mine.length, added: theirs.length };
}
