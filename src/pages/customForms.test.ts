import { describe, expect, it } from 'vitest';
import { createRegistry, mergeRules } from '../data/registry';
import { itemSchema, subclassSchema } from '../data/schema';
import { SRD } from '../data/srd';
import { deriveSheet } from '../engine/derive';
import { addLevel } from '../engine/ops';
import { newCharacter, type InventoryItem } from '../types/character';
import { CREATURE, ITEM, SUBCLASS } from './customForms';
import { creatureSchema } from '../data/schema';
import { canWildShape, mergeCreatures, wildShapeLimits } from '../data/creatures';

describe('custom subclass spell table', () => {
  const draft = {
    ...SUBCLASS.empty(),
    name: 'Oath of Testing',
    classId: 'paladin',
    spells: [
      { level: 3, spells: ['bane', 'hunters-mark'] },
      { level: 5, spells: ['hold-person'] },
    ],
    features: [{ name: 'Vow', level: 3, description: 'A test feature.' }],
  };
  const entity = SUBCLASS.toEntity(draft);

  it('produces a valid subclass and round-trips through the form', () => {
    expect(subclassSchema.safeParse(entity).success).toBe(true);
    const back = SUBCLASS.fromEntity(entity);
    expect(back.spells).toEqual(draft.spells);
    expect(back.features).toEqual(draft.features);
  });

  it('grants spells at the right paladin levels', () => {
    const reg = createRegistry(mergeRules(SRD, { subclasses: [entity] }));
    let c = newCharacter('x');
    c = { ...c, speciesId: 'human', backgroundId: 'soldier', subclasses: { paladin: entity.id } };
    for (let i = 0; i < 3; i++) c = addLevel(c, 'paladin', reg);
    const at3 = deriveSheet(c, reg).spells.map((s) => s.spell.id);
    expect(at3).toEqual(expect.arrayContaining(['bane', 'hunters-mark']));
    expect(at3).not.toContain('hold-person');
    for (let i = 0; i < 2; i++) c = addLevel(c, 'paladin', reg);
    expect(deriveSheet(c, reg).spells.map((s) => s.spell.id)).toContain('hold-person');
  });
});

describe('custom creatures', () => {
  const draft = {
    ...CREATURE.empty(),
    name: 'Hearth Hound',
    type: 'Beast',
    cr: '0.25',
    ac: 13,
    hp: 22,
    speed_walk: 35,
    speed_climb: 20,
    ab_str: 14,
    traits: [{ name: 'Loyal', description: 'Stays within 30 feet of its keeper unless told otherwise.' }],
    actions: [{ name: 'Bite', description: 'Melee attack, reach 5 ft.', attack: '+5', damage: '1d6 + 2', damageType: 'piercing' }],
  };
  const entity = CREATURE.toEntity(draft);

  it('builds a valid stat block and round-trips through the form', () => {
    expect(creatureSchema.safeParse(entity).success).toBe(true);
    expect(entity).toMatchObject({ id: 'hearth-hound', type: 'beast', cr: 0.25, speed: { walk: '35 ft.', climb: '20 ft.' } });
    expect(entity.actions[0]).toEqual({ name: 'Bite', description: 'Melee attack, reach 5 ft.', attack: 5, damage: '1d6+2', damageType: 'piercing' });
    const back = CREATURE.toEntity(CREATURE.fromEntity(entity));
    expect(back).toEqual(entity);
  });

  it('rejects damage that is not a dice expression', () => {
    const bad = { ...entity, actions: [{ name: 'Bite', description: '', damage: 'lots' }] };
    expect(creatureSchema.safeParse(bad).success).toBe(false);
  });

  it('merges per edition and works for Wild Shape when it is a beast', () => {
    const in2014 = { ...entity, id: 'old-beast', edition: '2014' as const };
    const merged24 = mergeCreatures([], [entity, in2014], '2024');
    expect(merged24.map((c) => c.id)).toEqual(['hearth-hound']);
    expect(merged24[0].source).toBe('custom');
    expect(mergeCreatures([], [entity, in2014], '2014').map((c) => c.id)).toEqual(['old-beast']);
    expect(canWildShape(entity, wildShapeLimits('2024', 2, false))).toBe(true);
    expect(canWildShape({ ...entity, cr: 1 }, wildShapeLimits('2024', 2, false))).toBe(false);
  });
});

describe('custom magic items', () => {
  const ring = ITEM.toEntity({
    ...ITEM.empty(),
    name: 'Ring of Embers',
    category: 'magic',
    rarity: 'Rare',
    attunement: true,
    charges: 3,
    effects: [
      { type: 'resistance', damage: 'fire' },
      { type: 'speedMode', mode: 'fly', value: 'walk' },
      { type: 'spell', spell: 'burning-hands', note: '1 charge' },
      { type: 'language', language: '' },
    ],
  });
  const sword = ITEM.toEntity({ ...ITEM.empty(), name: 'Flame Tongue Longsword', category: 'weapon', weaponCategory: 'martial', damage: '1d8', isMagic: true, bonusAttack: 1, bonusDamage: 1 });
  const plate = ITEM.toEntity({ ...ITEM.empty(), name: 'Armor +2', category: 'magic', variantOf: 'armor', bonusAc: 2 });
  const plain = ITEM.toEntity({ ...ITEM.empty(), name: 'Rope', category: 'gear', isMagic: true });

  it('builds valid items and round-trips through the form', () => {
    for (const e of [ring, sword, plate, plain]) {
      expect(itemSchema.safeParse(e).success).toBe(true);
      expect(ITEM.toEntity(ITEM.fromEntity(e))).toEqual(e);
    }
    expect(ring.magic).toMatchObject({ rarity: 'Rare', attunement: true, charges: 3 });
    expect(ring.magic!.effects).toHaveLength(3); // the empty language row is dropped
    expect(sword).toMatchObject({ category: 'weapon', weapon: { damage: '1d8' }, magic: { bonus: { attack: 1, damage: 1 } } });
    expect(plate.magic).toMatchObject({ variantOf: 'armor', bonus: { ac: 2 } });
    expect(plain.magic).toBeUndefined();
  });

  it('applies effects only while equipped and attuned, and a magic weapon adds its own bonus', () => {
    const reg = createRegistry(mergeRules(SRD, { items: [ring, sword] }));
    let c = newCharacter('x');
    c = { ...c, speciesId: 'human', backgroundId: 'soldier', baseAbilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    c = addLevel(c, 'fighter', reg);
    const inv = (p: Partial<InventoryItem>): InventoryItem => ({ uid: Math.random().toString(36), name: 'x', qty: 1, equipped: true, ...p });
    const sheet = (items: InventoryItem[]) => deriveSheet({ ...c, inventory: items }, reg);

    const worn = sheet([inv({ itemId: ring.id, name: ring.name, attuned: true })]);
    expect(worn.resistances).toContain('fire');
    expect(worn.speeds.find((s) => s.mode === 'fly')?.value).toBe(30);
    const spell = worn.spells.find((s) => s.spell.id === 'burning-hands');
    expect(spell).toMatchObject({ viaName: 'Ring of Embers', note: '1 charge', alwaysPrepared: true });

    for (const off of [sheet([inv({ itemId: ring.id, name: ring.name })]), sheet([inv({ itemId: ring.id, name: ring.name, attuned: true, equipped: false })])]) {
      expect(off.resistances).not.toContain('fire');
      expect(off.spells.some((s) => s.spell.id === 'burning-hands')).toBe(false);
    }

    const ls = (s: ReturnType<typeof sheet>) => s.attacks[0];
    const base = sheet([inv({ itemId: 'longsword', name: 'Longsword' })]);
    const magic = sheet([inv({ itemId: sword.id, name: sword.name })]);
    expect(ls(magic).bonus).toBe(ls(base).bonus + 1);
    expect(ls(magic).damage).toBe('1d8+3');
  });
});
