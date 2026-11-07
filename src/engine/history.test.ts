import { describe, expect, it } from 'vitest';
import { createRegistry } from '../data/registry';
import { RULES } from '../data/srd';
import { newCharacter, type Character } from '../types/character';
import { deriveSheet } from './derive';
import { levelHistory } from './history';
import { addLevel, recordLevelSpells, setChoice } from './ops';

const reg = createRegistry(RULES['2024']);
const fixed = () => 1;

function build(classes: string[]): Character {
  let c: Character = { ...newCharacter('h'), speciesId: 'dwarf', backgroundId: 'soldier' };
  c.baseAbilities = { str: 15, dex: 13, con: 14, int: 13, wis: 12, cha: 10 };
  for (const cls of classes) c = addLevel(c, cls, reg, 'roll', fixed);
  return c;
}

describe('levelHistory', () => {
  it('puts each level’s features and picks on that level', () => {
    let c = build(Array(5).fill('fighter'));
    c = setChoice(c, 'class:fighter:fighter-fighting-style:feat', ['defense']);
    c = setChoice(c, 'class:fighter:fighter-ability-score-improvement:feat', ['ability-score-improvement']);
    c = setChoice(c, 'feat@class:fighter:fighter-ability-score-improvement:feat:asi', ['str', 'str']);
    const steps = levelHistory(c, deriveSheet(c, reg), reg);

    expect(steps).toHaveLength(5);
    expect(steps[0].choiceKeys).toEqual(expect.arrayContaining(['class:fighter:skills', 'background:asi', 'class:fighter:fighter-fighting-style:feat']));
    expect(steps[0].features.some((r) => r.name === 'Fighting Style' && r.pickLabel === 'Defense')).toBe(true);

    const l4 = steps[3];
    expect(l4.classLevel).toBe(4);
    expect(l4.choiceKeys).toEqual(
      expect.arrayContaining(['class:fighter:fighter-ability-score-improvement:feat', 'feat@class:fighter:fighter-ability-score-improvement:feat:asi']),
    );
    expect(l4.features.find((r) => r.name === 'Ability Score Improvement')?.pickLabel).toBe('+2 Str');
    expect(steps[2].subclass).toEqual({ classId: 'fighter' });
    // Roll of 1 + Con 2 (14 base; soldier ASI not picked).
    expect(l4.hp).toEqual({ gain: 3, rolled: true });
    expect(steps[0].hp.gain).toBe(12);
    expect(steps[0].spells).toBe('not-recorded');
    expect(l4.spells).toEqual({ added: [], removed: [] });
  });

  it('maps a multiclass level to the right character level', () => {
    const c = build(['fighter', 'fighter', 'wizard', 'fighter']);
    const steps = levelHistory(c, deriveSheet(c, reg), reg);
    expect(steps.map((s) => `${s.classId} ${s.classLevel}`)).toEqual(['fighter 1', 'fighter 2', 'wizard 1', 'fighter 3']);
    expect(steps[2].features.every((r) => r.origin.classId === 'wizard' || r.origin.kind === 'feat')).toBe(true);
    expect(steps[3].subclass).toEqual({ classId: 'fighter' });
  });
});

describe('recordLevelSpells', () => {
  const base = () => build(['wizard', 'wizard']);
  const withSpells = (c: Character, prepared: string[]) => ({ ...c, spells: { wizard: { cantrips: [], prepared } } });

  it('records added and removed spells on the last level', () => {
    const prev = withSpells(base(), ['shield', 'sleep']);
    const next = recordLevelSpells(prev, withSpells(prev, ['shield', 'magic-missile']));
    expect(next.levels[1].spells).toEqual({ added: ['magic-missile'], removed: ['sleep'] });
  });

  it('cancels out a spell added and removed in the same level', () => {
    const prev = withSpells(base(), ['shield']);
    const mid = recordLevelSpells(prev, withSpells(prev, ['shield', 'sleep']));
    const back = recordLevelSpells(mid, withSpells(mid, ['shield']));
    expect(back.levels[1].spells).toEqual({ added: [], removed: [] });
  });

  it('works on levels saved before tracking and skips level 1', () => {
    const old = base();
    old.levels = old.levels.map((e) => ({ classId: e.classId, hpGain: e.hpGain }));
    const next = recordLevelSpells(old, withSpells(old, ['sleep']));
    expect(next.levels[1].spells).toEqual({ added: ['sleep'], removed: [] });
    const one = build(['wizard']);
    expect(recordLevelSpells(one, withSpells(one, ['sleep'])).levels[0].spells).toBeUndefined();
  });
});
