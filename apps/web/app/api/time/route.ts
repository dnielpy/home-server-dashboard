import { connection } from "next/server";

// The server's clock, for the browsers whose own is wrong (see lib/server-clock.ts)
export async function GET() {
  await connection();
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
