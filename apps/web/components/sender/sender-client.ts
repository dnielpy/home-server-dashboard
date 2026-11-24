"use client";

import type { SenderFile } from "@/lib/api";

export class SenderRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function detail(body: unknown, status: number): string {
  const value = (body as { detail?: unknown } | null)?.detail;
  if (typeof value === "string") return value;
  // FastAPI's validation errors come as a list
  if (Array.isArray(value) && typeof value[0]?.msg === "string") return value[0].msg;
  return `The dashboard answered ${status}`;
}

/** Calls Sender in the API through the web app's /api/sender. Throws SenderRequestError, with status 0 when the web
 * app itself could not be reached. */
export async function callSender<T>(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/sender/${path}`, {
      method,
      cache: "no-store",
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SenderRequestError(0, "Could not reach the dashboard");
  }
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new SenderRequestError(response.status, detail(json, response.status));
  return json as T;
}

/** Uploads a file to a package under a name, which may have the folders it came in, reporting the bytes sent; fetch
 * cannot follow an upload's progress, XHR can. */
export function uploadFile(
  packageId: string,
  file: File,
  name: string,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<SenderFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query = new URLSearchParams({ name, size: String(file.size) });
    xhr.open("POST", `/api/sender/packages/${packageId}/files?${query}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as SenderFile);
      else reject(new SenderRequestError(xhr.status, detail(body, xhr.status)));
    };
    xhr.onerror = () => reject(new SenderRequestError(0, "The upload was cut"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export function downloadUrl(packageId: string, fileId: string, token: string): string {
  return `/api/sender/packages/${packageId}/files/${fileId}?${new URLSearchParams({ token })}`;
}
