import type { CustomContent, Registry } from '../data/registry';
import type {
  Ability,
  BackgroundDef,
  Effect,
  FeatDef,
  Feature,
  ItemDef,
  KeywordDef,
  SkillId,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from '../types/rules';
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_IDS } from '../types/rules';
import type { CreatureDef } from '../types/creature';

export type FieldValue = string | number | boolean | string[] | FeatureDraft[] | SpellRow[] | NamedText[] | ActionDraft[] | Effect[];

export interface NamedText {
  name: string;
  description: string;
}

/** One creature action; attack and damage are optional (e.g. a non-attack action). */
export interface ActionDraft {
  name: string;
  description: string;
  attack: string;
  damage: string;
  damageType: string;
}

/** One row of a subclass spell table: spells always prepared from this class level. */
export interface SpellRow {
  level: number;
  spells: string[];
}

export interface FeatureDraft {
  name: string;
  level: number;
  description: string;
}

export type Field = (
  | { key: string; label: string; type: 'text' | 'textarea'; required?: boolean; hint?: string }
  /** Number fields sharing a group render side by side under the group's heading. */
  | { key: string; label: string; type: 'number'; min?: number; max?: number; group?: string }
  | { key: string; label: string; type: 'checkbox' }
  | { key: string; label: string; type: 'select'; options: (reg: Registry) => { id: string; name: string }[] }
  | { key: string; label: string; type: 'multi'; max?: number; options: (reg: Registry) => { id: string; name: string }[] }
  | { key: string; label: string; type: 'features'; levelLabel: string }
  | { key: string; label: string; type: 'spellsByLevel'; hint?: string }
  | { key: string; label: string; type: 'namedText'; itemLabel: string }
  | { key: string; label: string; type: 'actions' }
  /** Effects granted by an item (resistance, speed, a spell…), edited row by row. */
  | { key: string; label: string; type: 'effects'; hint?: string }
) & {
  /** Show the field only when this returns true for the current draft. */
  when?: (d: Draft) => boolean;
};

export type Draft = Record<string, FieldValue>;

export interface ContentType<T extends { id: string }> {
  key: Exclude<keyof CustomContent, 'packs'>;
  label: string;
  plural: string;
  fields: Field[];
  empty: () => Draft;
  toEntity: (d: Draft) => T;
  fromEntity: (e: T) => Draft;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const abilityOptions = () => ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a] }));
const skillOptions = () => SKILL_IDS.map((id) => ({ id, name: SKILLS[id].name }));
const str = (v: FieldValue | undefined) => (typeof v === 'string' ? v : '');
const num = (v: FieldValue | undefined, d = 0) => (typeof v === 'number' ? v : Number(v) || d);
const list = (v: FieldValue | undefined) => (Array.isArray(v) ? (v as string[]) : []);
const feats = (v: FieldValue | undefined) => (Array.isArray(v) ? (v as FeatureDraft[]) : []);
const spellRows = (v: FieldValue | undefined) => (Array.isArray(v) ? (v as SpellRow[]) : []);

const toFeatures = (prefix: string, drafts: FeatureDraft[]): Feature[] =>
  drafts
    .filter((f) => f.name.trim())
    .map((f) => ({ id: `${prefix}-${slugify(f.name)}`, name: f.name.trim(), level: f.level || 1, description: f.description.trim() }));
const fromFeatures = (fs: Feature[]): FeatureDraft[] => fs.map((f) => ({ name: f.name, level: f.level, description: f.description }));

export const FEAT: ContentType<FeatDef> = {
  key: 'feats',
  label: 'Feat',
  plural: 'Feats',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    {
      key: 'type',
      label: 'Category',
      type: 'select',
      options: () => [
        { id: 'origin', name: 'Origin' },
        { id: 'general', name: 'General' },
        { id: 'fighting-style', name: 'Fighting Style' },
        { id: 'epic-boon', name: 'Epic Boon' },
      ],
    },
    { key: 'minLevel', label: 'Minimum level (0 for none)', type: 'number', min: 0, max: 20 },
    { key: 'prereqText', label: 'Other prerequisite', type: 'text' },
    { key: 'asiFrom', label: 'Ability Score Increase (+1) options — leave empty if none', type: 'multi', options: abilityOptions },
    { key: 'repeatable', label: 'Can be taken more than once', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'textarea', required: true, hint: 'Use **Bold.** for run-in headings. Rules terms are highlighted automatically.' },
  ],
  empty: () => ({ name: '', type: 'general', minLevel: 4, prereqText: '', asiFrom: [], repeatable: false, description: '' }),
  toEntity: (d) => {
    const asiFrom = list(d.asiFrom) as Ability[];
    const minLevel = num(d.minLevel);
    const text = str(d.prereqText).trim();
    return {
      id: slugify(str(d.name)),
      name: str(d.name).trim(),
      source: 'custom',
      type: str(d.type) as FeatDef['type'],
      description: str(d.description).trim(),
      repeatable: Boolean(d.repeatable),
      ...(minLevel || text ? { prerequisite: { ...(minLevel ? { minLevel } : {}), ...(text ? { text } : {}) } } : {}),
      ...(asiFrom.length
        ? { choices: [{ kind: 'asi', id: 'asi', label: 'Ability Score Increase (+1)', points: 1, from: asiFrom, maxPerAbility: 1, max: str(d.type) === 'epic-boon' ? 30 : 20 }] }
        : {}),
    };
  },
  fromEntity: (e) => ({
    name: e.name,
    type: e.type,
    minLevel: e.prerequisite?.minLevel ?? 0,
    prereqText: e.prerequisite?.text ?? '',
    asiFrom: e.choices?.flatMap((c) => (c.kind === 'asi' && c.from !== 'any' ? c.from : c.kind === 'asi' ? [...ABILITIES] : [])) ?? [],
    repeatable: e.repeatable,
    description: e.description,
  }),
};

export const SPELL: ContentType<SpellDef> = {
  key: 'spells',
  label: 'Spell',
  plural: 'Spells',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'level', label: 'Level (0 = cantrip)', type: 'number', min: 0, max: 9 },
    {
      key: 'school',
      label: 'School',
      type: 'select',
      options: () =>
        ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'].map((s) => ({ id: s, name: s })),
    },
    { key: 'classes', label: 'Spell lists', type: 'multi', options: (reg) => reg.data.classes.filter((c) => c.spellcasting).map((c) => ({ id: c.id, name: c.name })) },
    { key: 'castingTime', label: 'Casting time', type: 'text', required: true },
    { key: 'range', label: 'Range', type: 'text', required: true },
    { key: 'components', label: 'Components', type: 'multi', options: () => ['V', 'S', 'M'].map((c) => ({ id: c, name: c })) },
    { key: 'material', label: 'Material component', type: 'text' },
    { key: 'duration', label: 'Duration', type: 'text', required: true },
    { key: 'concentration', label: 'Concentration', type: 'checkbox' },
    { key: 'ritual', label: 'Ritual', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'higherLevel', label: 'Using a higher-level spell slot', type: 'textarea' },
  ],
  empty: () => ({ name: '', level: 1, school: 'Evocation', classes: [], castingTime: 'Action', range: '', components: ['V', 'S'], material: '', duration: 'Instantaneous', concentration: false, ritual: false, description: '', higherLevel: '' }),
  toEntity: (d) => ({
    id: slugify(str(d.name)),
    name: str(d.name).trim(),
    source: 'custom',
    level: num(d.level),
    school: str(d.school),
    classes: list(d.classes),
    castingTime: str(d.castingTime),
    range: str(d.range),
    components: list(d.components),
    ...(str(d.material).trim() ? { material: str(d.material).trim() } : {}),
    duration: str(d.duration),
    concentration: Boolean(d.concentration),
    ritual: Boolean(d.ritual),
    description: str(d.description).trim(),
    ...(str(d.higherLevel).trim() ? { higherLevel: str(d.higherLevel).trim() } : {}),
  }),
  fromEntity: (e) => ({ ...e, material: e.material ?? '', higherLevel: e.higherLevel ?? '' }) as unknown as Draft,
};

export const BACKGROUND: ContentType<BackgroundDef> = {
  key: 'backgrounds',
  label: 'Background',
  plural: 'Backgrounds',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'abilities', label: 'Ability scores (pick 3)', type: 'multi', max: 3, options: abilityOptions },
    { key: 'feat', label: 'Origin feat', type: 'select', options: (reg) => reg.data.feats.filter((f) => f.type === 'origin').map((f) => ({ id: f.id, name: f.name })) },
    { key: 'skills', label: 'Skill proficiencies (pick 2)', type: 'multi', max: 2, options: skillOptions },
    { key: 'tool', label: 'Tool proficiency', type: 'select', options: (reg) => [{ id: '', name: 'None' }, ...reg.data.tools] },
    { key: 'gp', label: 'Starting gold (in place of equipment)', type: 'number', min: 0 },
    { key: 'description', label: 'Description', type: 'textarea' },
  ],
  empty: () => ({ name: '', abilities: [], feat: 'alert', skills: [], tool: '', gp: 50, description: '' }),
  toEntity: (d) => {
    const effects: Effect[] = [
      ...list(d.skills).map((s) => ({ type: 'skill' as const, skill: s as SkillId })),
      ...(str(d.tool) ? [{ type: 'tool' as const, tool: str(d.tool) }] : []),
    ];
    return {
      id: slugify(str(d.name)),
      name: str(d.name).trim(),
      source: 'custom',
      abilities: list(d.abilities) as Ability[],
      feat: str(d.feat),
      effects,
      equipment: [{ label: 'A', items: [], gp: num(d.gp) }],
      ...(str(d.description).trim() ? { description: str(d.description).trim() } : {}),
    };
  },
  fromEntity: (e) => ({
    name: e.name,
    abilities: e.abilities ?? [],
    feat: e.feat ?? '',
    skills: e.effects.flatMap((x) => (x.type === 'skill' ? [x.skill] : [])),
    tool: e.effects.find((x) => x.type === 'tool')?.type === 'tool' ? (e.effects.find((x) => x.type === 'tool') as { tool: string }).tool : '',
    gp: e.equipment[0]?.gp ?? 0,
    description: e.description ?? '',
  }),
};

export const SPECIES: ContentType<SpeciesDef> = {
  key: 'species',
  label: 'Species',
  plural: 'Species',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'creatureType', label: 'Creature type', type: 'text' },
    { key: 'sizes', label: 'Size (pick one, or two to let the player choose)', type: 'multi', max: 2, options: () => ['Small', 'Medium'].map((s) => ({ id: s, name: s })) },
    { key: 'speed', label: 'Speed (feet)', type: 'number', min: 0 },
    { key: 'darkvision', label: 'Darkvision range (0 for none)', type: 'number', min: 0 },
    { key: 'resistances', label: 'Damage resistances', type: 'multi', options: (reg) => reg.data.keywords.filter((k) => k.kind === 'damage').map((k) => ({ id: k.id.replace('damage-', ''), name: k.term.replace(/ damage$/, '') })) },
    { key: 'skills', label: 'Skill proficiencies', type: 'multi', options: skillOptions },
    { key: 'traits', label: 'Traits', type: 'features', levelLabel: 'Character level' },
  ],
  empty: () => ({ name: '', creatureType: 'Humanoid', sizes: ['Medium'], speed: 30, darkvision: 0, resistances: [], skills: [], traits: [] }),
  toEntity: (d) => {
    const id = slugify(str(d.name));
    const sizes = list(d.sizes);
    const core: Feature = {
      id: `${id}-core`,
      name: 'Species basics',
      level: 1,
      description: '',
      hidden: true,
      effects: [
        ...(num(d.darkvision) ? [{ type: 'darkvision' as const, range: num(d.darkvision) }] : []),
        ...list(d.resistances).map((r) => ({ type: 'resistance' as const, damage: r })),
        ...list(d.skills).map((s) => ({ type: 'skill' as const, skill: s as SkillId })),
      ],
    };
    return {
      id,
      name: str(d.name).trim(),
      source: 'custom',
      creatureType: str(d.creatureType) || 'Humanoid',
      size: sizes.at(-1) ?? 'Medium',
      ...(sizes.length > 1 ? { sizeOptions: sizes, choices: [{ kind: 'size', id: 'size', label: 'Size', options: sizes }] } : {}),
      speed: num(d.speed, 30),
      traits: [core, ...toFeatures(id, feats(d.traits))],
    };
  },
  fromEntity: (e) => {
    const core = e.traits.find((t) => t.hidden)?.effects ?? [];
    return {
      name: e.name,
      creatureType: e.creatureType,
      sizes: e.sizeOptions ?? [e.size],
      speed: e.speed,
      darkvision: core.find((x) => x.type === 'darkvision')?.type === 'darkvision' ? (core.find((x) => x.type === 'darkvision') as { range: number }).range : 0,
      resistances: core.flatMap((x) => (x.type === 'resistance' ? [x.damage] : [])),
      skills: core.flatMap((x) => (x.type === 'skill' ? [x.skill] : [])),
      traits: fromFeatures(e.traits.filter((t) => !t.hidden)),
    };
  },
};

export const SUBCLASS: ContentType<SubclassDef> = {
  key: 'subclasses',
  label: 'Subclass',
  plural: 'Subclasses',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'classId', label: 'Class', type: 'select', options: (reg) => reg.data.classes.map((c) => ({ id: c.id, name: c.name })) },
    { key: 'summary', label: 'Summary', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    {
      key: 'spells',
      label: 'Always-prepared spells',
      type: 'spellsByLevel',
      hint: 'For domain, oath, patron and similar spell tables. Each row unlocks at that class level.',
    },
    { key: 'features', label: 'Features', type: 'features', levelLabel: 'Class level' },
  ],
  empty: () => ({ name: '', classId: 'fighter', summary: '', description: '', spells: [], features: [{ name: '', level: 3, description: '' }] }),
  toEntity: (d) => {
    const id = slugify(str(d.name));
    const name = str(d.name).trim();
    const rows = spellRows(d.spells)
      .filter((r) => r.spells.length)
      .sort((a, b) => a.level - b.level);
    const spellFeature: Feature[] = rows.length
      ? [
          {
            id: `${id}-spells`,
            name: `${name} Spells`,
            level: rows[0].level,
            description: `You always have these spells prepared from the listed class level.\n${rows
              .map((r) => `Level ${r.level}: ${r.spells.join(', ')}`)
              .join('\n')}`,
            effects: rows.flatMap((r) => r.spells.map((spell) => ({ type: 'spell' as const, spell, minLevel: r.level }))),
          },
        ]
      : [];
    return {
      id,
      name,
      source: 'custom',
      classId: str(d.classId),
      ...(str(d.summary).trim() ? { summary: str(d.summary).trim() } : {}),
      ...(str(d.description).trim() ? { description: str(d.description).trim() } : {}),
      features: [...spellFeature, ...toFeatures(id, feats(d.features))],
    };
  },
  fromEntity: (e) => {
    const spellFeature = e.features.find((f) => f.id === `${e.id}-spells`);
    const byLevel = new Map<number, string[]>();
    for (const x of spellFeature?.effects ?? [])
      if (x.type === 'spell') byLevel.set(x.minLevel ?? 1, [...(byLevel.get(x.minLevel ?? 1) ?? []), x.spell]);
    return {
      name: e.name,
      classId: e.classId,
      summary: e.summary ?? '',
      description: e.description ?? '',
      spells: [...byLevel.entries()].map(([level, spells]) => ({ level, spells })),
      features: fromFeatures(e.features.filter((f) => f !== spellFeature)),
    };
  },
};

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
const isWeapon = (d: Draft) => d.category === 'weapon';
const isArmor = (d: Draft) => d.category === 'armor';
const isMagicItem = (d: Draft) => d.category === 'magic' || ((isWeapon(d) || isArmor(d)) && Boolean(d.isMagic));
const effectList = (v: FieldValue | undefined) => (Array.isArray(v) ? (v as Effect[]) : []);

export const ITEM: ContentType<ItemDef> = {
  key: 'items',
  label: 'Item',
  plural: 'Items',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    {
      key: 'category',
      label: 'Kind',
      type: 'select',
      options: () => [
        { id: 'gear', name: 'Gear' },
        { id: 'weapon', name: 'Weapon' },
        { id: 'armor', name: 'Armor' },
        { id: 'tool', name: 'Tool' },
        { id: 'magic', name: 'Magic item' },
        { id: 'other', name: 'Other' },
      ],
    },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'weaponCategory', label: 'Weapon: category', type: 'select', when: isWeapon, options: () => [{ id: 'simple', name: 'Simple' }, { id: 'martial', name: 'Martial' }] },
    { key: 'weaponKind', label: 'Weapon: melee or ranged', type: 'select', when: isWeapon, options: () => [{ id: 'melee', name: 'Melee' }, { id: 'ranged', name: 'Ranged' }] },
    { key: 'damage', label: 'Weapon: damage dice', type: 'text', when: isWeapon, hint: 'e.g. 1d8' },
    { key: 'damageType', label: 'Weapon: damage type', type: 'select', when: isWeapon, options: (reg) => reg.data.keywords.filter((k) => k.kind === 'damage').map((k) => ({ id: k.id.replace('damage-', ''), name: k.term.replace(/ damage$/, '') })) },
    { key: 'properties', label: 'Weapon: properties', type: 'multi', when: isWeapon, options: (reg) => reg.data.keywords.filter((k) => k.kind === 'weapon-property').map((k) => ({ id: k.id.replace('property-', ''), name: k.term })) },
    { key: 'mastery', label: 'Weapon: mastery', type: 'select', when: isWeapon, options: (reg) => [{ id: '', name: 'None' }, ...reg.data.keywords.filter((k) => k.kind === 'mastery').map((k) => ({ id: k.id.replace('mastery-', ''), name: k.term }))] },
    { key: 'armorType', label: 'Armor: type', type: 'select', when: isArmor, options: () => ['light', 'medium', 'heavy', 'shield'].map((t) => ({ id: t, name: t[0].toUpperCase() + t.slice(1) })) },
    { key: 'armorBase', label: 'Armor: base AC (shield: bonus)', type: 'number', min: 0, when: isArmor },
    { key: 'isMagic', label: 'Magic weapon or armor', type: 'checkbox', when: (d) => isWeapon(d) || isArmor(d) },
    { key: 'rarity', label: 'Rarity', type: 'select', when: isMagicItem, options: () => RARITIES.map((r) => ({ id: r, name: r })) },
    { key: 'attunement', label: 'Requires attunement', type: 'checkbox', when: isMagicItem },
    {
      key: 'variantOf',
      label: 'Works on',
      type: 'select',
      when: (d) => d.category === 'magic',
      options: () => [
        { id: '', name: 'Worn or carried' },
        { id: 'weapon', name: 'Any weapon (pick one when adding it)' },
        { id: 'armor', name: 'Any armor (pick one when adding it)' },
        { id: 'shield', name: 'Any shield (pick one when adding it)' },
      ],
    },
    { key: 'bonusAttack', label: 'Attack', type: 'number', min: 0, max: 5, group: 'Bonuses (0 for none)', when: isMagicItem },
    { key: 'bonusDamage', label: 'Damage', type: 'number', min: 0, max: 5, group: 'Bonuses (0 for none)', when: isMagicItem },
    { key: 'bonusAc', label: 'AC', type: 'number', min: 0, max: 5, group: 'Bonuses (0 for none)', when: isMagicItem },
    { key: 'bonusSave', label: 'Saving throws', type: 'number', min: 0, max: 5, group: 'Bonuses (0 for none)', when: isMagicItem },
    { key: 'setAbility', label: 'Sets an ability score', type: 'select', when: isMagicItem, options: () => [{ id: '', name: 'None' }, ...abilityOptions()] },
    { key: 'setValue', label: 'Score becomes (at least)', type: 'number', min: 1, max: 30, when: (d) => isMagicItem(d) && Boolean(d.setAbility) },
    { key: 'charges', label: 'Charges (0 for none; they return on a long rest)', type: 'number', min: 0, max: 50, when: isMagicItem },
    { key: 'effects', label: 'Grants', type: 'effects', when: isMagicItem, hint: 'Applies while equipped (and attuned, if required).' },
  ],
  empty: () => ({
    name: '',
    category: 'gear',
    description: '',
    weaponCategory: 'simple',
    weaponKind: 'melee',
    damage: '1d6',
    damageType: 'slashing',
    properties: [],
    mastery: '',
    armorType: 'light',
    armorBase: 11,
    isMagic: false,
    rarity: 'Uncommon',
    attunement: false,
    variantOf: '',
    bonusAttack: 0,
    bonusDamage: 0,
    bonusAc: 0,
    bonusSave: 0,
    setAbility: '',
    setValue: 19,
    charges: 0,
    effects: [],
  }),
  toEntity: (d) => {
    const category = str(d.category) as ItemDef['category'];
    const armorType = str(d.armorType) as 'light';
    const bonus = Object.fromEntries(
      (
        [
          ['attack', num(d.bonusAttack)],
          ['damage', num(d.bonusDamage)],
          ['ac', num(d.bonusAc)],
          ['save', num(d.bonusSave)],
        ] as const
      ).filter(([, v]) => v),
    ) as NonNullable<NonNullable<ItemDef['magic']>['bonus']>;
    const variantOf = category === 'magic' ? (str(d.variantOf) as NonNullable<ItemDef['magic']>['variantOf'] | '') : '';
    // Rows left half-filled in the form are dropped.
    const effects = effectList(d.effects).filter((e) => !(e.type === 'spell' && !e.spell) && !(e.type === 'language' && !e.language.trim()));
    const magic: ItemDef['magic'] | undefined = isMagicItem(d)
      ? {
          rarity: str(d.rarity) || 'Uncommon',
          attunement: Boolean(d.attunement),
          ...(variantOf ? { variantOf } : {}),
          ...(Object.keys(bonus).length ? { bonus } : {}),
          ...(str(d.setAbility) ? { abilitySet: { ability: str(d.setAbility) as Ability, value: num(d.setValue, 19) } } : {}),
          ...(num(d.charges) ? { charges: num(d.charges) } : {}),
          ...(effects.length ? { effects } : {}),
        }
      : undefined;
    return {
      id: slugify(str(d.name)),
      name: str(d.name).trim(),
      source: 'custom',
      category,
      ...(str(d.description).trim() ? { description: str(d.description).trim() } : {}),
      ...(category === 'weapon'
        ? {
            weapon: {
              category: str(d.weaponCategory) as 'simple',
              kind: str(d.weaponKind) as 'melee',
              damage: str(d.damage) || '1d4',
              damageType: str(d.damageType),
              properties: list(d.properties),
              ...(str(d.mastery) ? { mastery: str(d.mastery) } : {}),
            },
          }
        : {}),
      ...(category === 'armor'
        ? {
            armor: {
              type: armorType,
              base: num(d.armorBase, 10),
              dexMax: armorType === 'light' ? null : armorType === 'medium' ? 2 : 0,
            },
          }
        : {}),
      ...(magic ? { magic } : {}),
    };
  },
  fromEntity: (e) => ({
    ...ITEM.empty(),
    name: e.name,
    category: e.category,
    description: e.description ?? '',
    weaponCategory: e.weapon?.category ?? 'simple',
    weaponKind: e.weapon?.kind ?? 'melee',
    damage: e.weapon?.damage ?? '1d6',
    damageType: e.weapon?.damageType ?? 'slashing',
    properties: e.weapon?.properties ?? [],
    mastery: e.weapon?.mastery ?? '',
    armorType: e.armor?.type ?? 'light',
    armorBase: e.armor?.base ?? 11,
    ...(e.magic
      ? {
          isMagic: true,
          rarity: e.magic.rarity,
          attunement: e.magic.attunement,
          variantOf: e.magic.variantOf ?? '',
          bonusAttack: e.magic.bonus?.attack ?? 0,
          bonusDamage: e.magic.bonus?.damage ?? 0,
          bonusAc: e.magic.bonus?.ac ?? 0,
          bonusSave: e.magic.bonus?.save ?? 0,
          setAbility: e.magic.abilitySet?.ability ?? '',
          setValue: e.magic.abilitySet?.value ?? 19,
          charges: e.magic.charges ?? 0,
          effects: e.magic.effects ?? [],
        }
      : {}),
  }),
};

export const KEYWORD: ContentType<KeywordDef> = {
  key: 'keywords',
  label: 'Rules term',
  plural: 'Rules terms',
  fields: [
    { key: 'name', label: 'Term', type: 'text', required: true, hint: 'Highlighted wherever it appears with this capitalization.' },
    { key: 'aliases', label: 'Other spellings (comma separated)', type: 'text' },
    {
      key: 'kind',
      label: 'Kind',
      type: 'select',
      options: () => [
        { id: 'rule', name: 'Rule' },
        { id: 'condition', name: 'Condition' },
        { id: 'action', name: 'Action' },
      ],
    },
    { key: 'description', label: 'Definition', type: 'textarea', required: true },
  ],
  empty: () => ({ name: '', aliases: '', kind: 'rule', description: '' }),
  toEntity: (d) => ({
    id: slugify(str(d.name)),
    term: str(d.name).trim(),
    aliases: str(d.aliases).split(',').map((s) => s.trim()).filter(Boolean),
    kind: str(d.kind) as KeywordDef['kind'],
    description: str(d.description).trim(),
    source: 'custom',
  }),
  fromEntity: (e) => ({ name: e.term, aliases: (e.aliases ?? []).join(', '), kind: e.kind, description: e.description }),
};

const SPEEDS = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;
const CRS = ['0', '0.125', '0.25', '0.5', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const crName = (v: string) => ({ '0.125': '1/8', '0.25': '1/4', '0.5': '1/2' })[v] ?? v;

export const CREATURE: ContentType<CreatureDef> = {
  key: 'creatures',
  label: 'Creature',
  plural: 'Creatures',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'size', label: 'Size', type: 'select', options: () => ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].map((x) => ({ id: x, name: x })) },
    { key: 'type', label: 'Creature type', type: 'text', required: true, hint: 'e.g. beast, fey, celestial. Beasts can be used for Wild Shape.' },
    { key: 'cr', label: 'Challenge rating', type: 'select', options: () => CRS.map((v) => ({ id: v, name: crName(v) })) },
    { key: 'ac', label: 'Armor Class', type: 'number', min: 1, max: 40, group: 'Defenses' },
    { key: 'hp', label: 'Hit Points', type: 'number', min: 1, group: 'Defenses' },
    { key: 'hitDice', label: 'Hit dice (optional)', type: 'text', hint: 'e.g. 5d8 + 5' },
    ...SPEEDS.map((m) => ({ key: `speed_${m}`, label: `${m[0].toUpperCase()}${m.slice(1)}`, type: 'number' as const, min: 0, group: 'Speeds in feet (0 = none)' })),
    ...ABILITIES.map((a) => ({ key: `ab_${a}`, label: ABILITY_NAMES[a], type: 'number' as const, min: 1, max: 30, group: 'Ability scores' })),
    { key: 'senses', label: 'Senses', type: 'text', hint: 'e.g. darkvision 60 ft., passive Perception 13' },
    { key: 'traits', label: 'Traits', type: 'namedText', itemLabel: 'trait' },
    { key: 'actions', label: 'Actions', type: 'actions' },
  ],
  empty: () => ({
    name: '',
    size: 'Medium',
    type: 'beast',
    cr: '0',
    ac: 12,
    hp: 10,
    hitDice: '',
    ...Object.fromEntries(SPEEDS.map((m) => [`speed_${m}`, m === 'walk' ? 30 : 0])),
    ...Object.fromEntries(ABILITIES.map((a) => [`ab_${a}`, 10])),
    senses: '',
    traits: [],
    actions: [{ name: '', description: '', attack: '', damage: '', damageType: '' }],
  }),
  toEntity: (d) => ({
    id: slugify(str(d.name)),
    name: str(d.name).trim(),
    source: 'custom',
    size: str(d.size) as 'Medium',
    type: str(d.type).trim().toLowerCase(),
    cr: Number(str(d.cr)) || 0,
    ac: num(d.ac, 10),
    hp: num(d.hp, 1),
    hitDice: str(d.hitDice).trim(),
    speed: Object.fromEntries(SPEEDS.filter((m) => num(d[`speed_${m}`]) > 0).map((m) => [m, `${num(d[`speed_${m}`])} ft.`])),
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, num(d[`ab_${a}`], 10)])) as CreatureDef['abilities'],
    senses: str(d.senses).trim(),
    traits: (Array.isArray(d.traits) ? (d.traits as NamedText[]) : []).filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), description: t.description.trim() })),
    actions: (Array.isArray(d.actions) ? (d.actions as ActionDraft[]) : [])
      .filter((a) => a.name.trim())
      .map((a) => ({
        name: a.name.trim(),
        description: a.description.trim(),
        ...(a.attack.trim() !== '' && !Number.isNaN(Number(a.attack)) ? { attack: Math.round(Number(a.attack)) } : {}),
        ...(a.damage.trim() ? { damage: a.damage.replace(/\s+/g, '') } : {}),
        ...(a.damage.trim() && a.damageType ? { damageType: a.damageType } : {}),
      })),
  }),
  fromEntity: (e) => ({
    name: e.name,
    size: e.size,
    type: e.type,
    cr: String(e.cr),
    ac: e.ac,
    hp: e.hp,
    hitDice: e.hitDice,
    ...Object.fromEntries(SPEEDS.map((m) => [`speed_${m}`, parseInt(e.speed[m] ?? '0', 10) || 0])),
    ...Object.fromEntries(ABILITIES.map((a) => [`ab_${a}`, e.abilities[a]])),
    senses: e.senses,
    traits: e.traits.map((t) => ({ ...t })),
    actions: e.actions.map((a) => ({
      name: a.name,
      description: a.description,
      attack: a.attack === undefined ? '' : String(a.attack),
      damage: a.damage ?? '',
      damageType: a.damageType ?? '',
    })),
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONTENT_TYPES: ContentType<any>[] = [FEAT, BACKGROUND, SPECIES, SUBCLASS, SPELL, CREATURE, ITEM, KEYWORD];
