import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastMessage {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastRecord {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (message: ToastMessage) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_DURATION = 4000;

export const ToastProvider = ({ children }: PropsWithChildren) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timeoutRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timeoutId = timeoutRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutRef.current.delete(id);
    }
  }, []);

  const scheduleRemoval = useCallback((id: string, duration: number) => {
    if (timeoutRef.current.has(id)) {
      window.clearTimeout(timeoutRef.current.get(id));
    }
    const timeoutId = window.setTimeout(() => {
      removeToast(id);
    }, duration);
    timeoutRef.current.set(id, timeoutId);
  }, [removeToast]);

  const pushToast = useCallback(
    ({ id, title, description, variant = 'info', duration = DEFAULT_DURATION }: ToastMessage) => {
      const resolvedId = id ?? generateId();
      setToasts((current) => {
        const exists = current.some((toast) => toast.id === resolvedId);
        if (exists) {
          return current.map((toast) =>
            toast.id === resolvedId
              ? { ...toast, title, description, variant, duration }
              : toast
          );
        }
        return [
          ...current,
          {
            id: resolvedId,
            title,
            description,
            variant,
            duration,
          },
        ];
      });
      scheduleRemoval(resolvedId, duration);
      return resolvedId;
    },
    [scheduleRemoval]
  );

  useEffect(() => {
    return () => {
      timeoutRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: pushToast,
      dismiss: removeToast,
    }),
    [pushToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[999] flex flex-col items-center gap-3 px-4">
        {toasts.map((toast) => {
          const variantStyles =
            toast.variant === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
              : toast.variant === 'error'
              ? 'border-rose-500/40 bg-rose-600/20 text-rose-100'
              : 'border-slate-500/40 bg-slate-800/80 text-slate-100';
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${variantStyles}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-5">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-1 text-xs leading-5 text-slate-200/80">{toast.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="关闭提示"
                  className="-mr-1 rounded-full p-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                  onClick={() => removeToast(toast.id)}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
