import type { NextRequest } from "next/server";

import { forward } from "@/lib/api";

// The update panel runs in the browser, which cannot reach the API (in Docker it lives at http://api:3021)
async function handle(request: NextRequest, ctx: RouteContext<"/api/management/[...path]">, method: "GET" | "POST") {
  const { path } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  const target = `/management/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  return forward(target, method);
}

export function GET(request: NextRequest, ctx: RouteContext<"/api/management/[...path]">) {
  return handle(request, ctx, "GET");
}

export function POST(request: NextRequest, ctx: RouteContext<"/api/management/[...path]">) {
  return handle(request, ctx, "POST");
}
