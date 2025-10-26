import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novel-runtime-api-key';

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined';
}

function readStoredValue(): string {
  if (!isBrowserEnvironment()) {
    return '';
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useRuntimeApiKey() {
  const [runtimeApiKey, setRuntimeApiKeyState] = useState<string>(() => readStoredValue());

  useEffect(() => {
    if (!isBrowserEnvironment()) {
      return;
    }
    setRuntimeApiKeyState(readStoredValue());
  }, []);

  const setRuntimeApiKey = useCallback((value: string) => {
    setRuntimeApiKeyState(value);

    if (!isBrowserEnvironment()) {
      return;
    }

    const trimmed = value.trim();
    try {
      if (trimmed) {
        window.sessionStorage.setItem(STORAGE_KEY, trimmed);
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const clearRuntimeApiKey = useCallback(() => {
    setRuntimeApiKeyState('');

    if (!isBrowserEnvironment()) {
      return;
    }

    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage quota errors
    }
  }, []);

  return {
    runtimeApiKey,
    setRuntimeApiKey,
    clearRuntimeApiKey,
  } as const;
}
