import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '../data/registry';
import { RULES } from '../data/srd';
import { deriveSheet } from '../engine/derive';
import { featureRows } from '../engine/featureRows';
import { addLevel, setChoice } from '../engine/ops';
import { newCharacter, type Character } from '../types/character';
import { renderCharacterPdf } from './pdfSheet';
import { buildPdfModel } from './sheetModel';

const reg = createRegistry(RULES['2024']);

function fighter(levels: number): Character {
  let c: Character = { ...newCharacter('f'), name: 'Brakka Ironhide', speciesId: 'dwarf', backgroundId: 'soldier' };
  for (let i = 0; i < levels; i++) c = addLevel(c, 'fighter', reg);
  c = setChoice(c, 'class:fighter:fighter-fighting-style:feat', ['defense']);
  c = setChoice(c, 'class:fighter:fighter-ability-score-improvement:feat', ['alert']);
  return {
    ...c,
    companions: [{ uid: 'wolf', creatureId: 'wolf', name: 'Grey Wolf', kind: 'companion', hp: null }],
    inventory: [{ uid: 'i1', name: 'Rope', qty: 2 }],
    coins: { cp: 3, sp: 0, ep: 0, gp: 15, pp: 0 },
  };
}

function wizard(): Character {
  let c: Character = { ...newCharacter('w'), name: 'Æsir Øyvind 🧙', speciesId: 'elf', backgroundId: 'sage' };
  for (let i = 0; i < 3; i++) c = addLevel(c, 'wizard', reg);
  return { ...c, spells: { wizard: { cantrips: ['fire-bolt', 'light'], prepared: ['magic-missile', 'shield'] } } };
}

const model = (c: Character) => buildPdfModel(c, deriveSheet(c, reg), reg);

describe('PDF model', () => {
  it('lists feature titles only, with picks merged in', () => {
    const c = fighter(4);
    const m = model(c);
    expect(m.features).toContain('Fighting Style: Defense');
    expect(m.features).toContain('Ability Score Improvement: Alert');
    expect(m.features.filter((f) => f.startsWith('Alert'))).toHaveLength(0);
    // No rules text: every line is a row's name (plus its pick).
    const rows = featureRows(deriveSheet(c, reg), reg);
    for (const line of m.features) expect(rows.some((r) => line === r.name || line.startsWith(`${r.name}: `))).toBe(true);
  });

  it('leaves companions out', () => {
    expect(JSON.stringify(model(fighter(1)))).not.toContain('Grey Wolf');
  });

  it('has no spell page data for a non-caster', () => {
    expect(model(fighter(1)).spells).toBeNull();
  });

  it('groups a caster’s spells by level with slot counts', () => {
    const c = wizard();
    const m = model(c);
    const s = deriveSheet(c, reg);
    const cantrips = m.spells!.levels.find((l) => l.level === 0)!;
    expect(cantrips.spells.map((x) => x.name)).toEqual(expect.arrayContaining(['Fire Bolt', 'Light']));
    const first = m.spells!.levels.find((l) => l.level === 1)!;
    expect(first.slots).toBe(s.slots[0]);
    expect(first.spells.map((x) => x.name)).toEqual(expect.arrayContaining(['Magic Missile', 'Shield']));
  });
});

describe('PDF render', () => {
  const pages = async (c: Character) => {
    const doc = await PDFDocument.load(await renderCharacterPdf(model(c)));
    return doc.getPages().map((p) => p.getSize());
  };

  it('is one A4 page for a non-caster', async () => {
    const sizes = await pages(fighter(8));
    expect(sizes).toHaveLength(1);
    expect(Math.round(sizes[0].width)).toBe(595);
    expect(Math.round(sizes[0].height)).toBe(842);
  });

  it('adds a spell page for a caster, and survives characters the PDF fonts lack', async () => {
    expect(await pages(wizard())).toHaveLength(2);
  });
});
