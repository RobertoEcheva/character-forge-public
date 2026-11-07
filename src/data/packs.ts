import type { CustomContent, UserPack } from './registry';
import type { Edition, PackInfo } from '../types/rules';

export interface PackFile {
  id: string;
  name: string;
  description: string;
  /** Rule set the pack belongs to (default 2024). */
  edition?: Edition;
  content: CustomContent;
}

type Entry = { id: string } & PackInfo;
export const ENTRY_KINDS = ['classes', 'subclasses', 'feats', 'backgrounds', 'species', 'spells', 'items', 'keywords', 'creatures'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
const KEYS = ENTRY_KINDS;

// Lazy: packs are only downloaded when the landing page or Rules packs page asks for them.
const loaders = import.meta.glob('../../data/packs/*.json', { import: 'default' });

export async function listPacks(): Promise<PackFile[]> {
  const packs = await Promise.all(Object.values(loaders).map((load) => load() as Promise<PackFile>));
  return packs.filter((p) => p && p.id && p.content).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds a pack's entries to custom content. On re-install (update), entries the user has
 * verified or edited are kept as they are; everything else is replaced by the pack's version.
 */
export function installPack(custom: CustomContent, pack: PackFile): CustomContent {
  const next: CustomContent = { ...custom };
  for (const k of KEYS) {
    const incoming = (pack.content[k] ?? []) as Entry[];
    if (!incoming.length) continue;
    const current = (custom[k] ?? []) as Entry[];
    const edition = pack.edition ?? '2024';
    // Ids only need to be unique within an edition (2014 and 2024 both have a Battle Master).
    const keyOf = (e: Entry) => `${e.edition ?? '2024'}:${e.id}`;
    const byKey = new Map(current.map((e) => [keyOf(e), e]));
    for (const e of incoming) {
      const entry = { ...e, source: 'custom', pack: pack.id, ...(edition !== '2024' ? { edition } : {}) } as Entry;
      const existing = byKey.get(keyOf(entry));
      const keep = existing && existing.pack === pack.id && (existing.edited || existing.unverified === false);
      // Never overwrite the user's own (non-pack) entry with the same id.
      if (keep || (existing && existing.pack !== pack.id)) continue;
      byKey.set(keyOf(entry), entry);
    }
    next[k] = [...byKey.values()] as never;
  }
  return next;
}

export function removePack(custom: CustomContent, packId: string): CustomContent {
  const next: CustomContent = { ...custom };
  for (const k of KEYS) {
    const list = custom[k] as Entry[] | undefined;
    if (list) next[k] = list.filter((e) => e.pack !== packId) as never;
  }
  return next;
}

export function packStats(custom: CustomContent, packId: string) {
  let installed = 0;
  let unverified = 0;
  for (const k of KEYS)
    for (const e of (custom[k] ?? []) as Entry[])
      if (e.pack === packId) {
        installed++;
        if (e.unverified) unverified++;
      }
  return { installed, unverified };
}

export function packSize(pack: PackFile) {
  return KEYS.reduce((n, k) => n + (pack.content[k]?.length ?? 0), 0);
}

// ---------- packs made in the browser ----------

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Creates a user pack with a unique id; returns the new content and the pack. */
export function createUserPack(
  custom: CustomContent,
  meta: { name: string; description?: string; edition: Edition; id?: string },
  reservedIds: string[] = [],
): { custom: CustomContent; pack: UserPack } {
  const taken = new Set([...(custom.packs ?? []).map((p) => p.id), ...reservedIds]);
  const base = slug(meta.id ?? meta.name) || 'my-pack';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const pack: UserPack = { id, name: meta.name.trim(), edition: meta.edition, ...(meta.description ? { description: meta.description } : {}) };
  return { custom: { ...custom, packs: [...(custom.packs ?? []), pack] }, pack };
}

export function renameUserPack(custom: CustomContent, id: string, name: string, description?: string): CustomContent {
  return {
    ...custom,
    packs: (custom.packs ?? []).map((p) => (p.id === id ? { ...p, name: name.trim(), description: description?.trim() || undefined } : p)),
  };
}

/** Deletes a user pack; its entries are either removed or kept without a pack. */
export function deleteUserPack(custom: CustomContent, id: string, keepEntries: boolean): CustomContent {
  const next: CustomContent = keepEntries ? { ...custom } : removePack(custom, id);
  if (keepEntries)
    for (const k of KEYS) {
      const list = custom[k] as Entry[] | undefined;
      if (list) next[k] = list.map((e) => (e.pack === id ? { ...e, pack: undefined } : e)) as never;
    }
  next.packs = (custom.packs ?? []).filter((p) => p.id !== id);
  return next;
}

/** Puts one entry in a pack (or takes it out with packId undefined). */
export function setEntryPack(custom: CustomContent, kind: EntryKind, entryId: string, edition: Edition, packId: string | undefined): CustomContent {
  const list = (custom[kind] ?? []) as Entry[];
  return {
    ...custom,
    [kind]: list.map((e) => (e.id === entryId && (e.edition ?? '2024') === edition ? { ...e, pack: packId } : e)),
  };
}

/** A user pack as a file in the same format as the bundled packs. */
export function exportPack(custom: CustomContent, pack: UserPack): PackFile {
  const content: CustomContent = {};
  for (const k of KEYS) {
    const list = ((custom[k] ?? []) as Entry[]).filter((e) => e.pack === pack.id);
    if (list.length) content[k] = list as never;
  }
  return { id: pack.id, name: pack.name, description: pack.description ?? '', ...(pack.edition !== '2024' ? { edition: pack.edition } : {}), content };
}

/** Where imported entries go. "file" = the pack described by an imported pack file. */
export type PackTarget = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string; description?: string } | { kind: 'file' };

/**
 * Merges imported content into custom content, putting the entries in the chosen pack.
 * Entries replace existing ones with the same edition + id. Returns how many entries were added.
 */
export function applyImport(
  custom: CustomContent,
  imported: { content: CustomContent; pack?: UserPack },
  target: PackTarget,
  edition: Edition,
  builtinIds: string[] = [],
): { custom: CustomContent; count: number; pack?: { id: string; name: string } } {
  let next: CustomContent = { ...custom };

  // Packs listed in a full "export all" file.
  for (const p of imported.content.packs ?? [])
    if (!(next.packs ?? []).some((x) => x.id === p.id)) next = { ...next, packs: [...(next.packs ?? []), p] };

  let pack: { id: string; name: string } | undefined;
  if (target.kind === 'existing') {
    const user = (next.packs ?? []).find((p) => p.id === target.id);
    pack = { id: target.id, name: user?.name ?? target.id };
  } else if (target.kind === 'new') {
    const r = createUserPack(next, { name: target.name, description: target.description, edition }, builtinIds);
    next = r.custom;
    pack = r.pack;
  } else if (target.kind === 'file' && imported.pack) {
    const existing = (next.packs ?? []).find((p) => p.id === imported.pack!.id);
    if (existing) pack = existing;
    else {
      const r = createUserPack(next, { ...imported.pack, id: imported.pack.id }, builtinIds);
      next = r.custom;
      pack = r.pack;
    }
  }

  let count = 0;
  for (const k of KEYS) {
    const incoming = (imported.content[k] ?? []) as Entry[];
    if (!incoming.length) continue;
    const tagged = incoming.map((e) => ({ ...e, pack: pack?.id }));
    const keyOf = (e: Entry) => `${e.edition ?? '2024'}:${e.id}`;
    const keys = new Set(tagged.map(keyOf));
    next[k] = [...((next[k] ?? []) as Entry[]).filter((e) => !keys.has(keyOf(e))), ...tagged] as never;
    count += tagged.length;
  }
  return { custom: next, count, ...(pack ? { pack } : {}) };
}
