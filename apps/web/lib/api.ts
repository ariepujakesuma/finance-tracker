export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Calls the NestJS API through this app's /api proxy, so the session cookie is sent. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = data?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg || `Gagal (${res.status}). Coba lagi.`);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export type AuthStatus = {
  hasPin: boolean;
  hint: string;
  authenticated: boolean;
  lockedUntil: string | null;
  setupKeyRequired: boolean;
};
