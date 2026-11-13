import { SourceUnavailableError } from "@/lib/api";
import { streamSpeedTest } from "@/lib/homenet-api";

// Passes the Home Net API's NDJSON stream straight through, so the browser sees the speed while fast.com measures
export async function POST(request: Request) {
  try {
    const upstream = await streamSpeedTest(request.signal);
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
