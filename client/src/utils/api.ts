export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

export interface FetchOptions extends RequestInit {
  body?: string;
}

export async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `请求失败，状态码 ${response.status}`;
    if (errorText) {
      try {
        const parsed = JSON.parse(errorText) as { message?: string };
        if (parsed.message) {
          message = parsed.message;
        }
      } catch {
        message = errorText;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}
