import { describe, expect, it } from 'vitest';
import { createRegistry } from './registry';
import { RULES } from './srd';
import { blazonOf, defaultBlazon, describeBlazon, isMetal } from './blazon';
import { inventoryFromBundle, isCustomPick } from '../engine/ops';
import { newCharacter } from '../types/character';
import type { EquipmentBundle } from '../types/rules';

describe('coat of arms', () => {
  it('gives every id stable default arms that keep the rule of tincture', () => {
    for (const id of ['a', 'demo', 'x9k2', 'another-hero', '12345']) {
      const b = defaultBlazon(id);
      expect(defaultBlazon(id)).toEqual(b);
      expect(isMetal(b.field)).toBe(false);
      expect(isMetal(b.chargeTincture)).toBe(true);
    }
  });

  it('uses chosen arms over the default and describes them in plain words', () => {
    const c = newCharacter('demo');
    expect(blazonOf(c)).toEqual(defaultBlazon('demo'));
    const mine = { field: 'azure', division: 'per-pale', second: 'or', charge: 'mullet', chargeTincture: 'argent' } as const;
    expect(blazonOf({ ...c, details: { ...c.details, blazon: mine } })).toBe(mine);
    expect(describeBlazon(mine)).toBe('Blue and gold per pale, a silver star');
  });
});

describe('starting gear picks', () => {
  const reg = createRegistry(RULES['2024']);
  const bundle: EquipmentBundle = { label: 'A', gp: 0, items: [{ item: '', name: 'Druidic Focus', count: 1, choose: { label: 'druidic focus', options: ['sprig-of-mistletoe', 'yew-wand'] } }] };

  it('adds a focus the player describes as a named item', () => {
    expect(isCustomPick('custom:Raven skull')).toBe(true);
    expect(isCustomPick('custom:  ')).toBe(false);
    const [item] = inventoryFromBundle(bundle, reg, 'class', { 0: ['custom:Raven skull'] });
    expect(item.name).toBe('Raven skull');
    expect(item.itemId).toBeUndefined();
  });

  it('falls back to the generic name while the description is empty', () => {
    const [item] = inventoryFromBundle(bundle, reg, 'class', { 0: ['custom:'] });
    expect(item.name).toBe('Druidic Focus');
  });
});
