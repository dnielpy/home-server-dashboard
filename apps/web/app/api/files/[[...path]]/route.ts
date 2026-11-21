import type { NextRequest } from "next/server";

import { proxy } from "@/lib/api";

// The Files page runs in the browser, which cannot reach the API; downloads stream through here
async function handle(request: NextRequest, ctx: RouteContext<"/api/files/[[...path]]">) {
  const { path = [] } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  const rest = path.map((segment) => `/${encodeURIComponent(segment)}`).join("");
  return proxy(`/files${rest}${request.nextUrl.search}`, request);
}

export const GET = handle;
export const POST = handle;
