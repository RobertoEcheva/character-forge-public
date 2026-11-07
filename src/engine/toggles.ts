import type { Edition, Effect } from '../types/rules';

export type ToggleDef = Extract<Effect, { type: 'toggle' }> & {
  /** Feature that grants it (absent for common spell effects). */
  source?: string;
  classId?: string;
};

const t = (
  id: string,
  label: string,
  effects: Effect[],
  description: string,
  concentration = false,
): ToggleDef => ({ type: 'toggle', id, label, effects, description, ...(concentration ? { concentration } : {}) });

/** Spell effects people commonly have on them, whoever cast the spell. */
export function builtinToggles(edition: Edition): ToggleDef[] {
  return [
    t(
      'bless',
      'Bless',
      [
        { type: 'rollBonus', applies: 'attack', dice: '1d4' },
        { type: 'rollBonus', applies: 'save', dice: '1d4' },
      ],
      'Add 1d4 to attack rolls and saving throws.',
      true,
    ),
    t(
      'bane',
      'Bane',
      [
        { type: 'rollBonus', applies: 'attack', dice: '-1d4' },
        { type: 'rollBonus', applies: 'save', dice: '-1d4' },
      ],
      'Subtract 1d4 from attack rolls and saving throws.',
      true,
    ),
    t('guidance', 'Guidance', [{ type: 'rollBonus', applies: 'check', dice: '1d4' }], 'Add 1d4 to ability checks.', true),
    t('shield', 'Shield (spell)', [{ type: 'acBonus', value: 5 }], '+5 AC until the start of your next turn.'),
    t('shield-of-faith', 'Shield of Faith', [{ type: 'acBonus', value: 2 }], '+2 AC.', true),
    t(
      'mage-armor',
      'Mage Armor',
      [{ type: 'acFormula', name: 'Mage Armor', base: 13, abilities: ['dex'], allowShield: true }],
      'Unarmored AC becomes 13 + Dex.',
    ),
    t('haste', 'Haste', [{ type: 'acBonus', value: 2 }], '+2 AC, doubled Speed, Advantage on Dex saves, an extra action.', true),
    t(
      'barkskin',
      'Barkskin',
      [{ type: 'acFloor', value: edition === '2024' ? 17 : 16 }],
      `AC can't be lower than ${edition === '2024' ? 17 : 16}.`,
      edition === '2014',
    ),
    t(
      'hunters-mark',
      "Hunter's Mark",
      [{ type: 'damageRider', id: 'hunters-mark', label: "Hunter's Mark", dice: '1d6', when: 'any', auto: true }],
      'Extra 1d6 damage to the marked target.',
      true,
    ),
    t('hex', 'Hex', [{ type: 'damageRider', id: 'hex', label: 'Hex', dice: '1d6', when: 'any', auto: true }], 'Extra 1d6 Necrotic damage to the cursed target.', true),
  ];
}
