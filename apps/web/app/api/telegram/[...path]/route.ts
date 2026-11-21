import type { NextRequest } from "next/server";

import { proxy } from "@/lib/api";

async function handle(request: NextRequest, ctx: RouteContext<"/api/telegram/[...path]">) {
  const { path } = await ctx.params;
  const validGet = request.method === "GET" && path.length === 1 && ["status", "commands", "users", "enrollment"].includes(path[0]);
  const validPatch = request.method === "PATCH" && path.length === 2 && path[0] === "commands" && /^[a-z0-9_]+$/.test(path[1]);
  const validPost = request.method === "POST" && path.length === 1 && ["users", "enrollment"].includes(path[0]);
  const validDelete = request.method === "DELETE" && (
    (path.length === 1 && path[0] === "enrollment") ||
    (path.length === 2 && path[0] === "users" && /^\d+$/.test(path[1]))
  );
  if (!validGet && !validPatch && !validPost && !validDelete) {
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }
  return proxy(`/telegram/${path.map(encodeURIComponent).join("/")}`, request);
}

export const GET = handle;
export const PATCH = handle;
export const POST = handle;
export const DELETE = handle;
