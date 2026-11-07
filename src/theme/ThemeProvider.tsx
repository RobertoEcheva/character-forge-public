import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark';
export type ModeSetting = Mode | 'auto';

const KEY = 'dndb.theme';

export function loadMode(): ModeSetting {
  try {
    const v = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { mode?: unknown }).mode;
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function saveMode(mode: ModeSetting) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode }));
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

const systemMode = (): Mode => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** Sets light or dark on <html>. Called before the first render so the page never flashes. */
export function applyMode(mode: ModeSetting) {
  document.documentElement.dataset.mode = mode === 'auto' ? systemMode() : mode;
}

interface ThemeApi {
  mode: ModeSetting;
  setMode: (m: ModeSetting) => void;
}

const Ctx = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ModeSetting>(loadMode);
  const [sys, setSys] = useState<Mode>(systemMode);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    applyMode(mode);
    saveMode(mode);
  }, [mode, sys]);

  const api = useMemo(() => ({ mode, setMode }), [mode]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
