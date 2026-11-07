import { describe, expect, it } from 'vitest';
import { createRegistry } from '../data/registry';
import { SRD } from '../data/srd';
import { newCharacter, type Character } from '../types/character';
import { pendingChoices } from './collect';
import { deriveSheet } from './derive';
import { parseDice, roll } from './dice';
import { addLevel, applyDamage, applyStartingBundle, heal, longRest, multiclassBlockers, setChoice } from './ops';

const reg = createRegistry(SRD);
const fixedRng = (v: number) => () => v;

function fighter(): Character {
  let c = newCharacter('t1');
  c = { ...c, name: 'Test', speciesId: 'dwarf', backgroundId: 'soldier' };
  c.baseAbilities = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
  c = addLevel(c, 'fighter', reg);
  c = setChoice(c, 'background:asi', ['str', 'str', 'con']);
  c = setChoice(c, 'class:fighter:skills', ['athletics', 'perception']);
  c = setChoice(c, 'class:fighter:fighter-fighting-style:feat', ['defense']);
  c = applyStartingBundle(c, 'class', SRD.classes.find((x) => x.id === 'fighter')!.startingEquipment[0], reg, 0);
  return c;
}

describe('level 1 fighter (dwarf soldier)', () => {
  const sheet = deriveSheet(fighter(), reg);

  it('applies background ASI', () => {
    expect(sheet.abilities.str.score).toBe(17);
    expect(sheet.abilities.con.score).toBe(15);
  });
  it('computes HP with dwarven toughness', () => {
    // d10 max + Con 2 + Dwarven Toughness 1
    expect(sheet.maxHp).toBe(13);
  });
  it('computes AC from chain mail + Defense only while armored', () => {
    expect(sheet.ac).toBe(17);
  });
  it('saves and skills', () => {
    expect(sheet.abilities.str.save).toBe(5);
    expect(sheet.abilities.dex.save).toBe(1);
    expect(sheet.skills.find((s) => s.id === 'athletics')!.bonus).toBe(5);
    expect(sheet.passivePerception).toBe(10 + 1 + 2);
  });
  it('builds greatsword attack', () => {
    const gs = sheet.attacks.find((a) => a.name === 'Greatsword')!;
    expect(gs.bonus).toBe(5);
    expect(gs.damage).toBe('2d6+3');
  });
  it('dwarf traits: darkvision 120, poison resistance', () => {
    expect(sheet.darkvision).toBe(120);
    expect(sheet.resistances).toContain('poison');
  });
  it('lists remaining pending choices (languages, mastery, gaming set)', () => {
    const keys = pendingChoices(sheet.collected).map((c) => c.key);
    expect(keys).toContain('core:languages');
    expect(keys).toContain('class:fighter:fighter-weapon-mastery:mastery');
    expect(keys).toContain('background:tool-1');
    expect(keys).not.toContain('class:fighter:skills');
  });
});

describe('leveling', () => {
  it('fighter 4 gets ASI feat choice and fixed HP', () => {
    let c = fighter();
    for (let i = 0; i < 3; i++) c = addLevel(c, 'fighter', reg);
    c = setChoice(c, 'class:fighter:fighter-ability-score-improvement:feat', ['ability-score-improvement']);
    c = setChoice(c, 'feat@class:fighter:fighter-ability-score-improvement:feat:asi', ['str', 'con']);
    const s = deriveSheet(c, reg);
    expect(s.level).toBe(4);
    expect(s.abilities.str.score).toBe(18);
    expect(s.abilities.con.score).toBe(16);
    // 10 + 3*6 fixed, +3 Con each level, +1 dwarf each level
    expect(s.maxHp).toBe(10 + 18 + 4 * 3 + 4);
    expect(s.collected.needsSubclass).toEqual(['fighter']);
  });

  it('weapon mastery count grows with fighter level', () => {
    let c = fighter();
    for (let i = 0; i < 3; i++) c = addLevel(c, 'fighter', reg);
    const m = deriveSheet(c, reg).collected.choices.find((x) => x.choice.kind === 'weaponMastery')!;
    expect(m.count).toBe(4);
  });

  it('rolled HP uses rng', () => {
    const c = addLevel(fighter(), 'fighter', reg, 'roll', fixedRng(3));
    expect(c.levels[1].hpGain).toBe(3);
  });
});

describe('spellcasting', () => {
  function wizard(level: number) {
    let c = newCharacter('w');
    c = { ...c, speciesId: 'elf', lineageId: 'elven-lineage-high-elf', backgroundId: 'sage' };
    c.baseAbilities = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 };
    for (let i = 0; i < level; i++) c = addLevel(c, 'wizard', reg);
    c = setChoice(c, 'background:asi', ['int', 'int', 'con']);
    c = setChoice(c, 'species:lineage-ability', ['int']);
    return c;
  }

  it('wizard 5 slots, DC, cantrips', () => {
    const s = deriveSheet(wizard(5), reg);
    expect(s.slots.slice(0, 4)).toEqual([4, 3, 2, 0]);
    expect(s.casters[0].saveDc).toBe(8 + 3 + 3);
    expect(s.casters[0].cantrips).toBe(4);
  });

  it('high elf lineage spells unlock by character level', () => {
    const at1 = deriveSheet(wizard(1), reg).spells.map((x) => x.spell.id);
    const at5 = deriveSheet(wizard(5), reg).spells.map((x) => x.spell.id);
    expect(at1).toContain('prestidigitation');
    expect(at1).not.toContain('detect-magic');
    expect(at5).toEqual(expect.arrayContaining(['detect-magic', 'misty-step']));
  });

  it('sage magic initiate list is preset to wizard', () => {
    const s = deriveSheet(wizard(1), reg);
    const list = s.collected.choices.find((x) => x.key === 'feat@background:list')!;
    expect(list.values).toEqual(['wizard']);
    expect(list.locked).toBe(true);
  });

  it('multiclass slot table: paladin 2 / sorcerer 3 = caster level 4', () => {
    let c = newCharacter('m');
    c = { ...c, speciesId: 'human', backgroundId: 'soldier' };
    c.baseAbilities = { str: 13, dex: 10, con: 14, int: 8, wis: 10, cha: 15 };
    c = addLevel(c, 'paladin', reg);
    c = addLevel(c, 'paladin', reg);
    for (let i = 0; i < 3; i++) c = addLevel(c, 'sorcerer', reg);
    const s = deriveSheet(c, reg);
    expect(s.slots.slice(0, 3)).toEqual([4, 3, 0]);
  });

  it('warlock pact slots are separate', () => {
    let c = newCharacter('k');
    c = { ...c, speciesId: 'human', backgroundId: 'sage' };
    for (let i = 0; i < 5; i++) c = addLevel(c, 'warlock', reg);
    const s = deriveSheet(c, reg);
    expect(s.pactSlots).toEqual({ count: 2, level: 3 });
    expect(s.slots.every((n) => n === 0)).toBe(true);
  });
});

describe('unarmored defense + multiclass prereqs', () => {
  it('barbarian AC = 10 + Dex + Con', () => {
    let c = newCharacter('b');
    c = { ...c, speciesId: 'orc', backgroundId: 'soldier' };
    c.baseAbilities = { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 10 };
    c = addLevel(c, 'barbarian', reg);
    expect(deriveSheet(c, reg).ac).toBe(14);
    const blockers = multiclassBlockers(c, 'wizard', deriveSheet(c, reg), reg);
    expect(blockers).toEqual(['Wizard: INT 13']);
  });
});

describe('hp tracking', () => {
  it('temp HP absorbs damage, heal caps at max', () => {
    const c0 = fighter();
    const s = deriveSheet(c0, reg);
    let c = { ...c0, play: { ...c0.play, tempHp: 5 } };
    c = applyDamage(c, s, 8);
    expect(c.play.tempHp).toBe(0);
    expect(c.play.hp).toBe(s.maxHp - 3);
    c = heal(c, s, 100);
    expect(c.play.hp).toBeNull();
    c = longRest({ ...c, play: { ...c.play, slotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0] } }, s);
    expect(c.play.slotsUsed[0]).toBe(0);
  });
});

describe('dice', () => {
  it('parses expressions', () => {
    expect(parseDice('2d6+3')).toEqual({ dice: [{ count: 2, sides: 6, sign: 1 }], flat: 3 });
    expect(parseDice('d20-1')).toEqual({ dice: [{ count: 1, sides: 20, sign: 1 }], flat: -1 });
    expect(parseDice('hello')).toBeNull();
  });
  it('advantage keeps higher d20', () => {
    const seq = [4, 17];
    const r = roll('t', '1d20+2', 'advantage', () => seq.shift()!)!;
    expect(r.total).toBe(19);
  });
});

describe('class-feature spells', () => {
  it('paladin 5 (Devotion) has smite, steed and oath spells always prepared', () => {
    let c = newCharacter('p');
    c = { ...c, speciesId: 'human', backgroundId: 'soldier', subclasses: { paladin: 'oath-of-devotion' } };
    for (let i = 0; i < 5; i++) c = addLevel(c, 'paladin', reg);
    const prepared = deriveSheet(c, reg).spells.filter((s) => s.alwaysPrepared).map((s) => s.spell.id);
    expect(prepared).toEqual(
      expect.arrayContaining(['divine-smite', 'find-steed', 'protection-from-evil-and-good', 'shield-of-faith', 'aid', 'zone-of-truth']),
    );
    expect(prepared).not.toContain('beacon-of-hope'); // Paladin 9
  });

  it('druid 1 always has Speak with Animals', () => {
    let c = newCharacter('d');
    c = { ...c, speciesId: 'human', backgroundId: 'sage' };
    c = addLevel(c, 'druid', reg);
    expect(deriveSheet(c, reg).spells.map((s) => s.spell.id)).toContain('speak-with-animals');
  });

  it('lore bard magical discoveries picks become always prepared', () => {
    let c = newCharacter('b');
    c = { ...c, speciesId: 'human', backgroundId: 'sage', subclasses: { bard: 'college-of-lore' } };
    for (let i = 0; i < 6; i++) c = addLevel(c, 'bard', reg);
    const key = 'subclass:college-of-lore:college-of-lore-magical-discoveries:discoveries';
    expect(deriveSheet(c, reg).collected.choices.find((x) => x.key === key)?.count).toBe(2);
    c = setChoice(c, key, ['fireball', 'guidance']);
    const s = deriveSheet(c, reg).spells.find((x) => x.spell.id === 'fireball')!;
    expect(s.alwaysPrepared).toBe(true);
    expect(s.ability).toBe('cha');
  });
});
