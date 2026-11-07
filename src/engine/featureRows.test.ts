import { describe, expect, it } from 'vitest';
import { createRegistry } from '../data/registry';
import { RULES } from '../data/srd';
import { newCharacter, type Character } from '../types/character';
import { deriveSheet } from './derive';
import { asiLabel, featureRows } from './featureRows';
import { addLevel, setChoice } from './ops';

const reg24 = createRegistry(RULES['2024']);
const reg14 = createRegistry(RULES['2014']);

function fighter24(levels: number): Character {
  let c: Character = { ...newCharacter('f'), speciesId: 'dwarf', backgroundId: 'soldier' };
  for (let i = 0; i < levels; i++) c = addLevel(c, 'fighter', reg24);
  c = setChoice(c, 'class:fighter:fighter-fighting-style:feat', ['defense']);
  return c;
}

describe('featureRows', () => {
  it('formats ASI picks', () => {
    expect(asiLabel(['str', 'str'])).toBe('+2 Str');
    expect(asiLabel(['str', 'con'])).toBe('+1 Str, +1 Con');
  });

  it('merges feat picks into their feature (2024 fighter 8)', () => {
    let c = fighter24(8);
    c = setChoice(c, 'class:fighter:fighter-ability-score-improvement:feat', ['ability-score-improvement']);
    c = setChoice(c, 'feat@class:fighter:fighter-ability-score-improvement:feat:asi', ['str', 'str']);
    c = setChoice(c, 'class:fighter:fighter-ability-score-improvement-6:feat', ['alert']);
    const rows = featureRows(deriveSheet(c, reg24), reg24);

    const style = rows.find((r) => r.name === 'Fighting Style')!;
    expect(style.pickLabel).toBe('Defense');
    expect(style.picks[0].description).toMatch(/Armor Class/);

    const asis = rows.filter((r) => r.name === 'Ability Score Improvement');
    expect(asis.map((r) => [r.level, r.pickLabel ?? null, Boolean(r.pending)])).toEqual([
      [4, '+2 Str', false],
      [6, 'Alert', false],
      [8, null, true],
    ]);

    const feats = rows.filter((r) => r.group === 'Feats').map((r) => r.name);
    expect(feats).not.toContain('Defense');
    expect(feats).not.toContain('Alert');
    expect(feats).not.toContain('Ability Score Improvement');
  });

  it('keeps the background origin feat under Feats', () => {
    const rows = featureRows(deriveSheet(fighter24(1), reg24), reg24);
    const soldierFeat = reg24.backgrounds.get('soldier')!.feat!;
    expect(rows.some((r) => r.group === 'Feats' && r.name === reg24.feats.get(soldierFeat)!.name)).toBe(true);
  });

  it('shows the 2014 Fighting Style option as the pick', () => {
    let c: Character = { ...newCharacter('x'), ruleset: '2014', speciesId: 'dwarf', lineageId: 'hill-dwarf', backgroundId: 'acolyte' };
    c = addLevel(c, 'fighter', reg14);
    c = setChoice(c, 'class:fighter:fighter-fighting-style:options', ['fighter-fighting-style-defense']);
    const style = featureRows(deriveSheet(c, reg14), reg14).find((r) => r.name === 'Fighting Style')!;
    expect(style.pickLabel).toBe('Defense');
  });
});
