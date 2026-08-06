// Cliente mínimo de la API v2 de Holded (https://api.holded.com/api/v2).
// Auth por API key (env HOLDED_API_KEY) con `Authorization: Bearer`.
// Límite de la API: 100 peticiones/minuto.

const BASE = "https://api.holded.com/api/v2";

export function hasHoldedKey() {
  return Boolean(process.env.HOLDED_API_KEY);
}

export async function holdedFetch<T>(
  path: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    query?: Record<string, string>;
  },
): Promise<T> {
  const key = process.env.HOLDED_API_KEY;
  if (!key) throw new Error("HOLDED_API_KEY no configurada");

  const qs = init?.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Holded ${init?.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 400)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}
