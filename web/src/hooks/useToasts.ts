import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'danger';
  /** Action facultative, par exemple « Annuler » après un déplacement. */
  action?: { label: string; run: () => void };
}

const DEFAULT_DURATION = 5000;

export interface ToastsState {
  toasts: Toast[];
  notify: (toast: Omit<Toast, 'id'>, duration?: number) => number;
  dismiss: (id: number) => void;
}

/** File de messages courts affichés en bas de l'écran. */
export function useToasts(): ToastsState {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>, duration = DEFAULT_DURATION) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}
