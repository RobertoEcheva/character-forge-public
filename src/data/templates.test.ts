import { describe, expect, it } from 'vitest';
import { deriveSheet } from '../engine/derive';
import { addLevel, setChoice } from '../engine/ops';
import { newCharacter, type Character } from '../types/character';
import type { Choice, Edition, Effect } from '../types/rules';
import { createRegistry, mergeRules, type CustomContent } from './registry';
import { parseImport } from './importContent';
import { RULES } from './srd';

// The files users copy from templates/ must import cleanly, exactly as the Custom content page does.
const files = import.meta.glob('../../templates/*.json', { eager: true, import: 'default' });

/** Same path as the Custom content page's import, viewed on the 2024 tab. */
function imported(raw: unknown): CustomContent {
  const r = parseImport(raw, '2024');
  if ('error' in r) throw new Error(r.error);
  return r.content;
}

const refsOf = (effects: Effect[] = [], choices: Choice[] = []): Effect[] => [
  ...effects.flatMap((e) => (e.type === 'toggle' ? [e, ...refsOf(e.effects)] : [e])),
  ...choices.flatMap((c) => (c.kind === 'option' ? c.options.flatMap((o) => refsOf(o.effects, o.choices)) : [])),
];

describe('templates/', () => {
  it('has a template for every importable kind', () => {
    const kinds = new Set(Object.values(files).flatMap((f) => Object.keys(f as object).filter((k) => !k.startsWith('_'))));
    for (const k of ['feats', 'backgrounds', 'species', 'subclasses', 'classes', 'spells', 'items', 'keywords', 'creatures']) expect(kinds, k).toContain(k);
  });

  for (const [path, raw] of Object.entries(files))
    it(`${path.split('/').pop()} imports and its references resolve`, () => {
      const content = imported(raw);
      for (const edition of ['2024', '2014'] as Edition[]) {
        const reg = createRegistry(mergeRules(RULES[edition], content));
        const mine = <T extends { edition?: Edition }>(xs?: T[]) => (xs ?? []).filter((x) => (x.edition ?? '2024') === edition);
        const problems: string[] = [];
        const check = (where: string, effects: Effect[]) => {
          for (const e of effects) {
            if (e.type === 'spell' && !reg.spells.has(e.spell)) problems.push(`${where}: unknown spell ${e.spell}`);
            if (e.type === 'tool' && !reg.tools.has(e.tool)) problems.push(`${where}: unknown tool ${e.tool}`);
          }
        };
        for (const f of mine(content.feats)) check(f.id, refsOf(f.effects, f.choices));
        for (const s of mine(content.species))
          for (const t of [...s.traits, ...(s.lineages ?? []).flatMap((l) => l.traits)]) check(`${s.id}/${t.id}`, refsOf(t.effects, t.choices));
        for (const s of mine(content.subclasses)) {
          if (!reg.classes.has(s.classId)) problems.push(`${s.id}: unknown class ${s.classId}`);
          for (const f of s.features) check(`${s.id}/${f.id}`, refsOf(f.effects, f.choices));
        }
        for (const b of mine(content.backgrounds)) {
          if (b.feat && !reg.feats.has(b.feat)) problems.push(`${b.id}: unknown feat ${b.feat}`);
          check(b.id, refsOf(b.effects, b.choices));
        }
        for (const c of content.classes ?? []) for (const f of c.features) check(`${c.id}/${f.id}`, refsOf(f.effects, f.choices));
        for (const i of mine(content.items)) check(i.id, i.magic?.effects ?? []);
        expect(problems).toEqual([]);
      }
    });

  it('import errors point at the entry', () => {
    const r = parseImport({ feats: [{ id: 'x', name: 'Broken Feat', type: 'general', repeatable: false }] }, '2024');
    expect('error' in r && r.error).toBe('feats → Broken Feat: description: Required');
    expect(parseImport({ feets: [] }, '2024')).toEqual({ error: 'Unknown section "feets". Use: classes, subclasses, species, backgrounds, feats, spells, items, keywords, creatures.' });
  });

  it('the examples work on a character', () => {
    const all = Object.values(files).reduce<CustomContent>((acc, raw) => {
      const c = imported(raw);
      for (const [k, v] of Object.entries(c)) (acc as Record<string, unknown[]>)[k] = [...((acc as Record<string, unknown[]>)[k] ?? []), ...(v as unknown[])];
      return acc;
    }, {});
    const reg = createRegistry(mergeRules(RULES['2024'], all));

    // Warden 5 (template class) with the Bulwark subclass, Tidekin species, River Guide background.
    let c: Character = { ...newCharacter('t'), speciesId: 'tidekin', lineageId: 'tidekin-warm-current', backgroundId: 'river-guide', subclasses: { warden: 'bulwark' } };
    for (let i = 0; i < 5; i++) c = addLevel(c, 'warden', reg);
    c = setChoice(c, 'species:lineage-ability', ['wis']);
    c = setChoice(c, 'class:warden:warden-asi-4:feat', ['wayfinder-adept']);
    const s = deriveSheet(c, reg);
    const spells = s.spells.map((x) => x.spell.id);
    expect(spells).toEqual(expect.arrayContaining(['ray-of-frost', 'cure-wounds', 'misty-step']));
    expect(s.speeds).toContainEqual({ mode: 'swim', value: 30 });
    expect(s.resistances).toEqual(expect.arrayContaining(['cold', 'poison']));
    expect(s.counters.some((k) => k.label === 'Wayfinder: free Misty Step')).toBe(true);
    expect(s.toggles.some((t) => t.id === 'guard-stance')).toBe(true);
  });
});
