import { SourceUnavailableError } from "@/lib/api";
import { getLiveHop } from "@/lib/homenet-api";
import { isHopName } from "@/lib/network/hops";

// The browser cannot reach the Home Net API, so the pings of the connection chain go through here
export async function GET(_request: Request, ctx: RouteContext<"/api/network/hops/[hop]">) {
  const { hop } = await ctx.params;
  if (!isHopName(hop)) {
    return Response.json({ detail: `Unknown hop ${hop}` }, { status: 404 });
  }

  try {
    return Response.json(await getLiveHop(hop));
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
