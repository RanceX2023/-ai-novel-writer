export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

export interface FetchOptions extends RequestInit {
  body?: string;
}

export class HttpError extends Error {
  status: number;

  requestId?: string;

  code?: string;

  details?: unknown;

  constructor(message: string, status: number, options: { requestId?: string | null; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (options.requestId && options.requestId.trim()) {
      this.requestId = options.requestId.trim();
    }
    if (options.code) {
      this.code = options.code;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
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

  const requestId = response.headers.get('x-request-id');
  const rawBody = await response.text();

  if (!response.ok) {
    let message = `请求失败，状态码 ${response.status}`;
    let code: string | undefined;
    let details: unknown;

    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { message?: string; code?: string; details?: unknown };
        if (parsed.message) {
          message = parsed.message;
        }
        if (parsed.code && typeof parsed.code === 'string') {
          code = parsed.code;
        }
        if (parsed.details !== undefined) {
          details = parsed.details;
        }
      } catch {
        message = rawBody;
      }
    }

    throw new HttpError(message, response.status, { requestId, code, details });
  }

  if (!rawBody || response.status === 204) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new HttpError('响应解析失败，请稍后重试。', response.status, {
      requestId,
      details: rawBody,
    });
  }
}
