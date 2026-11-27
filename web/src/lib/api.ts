const BASE: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (hasBody ? 'POST' : 'GET'),
      credentials: 'include',
      headers: { 'x-dv': '1', ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? 'Error inesperado', data.code);
  }
  return data as T;
}

/** POST que devuelve un archivo (p. ej. Excel) y lo descarga en el navegador */
export async function downloadFile(path: string, body: unknown, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-dv': '1', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? 'Error inesperado', data.code);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('x-filename') ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const errorText =(e: unknown) => (e instanceof Error ? e.message : 'Error inesperado');
