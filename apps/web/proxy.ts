import { NextResponse, type NextRequest } from "next/server";

// A route handler cannot answer with a Content-Length (Next.js drops it), so the browser would not know a download's
// size. Rewritten to the API instead, the download is piped through as the API sends it, its length included.
export function proxy(request: NextRequest) {
  const target = new URL("/files/download", process.env.API_URL ?? "http://localhost:3021");
  target.search = request.nextUrl.search;
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: "/api/files/download",
};
