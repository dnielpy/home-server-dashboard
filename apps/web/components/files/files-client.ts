// The Files explorer's shared parts: its button styles and the calls to the external disk through /api/files.

export const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition disabled:pointer-events-none disabled:opacity-40";
export const BUTTON_TONES = {
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/30 hover:bg-violet-500/15 dark:text-violet-300",
  neutral: "bg-surface text-foreground ring-surface-border hover:bg-surface-hover",
  red: "bg-red-500/10 text-red-600 ring-red-500/30 hover:bg-red-500/15 dark:text-red-400",
};
export const INPUT =
  "min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1 text-sm text-foreground ring-1 ring-surface-border outline-none ring-inset focus:ring-violet-500/60";

export class FilesRequestError extends Error {}

export async function callFiles<T>(
  action: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/files${action}?${new URLSearchParams(params)}`, { method, cache: "no-store" });
  } catch {
    throw new FilesRequestError("Could not reach the dashboard");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new FilesRequestError(body?.detail ?? `The dashboard answered ${response.status}`);
  return body as T;
}

export function message(error: unknown): string {
  return error instanceof FilesRequestError ? error.message : "Something went wrong";
}

export function join(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export function folderHref(path: string): string {
  return path ? `/files?${new URLSearchParams({ path })}` : "/files";
}
