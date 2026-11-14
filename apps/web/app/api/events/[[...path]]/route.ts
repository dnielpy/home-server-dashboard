import type { NextRequest } from "next/server";

import { forward } from "@/lib/api";

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: NextRequest, ctx: Context, method: "GET" | "POST") {
  const { path = [] } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  return forward(`/events${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${request.nextUrl.search}`, method);
}

export function GET(request: NextRequest, ctx: Context) {
  return handle(request, ctx, "GET");
}

export function POST(request: NextRequest, ctx: Context) {
  return handle(request, ctx, "POST");
}
