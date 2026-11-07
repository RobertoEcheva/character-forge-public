import { describe, expect, it, vi } from 'vitest';
import css from '../index.css?raw';
import { loadMode } from './ThemeProvider';

describe('color mode', () => {
  it('reads the saved mode and falls back to auto', () => {
    localStorage.setItem('dndb.theme', JSON.stringify({ mode: 'dark' }));
    expect(loadMode()).toBe('dark');
    localStorage.setItem('dndb.theme', JSON.stringify({ look: 'ledger', mode: 'auto', imported: [] }));
    expect(loadMode()).toBe('auto');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadMode()).toBe('auto');
    spy.mockRestore();
  });
});

// Text tokens must stay readable (WCAG AA, 4.5:1) on both page backgrounds, light and dark.
describe('color tokens', () => {
  // Raw values: a hex colour or a var(--other) reference, resolved after the dark block is merged in.
  const tokens = (block: string) =>
    Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}|var\(--[\w-]+\))/gi)].map((m) => [m[1], m[2]]));
  const resolve = (t: Record<string, string>) => {
    const get = (v: string, depth = 0): string => {
      const ref = /^var\(--([\w-]+)\)$/.exec(v);
      return ref && depth < 10 && t[ref[1]] ? get(t[ref[1]], depth + 1) : v;
    };
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, get(v)]));
  };
  const lightRaw = tokens(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))));
  const darkStart = css.indexOf(":root[data-mode='dark']");
  const light = resolve(lightRaw);
  const dark = resolve({ ...lightRaw, ...tokens(css.slice(darkStart, css.indexOf('}', darkStart))) });
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it.each([['light', light], ['dark', dark]] as const)('%s text passes AA on bg and surface', (_, t) => {
    for (const text of ['ink', 'ink-2', 'ink-3', 'heading', 'accent', 'danger', 'ok', 'or-ink', 'magic']) {
      for (const bg of ['bg', 'surface']) {
        expect(t[text], `--${text}`).toBeDefined();
        expect(ratio(t[text], t[bg]), `--${text} on --${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
