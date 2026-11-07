import type { CustomContent } from '../data/registry';
import { customContentSchema } from '../data/schema';
import { CHARACTER_VERSION, emptyPlayState, newCharacter, type Character } from '../types/character';
import { EDITIONS } from '../types/rules';

const CHARACTERS_KEY = 'dndb.characters';
const CUSTOM_KEY = 'dndb.custom';
const CUSTOM_BACKUP_KEY = 'dndb.custom.backup';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Fill fields added after a character was saved. */
export function migrateCharacter(saved: Character): Character {
  const c = saved as Partial<Character> & Pick<Character, 'id'>;
  const base = newCharacter(c.id);
  return {
    ...base,
    ...c,
    version: CHARACTER_VERSION,
    // An unknown edition would break every page that looks up its rules.
    ruleset: c.ruleset && EDITIONS.includes(c.ruleset) ? c.ruleset : '2024',
    coins: { ...base.coins, ...c.coins },
    details: { ...base.details, ...c.details },
    play: { ...emptyPlayState(), ...c.play },
  };
}

export function loadCharacters(): Record<string, Character> {
  const all = read<Record<string, Character>>(CHARACTERS_KEY, {});
  return Object.fromEntries(Object.entries(all).map(([id, c]) => [id, migrateCharacter(c)]));
}

export const saveCharacters = (all: Record<string, Character>) => write(CHARACTERS_KEY, all);

export interface CustomLoadIssue {
  /** Entries left out because they no longer validate. */
  dropped: number;
  /** True when the stored text wasn't readable JSON at all. */
  unreadable?: boolean;
}
let lastCustomIssue: CustomLoadIssue | null = null;

/** Set when the last loadCustom had to leave out content it couldn't read (a backup was kept). */
export const customLoadIssue = () => lastCustomIssue;
/** Called after custom content is saved again: the stored data is valid now. */
export const clearCustomLoadIssue = () => void (lastCustomIssue = null);

function backupCustom(original: string | null) {
  try {
    if (original) localStorage.setItem(CUSTOM_BACKUP_KEY, original);
  } catch {
    // Storage unavailable: nothing to protect.
  }
}

/**
 * Loads custom content. If it doesn't validate as a whole (an old or hand-edited entry), the
 * original is copied to a backup key first and every entry that still validates is kept, so one
 * bad entry can't wipe the rest on the next save.
 */
export function loadCustom(): CustomContent {
  lastCustomIssue = null;
  let original: string | null = null;
  let raw: unknown = {};
  try {
    original = localStorage.getItem(CUSTOM_KEY);
    if (original) raw = JSON.parse(original);
  } catch {
    // Unreadable text (a cut-off write, a bad hand edit): keep it before the next save replaces it.
    backupCustom(original);
    if (original) lastCustomIssue = { dropped: 0, unreadable: true };
    return {};
  }
  const parsed = customContentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  backupCustom(original);
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown[]> = {};
  let dropped = 0;
  for (const [key, field] of Object.entries(customContentSchema.shape)) {
    const entries = source[key];
    if (!Array.isArray(entries)) {
      if (entries !== undefined) dropped++;
      continue;
    }
    const entry = field.unwrap().element;
    const kept = entries.flatMap((e) => {
      const r = entry.safeParse(e);
      return r.success ? [r.data] : [];
    });
    dropped += entries.length - kept.length;
    if (kept.length) out[key] = kept;
  }
  lastCustomIssue = dropped > 0 ? { dropped } : null;
  return out as CustomContent;
}

export const saveCustom = (c: CustomContent) => write(CUSTOM_KEY, c);

export function downloadBlob(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json');
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => JSON.parse(t));
}

/** Validates an imported character file enough to render it. */
export function parseCharacterImport(data: unknown): Character | string {
  if (!data || typeof data !== 'object') return 'File is not a character export.';
  const c = data as Partial<Character>;
  if (typeof c.id !== 'string' || !Array.isArray(c.levels) || typeof c.baseAbilities !== 'object')
    return 'File is missing character fields (id, levels, baseAbilities).';
  if (c.ruleset !== undefined && !EDITIONS.includes(c.ruleset))
    return `Unknown rules edition "${String(c.ruleset)}" (expected 2014 or 2024).`;
  return migrateCharacter(c as Character);
}
