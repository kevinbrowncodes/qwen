import { forward, guarded, readJson, relayError, badGateway } from "@/lib/model-client";

export const dynamic = "force-dynamic";

/** GET /api/capabilities: the generation server's capabilities, passed through (STORY_007). */
export function GET(): Promise<Response> {
  return guarded(async () => {
    const response = await forward("/capabilities");
    if (!response.ok) return relayError(response);
    const body = await readJson(response);
    if (typeof body !== "object" || body === null) return badGateway("capabilities is not an object");
    return Response.json(body);
  });
}
