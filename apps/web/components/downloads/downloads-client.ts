"use client";

export class DownloadsRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function detail(body: unknown, status: number): string {
  const value = (body as { detail?: unknown } | null)?.detail;
  if (typeof value === "string") return value;
  // FastAPI's validation errors come as a list, with what Pydantic said before the message ("Value error, …")
  if (Array.isArray(value) && typeof value[0]?.msg === "string") return value[0].msg.replace(/^Value error, /, "");
  return `The dashboard answered ${status}`;
}

/** Calls the Downloader in the API through the web app's /api/downloads. Throws DownloadsRequestError, with status 0
 * when the web app itself could not be reached. */
export async function callDownloads<T>(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/downloads${path ? `/${path}` : ""}`, {
      method,
      cache: "no-store",
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DownloadsRequestError(0, "Could not reach the dashboard");
  }
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new DownloadsRequestError(response.status, detail(json, response.status));
  return json as T;
}

export function fileUrl(downloadId: string): string {
  return `/api/downloads/${downloadId}/file`;
}
