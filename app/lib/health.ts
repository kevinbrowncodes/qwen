/** The body of GET /api/health (STORY_005): liveness only, so it names nothing about the host or the model. */
export type Health = { readonly status: "ok" };

export function health(): Health {
  return { status: "ok" };
}
