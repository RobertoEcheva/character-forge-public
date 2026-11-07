import { describe, expect, it } from 'vitest';
import { canWildShape, wildShapeLimits } from '../data/creatures';
import { createRegistry, mergeRules } from '../data/registry';
import { RULES } from '../data/srd';
import { newCharacter, type Character, type InventoryItem } from '../types/character';
import type { CreatureDef } from '../types/creature';
import type { Edition, SpeciesDef } from '../types/rules';
import { deriveSheet } from './derive';
import { critExpression, roll } from './dice';
import { addLevel, applyDamage, applyDeathSave, changeHp, deathState } from './ops';
import { spellRolls } from './spells';

const reg = { '2024': createRegistry(RULES['2024']), '2014': createRegistry(RULES['2014']) };

function make(edition: Edition, classId: string, level: number, extra: Partial<Character> = {}) {
  let c: Character = { ...newCharacter('t'), ruleset: edition, speciesId: 'human', backgroundId: edition === '2024' ? 'soldier' : 'acolyte', ...extra };
  for (let i = 0; i < level; i++) c = addLevel(c, classId, reg[edition]);
  return c;
}
const inv = (p: Partial<InventoryItem>): InventoryItem => ({ uid: Math.random().toString(36), name: 'x', qty: 1, equipped: true, ...p });

describe('dice and spell rolls', () => {
  it('crit doubles dice only', () => {
    expect(critExpression('1d8+3')).toBe('2d8+3');
    expect(critExpression('2d6+1d4-1')).toBe('4d6+2d4-1');
  });

  it('upcasts from data tables (2014) and from higher-level text (2024)', () => {
    for (const e of ['2014', '2024'] as const) {
      const fireball = reg[e].spells.get('fireball')!;
      expect(spellRolls(fireball, 3, 5, 3).damage).toBe('8d6');
      expect(spellRolls(fireball, 5, 9, 3).damage).toBe('10d6');
      expect(spellRolls(reg[e].spells.get('fire-bolt')!, 0, 5, 3).damage).toBe('2d10');
      expect(spellRolls(reg[e].spells.get('fire-bolt')!, 0, 17, 3).damage).toBe('4d10');
    }
    expect(spellRolls(reg['2024'].spells.get('cure-wounds')!, 2, 3, 3).heal).toBe('4d8+3');
    expect(spellRolls(reg['2014'].spells.get('cure-wounds')!, 2, 3, 3).heal).toBe('2d8+3');
  });
});

describe('on/off states', () => {
  it('Rage adds resistances and an automatic damage rider; uses the Rage counter', () => {
    const off = deriveSheet(make('2024', 'barbarian', 1), reg['2024']);
    expect(off.toggles.find((t) => t.id === 'rage')?.resource).toBe('rage_count');
    expect(off.resistances).not.toContain('slashing');
    const on = deriveSheet(make('2024', 'barbarian', 1, { play: { ...newCharacter('x').play, active: ['rage'] } }), reg['2024']);
    expect(on.resistances).toEqual(expect.arrayContaining(['bludgeoning', 'piercing', 'slashing']));
    expect(on.riders.find((r) => r.id === 'rage')).toMatchObject({ dice: '2', auto: true, when: 'strMelee' });
  });

  it('Shield +5, Barkskin floor, concentration, Bless roll bonus', () => {
    const base = make('2014', 'wizard', 1);
    const ac = deriveSheet(base, reg['2014']).ac;
    const s = deriveSheet({ ...base, play: { ...base.play, active: ['shield', 'bless'] } }, reg['2014']);
    expect(s.ac).toBe(ac + 5);
    expect(s.concentration?.id).toBe('bless');
    expect(s.rollBonuses.attack).toEqual(['1d4']);
    expect(deriveSheet({ ...base, play: { ...base.play, active: ['barkskin'] } }, reg['2014']).ac).toBe(16);
  });

  it('exhaustion by edition', () => {
    const c24 = make('2024', 'fighter', 1);
    const s24 = deriveSheet({ ...c24, play: { ...c24.play, exhaustion: 2 } }, reg['2024']);
    expect(s24.d20Penalty).toBe(4);
    expect(s24.speed).toBe(20);
    const c14 = make('2014', 'fighter', 1);
    const s14 = deriveSheet({ ...c14, play: { ...c14.play, exhaustion: 2 } }, reg['2014']);
    expect(s14.d20Penalty).toBe(0);
    expect(s14.speed).toBe(15);
  });

  it('Sneak Attack rider scales with Rogue level', () => {
    expect(deriveSheet(make('2024', 'rogue', 3), reg['2024']).riders.find((r) => r.id === 'sneak-attack')?.dice).toBe('2d6');
    expect(deriveSheet(make('2014', 'rogue', 5), reg['2014']).riders.find((r) => r.id === 'sneak-attack')?.dice).toBe('3d6');
  });
});

describe('magic items', () => {
  it('+1 weapon, Cloak of Protection (needs attunement), Gauntlets of Ogre Power', () => {
    const c = make('2024', 'fighter', 1, { baseAbilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    const plain = deriveSheet({ ...c, inventory: [inv({ itemId: 'longsword', name: 'Longsword' })] }, reg['2024']);
    const magic = deriveSheet(
      {
        ...c,
        inventory: [
          inv({ itemId: 'longsword', magicId: 'weapon-1', name: 'Longsword +1' }),
          inv({ itemId: 'cloak-of-protection', name: 'Cloak', attuned: true }),
          inv({ itemId: 'gauntlets-of-ogre-power', name: 'Gauntlets', attuned: true }),
        ],
      },
      reg['2024'],
    );
    const ls = (s: typeof plain) => s.attacks.find((a) => a.name.startsWith('Longsword'))!;
    expect(ls(magic).bonus).toBe(ls(plain).bonus + 1 + 2); // +1 weapon, STR 14 -> 19 (mod +2 -> +4)
    expect(ls(magic).damage).toBe('1d8+5');
    expect(magic.ac).toBe(plain.ac + 1);
    expect(magic.abilities.dex.save).toBe(plain.abilities.dex.save + 1);
    expect(magic.attuned).toBe(2);
    const unattuned = deriveSheet({ ...c, inventory: [inv({ itemId: 'cloak-of-protection', name: 'Cloak' })] }, reg['2024']);
    expect(unattuned.ac).toBe(deriveSheet(c, reg['2024']).ac);
  });
});

describe('new effect types', () => {
  const testling: SpeciesDef = {
    id: 'testling',
    name: 'Testling',
    source: 'custom',
    creatureType: 'Humanoid',
    size: 'Medium',
    speed: 30,
    traits: [
      {
        id: 't',
        name: 'T',
        level: 1,
        description: '',
        effects: [
          { type: 'speedMode', mode: 'climb', value: 'walk' },
          { type: 'speedMode', mode: 'fly', value: 50, hover: true },
          { type: 'sense', sense: 'blindsight', range: 10 },
          { type: 'initiativeBonus', value: 5 },
          { type: 'passiveBonus', skill: 'perception', value: 5 },
          { type: 'armorDexMax', armor: 'medium', value: 3 },
          { type: 'damageBonus', value: 2, when: 'oneHandedMelee' },
        ],
      },
    ],
  };
  const r = createRegistry(mergeRules(RULES['2024'], { species: [testling] }));

  it('applies speeds, senses, initiative, passives, Dex cap and Dueling', () => {
    let c: Character = { ...newCharacter('e'), speciesId: 'testling', backgroundId: 'soldier' };
    c.baseAbilities = { ...c.baseAbilities, dex: 16 };
    c = addLevel(c, 'fighter', r);
    c = { ...c, inventory: [inv({ itemId: 'half-plate-armor', name: 'Half Plate' }), inv({ itemId: 'longsword', name: 'Longsword' })] };
    const s = deriveSheet(c, r);
    expect(s.speeds).toEqual([
      { mode: 'climb', value: 30 },
      { mode: 'fly', value: 50, hover: true },
    ]);
    expect(s.senses).toContainEqual({ sense: 'blindsight', range: 10 });
    expect(s.initiative).toBe(3 + 5);
    expect(s.passives.perception).toBe(10 + 0 + 5);
    expect(s.ac).toBe(15 + 3);
    expect(s.attacks.find((a) => a.name === 'Longsword')!.damage).toBe('1d8+2');
  });
});

describe('Wild Shape limits', () => {
  const beast = (id: string, cr: number, speed: Record<string, string>) => ({ id, type: 'beast', cr, speed }) as unknown as CreatureDef;
  it('caps CR and movement by Druid level and edition', () => {
    const l2_14 = wildShapeLimits('2014', 2, false);
    const l2_24 = wildShapeLimits('2024', 2, false);
    expect(canWildShape(beast('wolf', 0.25, { walk: '40 ft.' }), l2_14)).toBe(true);
    expect(canWildShape(beast('crab', 0, { walk: '20 ft.', swim: '20 ft.' }), l2_14)).toBe(false);
    expect(canWildShape(beast('crab', 0, { walk: '20 ft.', swim: '20 ft.' }), l2_24)).toBe(true);
    expect(canWildShape(beast('eagle', 0, { walk: '10 ft.', fly: '60 ft.' }), l2_24)).toBe(false);
    expect(wildShapeLimits('2024', 6, true).cr).toBe(2);
    expect(wildShapeLimits('2014', 2, true).cr).toBe(1);
  });
});

describe('death saves', () => {
  const dying = (successes = 0, failures = 0): Character => {
    const c = newCharacter('t');
    return { ...c, play: { ...c.play, hp: 0, deathSaves: { successes, failures } } };
  };
  it('counts 10+ as a success and below as a failure', () => {
    expect(applyDeathSave(dying(), 10).play.deathSaves).toEqual({ successes: 1, failures: 0 });
    expect(applyDeathSave(dying(), 9).play.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(applyDeathSave(dying(), 8, 2).play.deathSaves).toEqual({ successes: 1, failures: 0 });
  });
  it('a 1 is two failures and a 20 restores 1 HP', () => {
    expect(applyDeathSave(dying(0, 1), 1).play.deathSaves.failures).toBe(3);
    const up = applyDeathSave(dying(1, 2), 20);
    expect(up.play.hp).toBe(1);
    expect(up.play.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
  it('stops at stable or dead', () => {
    expect(deathState({ successes: 3, failures: 1 })).toBe('stable');
    expect(deathState({ successes: 0, failures: 3 })).toBe('dead');
    const dead = dying(0, 3);
    expect(applyDeathSave(dead, 15)).toBe(dead);
  });
});

describe('table play: hits, crits and hit points', () => {
  // Returns the given die faces in order.
  const faces = (...xs: number[]) => () => xs.shift() ?? 1;

  it('flags a natural 20 only when it is the kept die', () => {
    expect(roll('hit', '1d20+5', 'normal', faces(20))!.crit).toBe(true);
    expect(roll('hit', '1d20+5', 'advantage', faces(4, 20))!.crit).toBe(true);
    expect(roll('hit', '1d20+5', 'disadvantage', faces(20, 7))!.crit).toBe(false);
    expect(critExpression('1d8+3')).toBe('2d8+3');
  });

  it('shares damage and healing math between characters and companions', () => {
    expect(changeHp({ hp: 10, temp: 3 }, 12, 'damage', 5)).toEqual({ hp: 8, temp: 0 });
    expect(changeHp({ hp: 2, temp: 0 }, 12, 'damage', 9)).toEqual({ hp: 0, temp: 0 });
    expect(changeHp({ hp: 9, temp: 1 }, 12, 'heal', 7)).toEqual({ hp: 12, temp: 1 });
    const c = make('2024', 'fighter', 1);
    const s = deriveSheet(c, reg['2024']);
    const hurt = applyDamage({ ...c, play: { ...c.play, tempHp: 4 } }, s, 6);
    expect({ hp: hurt.play.hp, temp: hurt.play.tempHp }).toEqual(changeHp({ hp: s.maxHp, temp: 4 }, s.maxHp, 'damage', 6));
  });

  it('lists versatile once, with its two-handed die', () => {
    const c = make('2024', 'fighter', 1, { inventory: [inv({ itemId: 'longsword', name: 'Longsword' })] });
    const props = deriveSheet(c, reg['2024']).attacks.find((a) => a.name === 'Longsword')!.properties;
    expect(props.filter((p) => p.startsWith('versatile'))).toEqual(['versatile (1d10)']);
  });
});
