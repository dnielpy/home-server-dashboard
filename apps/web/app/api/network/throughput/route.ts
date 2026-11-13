import { connection } from "next/server";

import { SourceUnavailableError } from "@/lib/api";
import { streamThroughput } from "@/lib/homenet-api";

// Passes the Home Net API's NDJSON stream straight through, so the page sees the Nano's speed every second
export async function GET(request: Request) {
  await connection();
  try {
    const upstream = await streamThroughput(request.signal);
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
