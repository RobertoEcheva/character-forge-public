import { describe, expect, it } from 'vitest';
import { createRegistry, mergeRules } from './registry';
import { SRD } from './srd';
import { installPack, packStats, removePack, type PackFile } from './packs';
import { deriveSheet } from '../engine/derive';
import { addLevel } from '../engine/ops';
import { newCharacter } from '../types/character';
import type { SubclassDef } from '../types/rules';

const third = Array.from({ length: 20 }, (_, i) => {
  const lvl = i + 1;
  if (lvl < 3) return { cantrips: 0, prepared: 0, slots: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  return { cantrips: 2, prepared: 3, slots: [lvl >= 4 ? 3 : 2, 0, 0, 0, 0, 0, 0, 0, 0] };
});

const knight: SubclassDef = {
  id: 'test-knight',
  name: 'Test Knight',
  source: 'custom',
  classId: 'fighter',
  unverified: true,
  spellcasting: { ability: 'int', list: 'wizard', levels: third },
  features: [
    {
      id: 'test-knight-tricks',
      name: 'Tricks',
      level: 3,
      description: 'Test.',
      effects: [
        { type: 'resource', id: 'tricks', label: 'Tricks', max: 2, reset: 'short' },
        { type: 'resource', id: 'tricks', label: 'Tricks', max: 4, reset: 'short', minLevel: 7 },
        { type: 'darkvision', range: 60, extend: 30 },
        { type: 'hpBonus', value: 5 },
      ],
    },
  ],
};
const pack: PackFile = { id: 'test-pack', name: 'Test', description: '', content: { subclasses: [knight] } };

describe('content packs', () => {
  it('installs, keeps checked/edited entries on update, and removes', () => {
    let custom = installPack({}, pack);
    expect(packStats(custom, 'test-pack')).toEqual({ installed: 1, unverified: 1 });
    custom = { subclasses: [{ ...custom.subclasses![0], description: 'Mine', edited: true, unverified: false }] };
    custom = installPack(custom, pack);
    expect(custom.subclasses![0].description).toBe('Mine');
    expect(removePack(custom, 'test-pack').subclasses).toEqual([]);
  });

  it('never overwrites a user entry with the same id', () => {
    const mine = { ...knight, pack: undefined, name: 'My Knight' };
    expect(installPack({ subclasses: [mine] }, pack).subclasses![0].name).toBe('My Knight');
  });
});

describe('pack mechanics in the engine', () => {
  const reg = createRegistry(mergeRules(SRD, installPack({}, pack)));
  const fighter = (level: number) => {
    let c = newCharacter('k');
    c = { ...c, speciesId: 'dwarf', backgroundId: 'soldier', subclasses: { fighter: 'test-knight' } };
    for (let i = 0; i < level; i++) c = addLevel(c, 'fighter', reg);
    return deriveSheet(c, reg);
  };

  it('subclass spellcasting uses its own list and table', () => {
    expect(fighter(2).casters).toEqual([]);
    const s = fighter(4);
    expect(s.casters[0]).toMatchObject({ classId: 'fighter', list: 'wizard', cantrips: 2, prepared: 3, ability: 'int' });
    expect(s.slots[0]).toBe(3);
  });

  it('resources scale by level, darkvision extends, hp bonus applies', () => {
    const s3 = fighter(3);
    const s7 = fighter(7);
    expect(s3.counters.find((x) => x.id === 'res:tricks')?.max).toBe(2);
    expect(s7.counters.find((x) => x.id === 'res:tricks')?.max).toBe(4);
    expect(s3.darkvision).toBe(150); // dwarf 120 + 30
    expect(fighter(3).maxHp - fighter(2).maxHp).toBeGreaterThan(5);
  });
});

describe('user packs', () => {
  const feat = (id: string, extra = {}) => ({ id, name: id, source: 'custom' as const, type: 'general' as const, repeatable: false, description: 'd', ...extra });
  const content = { feats: [feat('a'), feat('b')] };

  it('imports into a new pack, then an existing one; ids stay unique', async () => {
    const { applyImport } = await import('./packs');
    let r = applyImport({}, { content }, { kind: 'new', name: 'Homebrew Feats' }, '2024', ['bundled-pack']);
    expect(r.pack).toMatchObject({ id: 'homebrew-feats', name: 'Homebrew Feats' });
    expect(r.count).toBe(2);
    expect(r.custom.feats!.every((f) => f.pack === 'homebrew-feats')).toBe(true);
    r = applyImport(r.custom, { content: { feats: [feat('c')] } }, { kind: 'existing', id: 'homebrew-feats' }, '2024');
    expect(packStats(r.custom, 'homebrew-feats').installed).toBe(3);
    const again = applyImport(r.custom, { content }, { kind: 'new', name: 'Homebrew Feats' }, '2024');
    expect(again.pack?.id).toBe('homebrew-feats-2');
  });

  it('adding to a built-in pack survives Update and goes with Remove', async () => {
    const { applyImport } = await import('./packs');
    let custom = installPack({}, pack);
    custom = applyImport(custom, { content }, { kind: 'existing', id: 'test-pack' }, '2024').custom;
    custom = installPack(custom, pack); // Update
    expect(packStats(custom, 'test-pack').installed).toBe(3);
    expect(removePack(custom, 'test-pack').feats).toEqual([]);
  });

  it('rename, delete (keep or remove entries), move one entry', async () => {
    const { applyImport, renameUserPack, deleteUserPack, setEntryPack } = await import('./packs');
    const base = applyImport({}, { content }, { kind: 'new', name: 'Mine' }, '2024').custom;
    expect(renameUserPack(base, 'mine', 'Ours', 'desc').packs).toEqual([{ id: 'mine', name: 'Ours', description: 'desc', edition: '2024' }]);
    const kept = deleteUserPack(base, 'mine', true);
    expect(kept.packs).toEqual([]);
    expect(kept.feats!.map((f) => f.pack)).toEqual([undefined, undefined]);
    expect(deleteUserPack(base, 'mine', false).feats).toEqual([]);
    expect(setEntryPack(kept, 'feats', 'a', '2024', 'mine').feats![0].pack).toBe('mine');
  });

  it('exported pack files import back as a pack', async () => {
    const { applyImport, exportPack } = await import('./packs');
    const { parseImport } = await import('./importContent');
    const base = applyImport({}, { content }, { kind: 'new', name: 'Travel Pack', description: 'x' }, '2014');
    const file = exportPack(base.custom, base.custom.packs![0]);
    expect(file).toMatchObject({ id: 'travel-pack', name: 'Travel Pack', edition: '2014' });
    const parsed = parseImport(JSON.parse(JSON.stringify(file)), '2024');
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.pack).toMatchObject({ id: 'travel-pack', edition: '2014' });
    const fresh = applyImport({}, parsed, { kind: 'file' }, parsed.pack!.edition);
    expect(fresh.custom.packs).toEqual([{ id: 'travel-pack', name: 'Travel Pack', description: 'x', edition: '2014' }]);
    expect(fresh.custom.feats!.map((f) => [f.id, f.pack, f.edition])).toEqual([
      ['a', 'travel-pack', '2014'],
      ['b', 'travel-pack', '2014'],
    ]);
  });
});
