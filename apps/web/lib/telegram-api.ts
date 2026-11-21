export type TelegramCommand = {
  name: string;
  description: string;
  enabled: boolean;
};

export type TelegramStatus = {
  state: "unconfigured" | "connecting" | "connected" | "reconnecting" | "error" | "stopped";
  bot_name: string | null;
  bot_username: string | null;
  started_at: string | null;
  uptime_seconds: number;
  total_requests: number;
  error: string | null;
  missing_settings: string[];
  menu_synced: boolean;
};

export type TelegramCandidate = {
  user_id: number;
  telegram_name: string | null;
  username: string | null;
};

export type TelegramUser = TelegramCandidate & { name: string };

export type TelegramEnrollment = {
  state: "closed" | "waiting" | "captured";
  opened_at: string | null;
  expires_at: string | null;
  candidate: TelegramCandidate | null;
  notice: string | null;
};

export async function callTelegram<T>(
  path: string,
  { signal, body, method }: {
    signal?: AbortSignal;
    body?: { enabled: boolean } | { user_id: number; name: string };
    method?: "GET" | "POST" | "PATCH" | "DELETE";
  } = {},
): Promise<T> {
  const response = await fetch(`/api/telegram/${path}`, {
    method: method ?? (body === undefined ? "GET" : "PATCH"),
    cache: "no-store",
    signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "No se pudo consultar Telegram.");
  }
  return data as T;
}
