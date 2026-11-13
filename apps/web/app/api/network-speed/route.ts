import { ApiUnavailableError, getNetworkSpeed } from "@/lib/api";

// The browser cannot reach the API directly (in Docker it lives at http://api:3021), so the speed goes through here
export async function GET() {
  try {
    return Response.json(await getNetworkSpeed());
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
