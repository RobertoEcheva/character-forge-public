import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { Choice, Effect, Feature } from '../types/rules';
import {
  backgroundSchema,
  classSchema,
  featSchema,
  itemSchema,
  keywordSchema,
  speciesSchema,
  spellSchema,
  subclassSchema,
} from './schema';
import { SRD } from './srd';

const cases: [string, unknown[], z.ZodTypeAny][] = [
  ['classes', SRD.classes, classSchema],
  ['subclasses', SRD.subclasses, subclassSchema],
  ['species', SRD.species, speciesSchema],
  ['backgrounds', SRD.backgrounds, backgroundSchema],
  ['feats', SRD.feats, featSchema],
  ['spells', SRD.spells, spellSchema],
  ['items', SRD.items, itemSchema],
  ['keywords', SRD.keywords, keywordSchema],
];

describe('SRD data matches schema', () => {
  for (const [name, list, schema] of cases)
    it(name, () => {
      const errors = list.flatMap((x, i) => {
        const r = schema.safeParse(x);
        return r.success ? [] : [`${name}[${i}] ${(x as { id?: string }).id}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`];
      });
      expect(errors).toEqual([]);
    });

  it('ids are unique per type', () => {
    for (const [name, list] of cases) {
      const ids = (list as { id: string }[]).map((x) => x.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it('references resolve', () => {
    const feats = new Set(SRD.feats.map((f) => f.id));
    const classes = new Set(SRD.classes.map((c) => c.id));
    for (const b of SRD.backgrounds) expect(b.feat && feats.has(b.feat), b.id).toBe(true);
    for (const s of SRD.subclasses) expect(classes.has(s.classId), s.id).toBe(true);
  });
});

describe('always-prepared spells in feature text are wired', () => {
  const spellIdByName = new Map(SRD.spells.map((s) => [s.name.toLowerCase().replace(/’/g, "'"), s.id]));
  const features: Feature[] = [...SRD.classes.flatMap((c) => c.features), ...SRD.subclasses.flatMap((s) => s.features)];

  const grantedSpells = (f: Feature) => {
    const fromEffects = (effects?: Effect[]) => (effects ?? []).flatMap((e) => (e.type === 'spell' ? [e.spell] : []));
    const fromChoices = (choices?: Choice[]): string[] =>
      (choices ?? []).flatMap((c) => (c.kind === 'option' ? c.options.flatMap((o) => fromEffects(o.effects)) : []));
    return new Set([...fromEffects(f.effects), ...fromChoices(f.choices)]);
  };

  it('named spells ("always have the X spell prepared")', () => {
    const missing: string[] = [];
    for (const f of features)
      for (const m of f.description.matchAll(/always have the ([A-Z][^.]*?) spells? prepared/g)) {
        const granted = grantedSpells(f);
        for (const name of m[1].split(' and ')) {
          const id = spellIdByName.get(name.toLowerCase().replace(/’/g, "'"));
          if (!id || !granted.has(id)) missing.push(`${f.id}: ${name}`);
        }
      }
    expect(missing).toEqual([]);
  });

  it('table or chosen spells ("always have the listed/chosen/these spells prepared")', () => {
    const missing = features
      .filter((f) => /always have (the listed|the chosen|these|those) spells prepared/.test(f.description))
      .filter((f) => grantedSpells(f).size === 0 && !(f.choices ?? []).some((c) => c.kind === 'spell' || c.kind === 'option'))
      .map((f) => f.id);
    expect(missing).toEqual([]);
  });
});
