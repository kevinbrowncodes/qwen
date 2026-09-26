import { contentDisposition } from "@/lib/content-disposition";
import { forward, guarded, relayError } from "@/lib/model-client";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }> };

/** GET /api/jobs/:id/result: the image, streamed; `inline` for display, `attachment` with `?download=1`. */
export function GET(request: Request, context: Context): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params;
    const response = await forward(`/jobs/${encodeURIComponent(id)}/result`);
    if (!response.ok) return relayError(response);
    const headers = new Headers();
    for (const name of ["content-type", "content-length", "etag", "last-modified"]) {
      const value = response.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const download = new URL(request.url).searchParams.get("download") === "1";
    headers.set("content-disposition", contentDisposition(id, download ? "attachment" : "inline"));
    headers.set("cache-control", "private, max-age=31536000, immutable");
    return new Response(response.body, { status: 200, headers });
  });
}
