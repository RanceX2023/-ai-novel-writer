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

export interface BinaryFetchOptions extends RequestInit {
  onProgress?: (progress: { loaded: number; total?: number }) => void;
}

export interface BinaryFetchResult {
  blob: Blob;
  fileName?: string;
  contentType?: string;
}

function parseContentDispositionFileName(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const filenameStarMatch = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (filenameStarMatch) {
    const raw = filenameStarMatch[1].trim().replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
      return raw;
    }
  }
  const filenameMatch = header.match(/filename="?([^";]+)"?/i);
  if (filenameMatch) {
    return filenameMatch[1].trim();
  }
  return undefined;
}

export async function fetchBinary(path: string, options: BinaryFetchOptions = {}): Promise<BinaryFetchResult> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/octet-stream');
  }

  const response = await fetch(url, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  });

  const requestId = response.headers.get('x-request-id');

  if (!response.ok) {
    const rawBody = await response.text();
    let message = `请求失败，状态码 ${response.status}`;
    let code: string | undefined;
    let details: unknown;

    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { message?: string; code?: string; details?: unknown };
        if (parsed.message) {
          message = parsed.message;
        }
        if (parsed.code) {
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

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const fileName = parseContentDispositionFileName(response.headers.get('content-disposition'));

  if (!response.body) {
    const blob = await response.blob();
    options.onProgress?.({ loaded: blob.size, total: blob.size });
    return { blob, fileName, contentType };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : undefined;
  const resolvedTotal = Number.isFinite(total) && total! > 0 ? total : undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        if (options.onProgress) {
          options.onProgress({ loaded, total: resolvedTotal });
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const blob = new Blob(chunks, { type: contentType });
  if (options.onProgress) {
    options.onProgress({ loaded: blob.size, total: resolvedTotal });
  }

  return { blob, fileName, contentType };
}
