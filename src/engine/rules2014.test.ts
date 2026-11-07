import { describe, expect, it } from 'vitest';
import {
  backgroundSchema,
  classSchema,
  featSchema,
  itemSchema,
  keywordSchema,
  speciesSchema,
  spellSchema,
  subclassSchema,
} from '../data/schema';
import { createRegistry } from '../data/registry';
import { RULES } from '../data/srd';
import { migrateCharacter } from '../storage/storage';
import { newCharacter, type Character } from '../types/character';
import { pendingChoices } from './collect';
import { deriveSheet } from './derive';
import { addLevel, inventoryFromBundle, setChoice } from './ops';

const reg = createRegistry(RULES['2014']);
const reg24 = createRegistry(RULES['2024']);

function char(speciesId: string, lineageId: string | undefined, classes: [string, number][], abilities: Partial<Character['baseAbilities']> = {}) {
  let c: Character = { ...newCharacter('x'), ruleset: '2014', speciesId, lineageId, backgroundId: 'acolyte' };
  c.baseAbilities = { ...c.baseAbilities, ...abilities };
  for (const [cls, n] of classes) for (let i = 0; i < n; i++) c = addLevel(c, cls, reg);
  return c;
}

describe('2014 SRD data matches schema', () => {
  const D = RULES['2014'];
  const cases = [
    ['classes', D.classes, classSchema],
    ['subclasses', D.subclasses, subclassSchema],
    ['species', D.species, speciesSchema],
    ['backgrounds', D.backgrounds, backgroundSchema],
    ['feats', D.feats, featSchema],
    ['spells', D.spells, spellSchema],
    ['items', D.items, itemSchema],
    ['keywords', D.keywords, keywordSchema],
  ] as const;
  for (const [name, list, schema] of cases)
    it(name, () => {
      const errors = (list as unknown[]).flatMap((x, i) => {
        const r = schema.safeParse(x);
        return r.success ? [] : [`${name}[${i}]: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`];
      });
      expect(errors).toEqual([]);
    });
});

describe('2014 rules', () => {
  it('Hill Dwarf Cleric 1: racial ASI, toughness, domain at level 1, prepared = level + WIS', () => {
    let c = char('dwarf', 'hill-dwarf', [['cleric', 1]], { con: 14, wis: 15 });
    expect(deriveSheet(c, reg).collected.needsSubclass).toEqual(['cleric']);
    c = { ...c, subclasses: { cleric: 'life' } };
    const s = deriveSheet(c, reg);
    expect(s.abilities.con.score).toBe(16);
    expect(s.abilities.wis.score).toBe(16);
    expect(s.maxHp).toBe(8 + 3 + 1);
    expect(s.speed).toBe(25);
    expect(s.darkvision).toBe(60);
    expect(s.casters[0]).toMatchObject({ prepared: 4, known: false, cantrips: 3 });
    expect(s.spells.filter((x) => x.alwaysPrepared).map((x) => x.spell.id)).toEqual(expect.arrayContaining(['bless', 'cure-wounds']));
    expect(s.proficiencies.armor).toContain('heavy');
  });

  it('Bard uses spells known from the table', () => {
    const s = deriveSheet(char('human', undefined, [['bard', 1]]), reg);
    expect(s.casters[0]).toMatchObject({ known: true, prepared: 4, cantrips: 2 });
  });

  it('Half-Elf gets +2 CHA and a choice of two +1s', () => {
    let c = char('half-elf', undefined, [['rogue', 1]], { cha: 14 });
    const asi = pendingChoices(deriveSheet(c, reg).collected).find((x) => x.key === 'species:asi');
    expect(asi?.count).toBe(2);
    c = setChoice(c, 'species:asi', ['dex', 'con']);
    const s = deriveSheet(c, reg);
    expect(s.abilities.cha.score).toBe(16);
    expect(s.abilities.dex.score).toBe(11);
  });

  it('no 2024-only rules: no core language pick, no background ASI or feat', () => {
    const keys = deriveSheet(char('human', undefined, [['fighter', 1]]), reg).collected.choices.map((x) => x.key);
    expect(keys).not.toContain('core:languages');
    expect(keys).not.toContain('background:asi');
    expect(keys).toContain('background:languages');
  });

  it('Paladin casts from level 2; half-caster multiclass rounds down', () => {
    expect(deriveSheet(char('human', undefined, [['paladin', 1]], { cha: 14 }), reg).casters).toEqual([]);
    const p2 = deriveSheet(char('human', undefined, [['paladin', 2]], { cha: 14 }), reg);
    expect(p2.casters[0].prepared).toBe(1 + 2);
    expect(p2.slots[0]).toBe(2);
    // Paladin 3 / Wizard 2: caster level 1 + 2 = 3 -> 4/2 slots (2024 rounding would give 4).
    const mc = deriveSheet(char('human', undefined, [['paladin', 3], ['wizard', 2]], { str: 13, cha: 13, int: 13 }), reg);
    expect(mc.slots.slice(0, 3)).toEqual([4, 2, 0]);
  });

  it('Fighting Style options apply their effects', () => {
    let c = char('human', undefined, [['fighter', 1]]);
    c = setChoice(c, 'class:fighter:fighter-fighting-style:options', ['fighter-fighting-style-defense']);
    c = { ...c, inventory: [{ uid: 'a', itemId: 'chain-mail', name: 'Chain Mail', qty: 1, equipped: true }] };
    expect(deriveSheet(c, reg).ac).toBe(17);
  });
});

describe('rule set isolation and migration', () => {
  it('each edition has its own options', () => {
    expect(reg.species.has('half-elf')).toBe(true);
    expect(reg24.species.has('half-elf')).toBe(false);
    expect(reg24.species.has('goliath')).toBe(true);
    expect(reg.species.has('goliath')).toBe(false);
  });

  it('characters saved before rule sets load as 2024', () => {
    const old = { ...newCharacter('old') } as Partial<Character>;
    delete old.ruleset;
    expect(migrateCharacter(old as Character).ruleset).toBe('2024');
  });
});

describe('starting equipment of your choice (2014)', () => {
  const paladin = reg.classes.get('paladin')!;
  const groups = paladin.startingEquipmentGroups!;
  const martialAndShield = groups.flat().find((b) => b.items.some((i) => i.choose?.label === 'martial weapon') && b.items.some((i) => i.item === 'shield'))!;

  it('lists the items to pick from, all of them known items', () => {
    for (const b of [...reg.data.classes.flatMap((c) => (c.startingEquipmentGroups ?? []).flat()), ...reg.data.backgrounds.flatMap((x) => (x.equipmentGroups ?? []).flat())])
      for (const i of b.items) for (const id of i.choose?.options ?? []) expect(reg.items.get(id), id).toBeDefined();
    expect(martialAndShield.items.find((i) => i.choose)!.choose!.options).toContain('longsword');
    const two = groups.flat().find((b) => b.items.some((i) => i.choose?.label === 'martial weapon' && i.count === 2));
    expect(two).toBeDefined();
  });

  it('adds the picked weapon, or a placeholder until one is picked', () => {
    const pickAt = martialAndShield.items.findIndex((i) => i.choose);
    const picked = inventoryFromBundle(martialAndShield, reg, 'class:1', { [pickAt]: ['longsword'] });
    expect(picked.map((i) => [i.itemId, i.equipped])).toEqual(expect.arrayContaining([['longsword', true], ['shield', true]]));
    const open = inventoryFromBundle(martialAndShield, reg, 'class:1');
    expect(open.find((i) => !i.itemId)?.name).toBe('Martial Weapons of your choice');
    // Picks outside the list are ignored.
    expect(inventoryFromBundle(martialAndShield, reg, 'class:1', { [pickAt]: ['fireball'] }).some((i) => i.itemId === 'fireball')).toBe(false);
  });
});
