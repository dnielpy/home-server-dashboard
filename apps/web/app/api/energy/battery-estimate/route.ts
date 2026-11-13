import { SourceUnavailableError } from "@/lib/api";
import { getBatteryEstimate } from "@/lib/bluetti-api";

// The runtime card refreshes in the browser, which cannot reach the Bluetti API, so the estimate goes through here
export async function GET() {
  try {
    return Response.json(await getBatteryEstimate(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
