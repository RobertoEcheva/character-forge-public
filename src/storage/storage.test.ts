import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customLoadIssue, loadCharacters, loadCustom, parseCharacterImport } from './storage';
import { newCharacter } from '../types/character';

// A plain in-memory localStorage, so these tests don't depend on the runtime's own.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const feat = (id: string) => ({ id, name: id, source: 'custom', type: 'general', repeatable: false, description: 'x' });

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('loadCustom', () => {
  it('keeps the valid entries when one entry is broken, and backs up the original', () => {
    const raw = JSON.stringify({ feats: [feat('good-one'), { id: 'Broken Id!', name: '' }, feat('good-two')] });
    localStorage.setItem('dndb.custom', raw);
    const c = loadCustom();
    expect(c.feats?.map((f) => f.id)).toEqual(['good-one', 'good-two']);
    expect(localStorage.getItem('dndb.custom.backup')).toBe(raw);
    expect(customLoadIssue()).toEqual({ dropped: 1 });
  });

  it('reports nothing when the content is valid', () => {
    localStorage.setItem('dndb.custom', JSON.stringify({ feats: [feat('good-one')] }));
    expect(loadCustom().feats).toHaveLength(1);
    expect(customLoadIssue()).toBeNull();
    expect(localStorage.getItem('dndb.custom.backup')).toBeNull();
  });
});

describe('loadCustom with unreadable JSON', () => {
  it('backs up content that is not valid JSON before anything can overwrite it', () => {
    localStorage.setItem('dndb.custom', '{"feats": [{"id": "cut-off');
    expect(loadCustom()).toEqual({});
    expect(localStorage.getItem('dndb.custom.backup')).toBe('{"feats": [{"id": "cut-off');
  });

  it('does not report a problem when nothing was dropped', () => {
    localStorage.setItem('dndb.custom', '[]');
    loadCustom();
    expect(customLoadIssue()).toBeNull();
  });
});

describe('rules edition on characters', () => {
  it('repairs a stored character with an unknown ruleset', () => {
    localStorage.setItem('dndb.characters', JSON.stringify({ a: { ...newCharacter('a'), ruleset: '5e' } }));
    expect(loadCharacters().a.ruleset).toBe('2024');
  });

  it('rejects an import with an unknown ruleset', () => {
    expect(parseCharacterImport({ ...newCharacter('a'), ruleset: '5e' })).toMatch(/Unknown rules edition/);
    expect(typeof parseCharacterImport({ ...newCharacter('a'), ruleset: '2014' })).toBe('object');
  });
});
