import { describe, expect, it } from 'vitest';
import { createRegistry } from '../data/registry';
import { SRD } from '../data/srd';
import { createLinker, type Segment } from './linker';

const linker = createLinker(createRegistry(SRD));
const refs = (segs: Segment[]) => segs.flatMap((s) => (typeof s === 'string' ? [] : [s.ref]));

describe('keyword linker', () => {
  it('links conditions regardless of case', () => {
    expect(refs(linker.link('The target falls prone.'))).toEqual(['prone']);
    expect(refs(linker.link('It has the Prone condition.'))).toEqual(['prone']);
  });
  it('prefers longest match', () => {
    expect(refs(linker.link('As a Bonus Action you can'))).toEqual(['bonus-action']);
  });
  it('does not link generic words', () => {
    expect(refs(linker.link('You make an attack with a light weapon in range.'))).toEqual([]);
  });
  it('links multi-word spells and single-word spells only with "spell"', () => {
    expect(refs(linker.link("You always have the Hunter's Mark spell prepared."))).toContain('spell:hunters-mark');
    expect(refs(linker.link('You cast the Shield spell.'))).toContain('spell:shield');
    expect(refs(linker.link('You can use a Shield and still gain this benefit.'))).not.toContain('spell:shield');
  });
  it('respects word boundaries and keeps text intact', () => {
    const text = 'Unproned folks and Advantage-free rolls, then Advantage.';
    const segs = linker.link(text);
    expect(segs.map((s) => (typeof s === 'string' ? s : s.text)).join('')).toBe(text);
    expect(refs(segs)).toEqual(['advantage']);
  });
  it('links feat names as a whole', () => {
    expect(refs(linker.link('You gain the Ability Score Improvement feat'))).toEqual(['feat:ability-score-improvement']);
  });
  it('excludes self reference', () => {
    expect(refs(linker.link('While you have the Prone condition', 'prone'))).toEqual([]);
  });
});
