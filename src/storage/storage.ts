import type { CustomContent } from '../data/registry';
import { customContentSchema } from '../data/schema';
import { CHARACTER_VERSION, emptyPlayState, newCharacter, type Character } from '../types/character';

const CHARACTERS_KEY = 'dndb.characters';
const CUSTOM_KEY = 'dndb.custom';

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
    ruleset: c.ruleset ?? '2024',
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

export function loadCustom(): CustomContent {
  const raw = read<unknown>(CUSTOM_KEY, {});
  const parsed = customContentSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
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
  return migrateCharacter(c as Character);
}
