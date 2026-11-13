import { SourceUnavailableError } from "@/lib/api";
import { getDevices } from "@/lib/homenet-api";

// The browser cannot reach the Home Net API, so the live device list comes through here
export async function GET() {
  try {
    return Response.json(await getDevices(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
