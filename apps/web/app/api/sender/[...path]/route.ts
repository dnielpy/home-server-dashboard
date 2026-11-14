import type { NextRequest } from "next/server";

import { proxy } from "@/lib/api";

// Sender runs in the browser, which cannot reach the API; uploads and downloads stream through here
async function handle(request: NextRequest, ctx: RouteContext<"/api/sender/[...path]">) {
  const { path } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  return proxy(`/sender/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
