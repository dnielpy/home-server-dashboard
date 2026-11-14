import type { NextRequest } from "next/server";

import { proxy } from "@/lib/api";

// The Downloads page runs in the browser, which cannot reach the API; the files stream through here with their ranges,
// so a download to the device that gets cut can resume
async function handle(request: NextRequest, ctx: RouteContext<"/api/downloads/[[...path]]">) {
  const { path = [] } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  const rest = path.map((segment) => `/${encodeURIComponent(segment)}`).join("");
  return proxy(`/downloads${rest}${request.nextUrl.search}`, request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
