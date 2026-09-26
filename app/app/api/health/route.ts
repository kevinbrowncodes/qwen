import { health } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(health());
}
