import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { reducer, type Action } from './lib/reducer';
import { localRepository, type Repository } from './lib/storage';
import type { AppData } from './lib/types';

interface Store {
  data: AppData;
  dispatch: (action: Action) => void;
  toast: (message: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children, repository = localRepository }: { children: ReactNode; repository?: Repository }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => repository.load());
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => repository.save(data), [data, repository]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);

  const toast = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const value = useMemo(() => ({ data, dispatch, toast }), [data, toast]);
  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="toast" role="status" aria-live="polite" data-visible={message ? 'true' : 'false'}>
        {message}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
