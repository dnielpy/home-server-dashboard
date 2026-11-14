export async function astroApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/astro${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Astro respondió ${response.status}`);
  return payload as T;
}

export type AstroSession = {
  id: string;
  title: string;
  archived: boolean;
  sessionId: string;
  updatedAt?: number;
  hasActiveRun: boolean;
};

export type AstroMessage = {
  role: string;
  content: string | { type: string; text?: string }[];
  timestamp?: number;
  display?: boolean;
};

export function messageText(message: AstroMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return (message.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n");
}
