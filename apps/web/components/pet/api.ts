export async function petApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/pet${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload.detail) ? payload.detail[0]?.msg : payload.detail;
    throw new Error(detail || `El API respondió ${response.status}`);
  }
  return payload as T;
}

export type PetAnimation = {
  id: number;
  title: string;
  code: string;
  source: "seed" | "ai" | "manual";
  enabled: boolean;
  failures: number;
  created_at: string;
  updated_at: string;
};

export type PetMessage = {
  id: number;
  text: string;
  /** "ai" for the ones Astro wrote on its own. */
  source: "ai" | "manual";
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type PetGeneration = {
  id: number;
  started_at: string;
  status: "sent" | "saved" | "failed";
  detail: string | null;
};

/** How long each animation plays; a message lasts a little longer when it is long. */
export const ANIMATION_MS = 10_000;
