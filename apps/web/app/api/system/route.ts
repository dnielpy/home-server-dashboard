import { forward } from "@/lib/api";

// The server cards ask every second from the browser, which cannot reach the API directly
export function GET() {
  return forward("/dashboard/system", "GET");
}
