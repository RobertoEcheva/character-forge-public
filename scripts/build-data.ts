/**
 * Converts the 5e-bits 2024 SRD dataset (data/raw, SRD 5.2 CC-BY-4.0) plus
 * hand-authored overlays into the app's rules schema (data/srd).
 *
 * Run: npm run build:data
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Ability,
  BackgroundDef,
  CasterProgression,
  Choice,
  ChoiceOption,
  ClassDef,
  Effect,
  FeatDef,
  FeatType,
  Feature,
  ItemDef,
  KeywordDef,
  LevelRow,
  RulesData,
  SkillId,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from '../src/types/rules';
import { ABILITIES, SKILL_IDS } from '../src/types/rules';
import { bundles, clean, creatureOf, isCompanionCandidate, magicItemOf, optionItems, profChoiceToChoice, profToEffects, slug, toolNameToId } from './lib/convert';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data/raw');
const OVERLAYS = join(ROOT, 'data/overlays');
const OUT = join(ROOT, 'data/srd');

const raw = (name: string): any[] => JSON.parse(readFileSync(join(RAW, `${name}.json`), 'utf8'));
const overlay = <T>(name: string, fallback: T): T => {
  const p = join(OVERLAYS, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
};

// ---------- overlays: class features ----------

const featChoice = (featTypes: FeatType[], label: string): Choice => ({ kind: 'feat', id: 'feat', label, featTypes });
const expertise = (id: string, count: number, minLevel?: number, from: SkillId[] | 'any' = 'any'): Choice => ({
  kind: 'skill',
  id,
  label: `Expertise: choose ${count} proficient skill${count > 1 ? 's' : ''}`,
  count,
  from,
  expertise: true,
  ...(minLevel ? { minLevel } : {}),
});
const mastery = (count: number, countKey?: string): Choice => ({
  kind: 'weaponMastery',
  id: 'mastery',
  label: 'Weapon Mastery: choose weapon kinds',
  count,
  ...(countKey ? { countKey } : {}),
});
const spells = (byLevel: Record<number, string[]>): Effect[] =>
  Object.entries(byLevel).flatMap(([lvl, ids]) => ids.map((spell) => ({ type: 'spell' as const, spell, minLevel: +lvl })));

const invocations = overlay<any[]>('invocations', []);
const metamagic = overlay<any[]>('metamagic', []);

const invocationOptions: ChoiceOption[] = invocations.map((i) => ({
  id: i.id,
  name: i.name,
  description: i.description,
  prerequisite: i.prerequisite ?? undefined,
}));
const metamagicOptions: ChoiceOption[] = metamagic.map((m) => ({
  id: m.id,
  name: `${m.name}${m.cost ? ` (${m.cost})` : ''}`,
  description: m.description,
}));

/** Rage: shared by both editions' converters. */
const RAGE_TOGGLE: Effect = {
  type: 'toggle',
  id: 'rage',
  label: 'Rage',
  resource: 'rage_count',
  description: 'Resistance to Bludgeoning, Piercing and Slashing damage; Rage Damage on Strength attacks; Advantage on Strength checks and saves.',
  effects: [
    { type: 'resistance', damage: 'bludgeoning' },
    { type: 'resistance', damage: 'piercing' },
    { type: 'resistance', damage: 'slashing' },
    { type: 'damageRider', id: 'rage', label: 'Rage damage', valueKey: 'rage_damage_bonus', when: 'strMelee', auto: true },
  ],
};

type FeaturePatch = Partial<Pick<Feature, 'effects' | 'choices' | 'hidden' | 'description' | 'name'>>;

/** Keyed by base feature id (before per-level suffixing). */
const CLASS_FEATURE_PATCH: Record<string, FeaturePatch> = {
  'barbarian-unarmored-defense': {
    effects: [{ type: 'acFormula', name: 'Unarmored Defense', base: 10, abilities: ['dex', 'con'], allowShield: true }],
  },
  'barbarian-weapon-mastery': { choices: [mastery(2, 'weapon_mastery')] },
  'barbarian-rage': { effects: [RAGE_TOGGLE] },
  'rogue-sneak-attack': {
    effects: [{ type: 'damageRider', id: 'sneak-attack', label: 'Sneak Attack', valueKey: 'sneak_attack', when: 'finesseOrRanged' }],
  },
  'barbarian-fast-movement': { effects: [{ type: 'speedBonus', value: 10, notHeavy: true }] },
  'barbarian-primal-knowledge': {
    choices: [
      {
        kind: 'skill',
        id: 'skill',
        label: 'Primal Knowledge: one more Barbarian skill',
        count: 1,
        from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
      },
    ],
  },
  'bard-jack-of-all-trades': { effects: [{ type: 'halfProficiency' }] },
  'bard-expertise': { choices: [expertise('expertise-2', 2), expertise('expertise-9', 2, 9)] },
  'cleric-divine-order': {
    choices: [
      {
        kind: 'option',
        id: 'order',
        label: 'Divine Order',
        count: 1,
        options: [
          {
            id: 'protector',
            name: 'Protector',
            description: 'Proficiency with Martial weapons and training with Heavy armor.',
            effects: [
              { type: 'weapon', weapon: 'martial' },
              { type: 'armor', armor: 'heavy' },
            ],
          },
          {
            id: 'thaumaturge',
            name: 'Thaumaturge',
            description:
              'One extra Cleric cantrip; add your Wisdom modifier (min +1) to Intelligence (Arcana or Religion) checks.',
            effects: [{ type: 'cantripBonus', classId: 'cleric', value: 1 }],
          },
        ],
      },
    ],
  },
  'druid-druidic': {
    effects: [
      { type: 'language', language: 'druidic' },
      { type: 'spell', spell: 'speak-with-animals' },
    ],
  },
  'druid-primal-order': {
    choices: [
      {
        kind: 'option',
        id: 'order',
        label: 'Primal Order',
        count: 1,
        options: [
          {
            id: 'magician',
            name: 'Magician',
            description:
              'One extra Druid cantrip; add your Wisdom modifier (min +1) to Intelligence (Arcana or Nature) checks.',
            effects: [{ type: 'cantripBonus', classId: 'druid', value: 1 }],
          },
          {
            id: 'warden',
            name: 'Warden',
            description: 'Proficiency with Martial weapons and training with Medium armor.',
            effects: [
              { type: 'weapon', weapon: 'martial' },
              { type: 'armor', armor: 'medium' },
            ],
          },
        ],
      },
    ],
  },
  'fighter-fighting-style': { choices: [featChoice(['fighting-style'], 'Fighting Style feat')] },
  'fighter-weapon-mastery': { choices: [mastery(3, 'weapon_mastery')] },
  'monk-unarmored-defense': {
    effects: [{ type: 'acFormula', name: 'Unarmored Defense', base: 10, abilities: ['dex', 'wis'], allowShield: false }],
  },
  'monk-unarmored-movement': {
    effects: [{ type: 'speedBonus', value: 0, valueKey: 'unarmored_movement_bonus', unarmored: true }],
  },
  'paladin-weapon-mastery': { choices: [mastery(2)] },
  'paladin-paladins-smite': { effects: [{ type: 'spell', spell: 'divine-smite' }] },
  'paladin-faithful-steed': { effects: [{ type: 'spell', spell: 'find-steed' }] },
  'warlock-contact-patron': { effects: [{ type: 'spell', spell: 'contact-other-plane' }] },
  'bard-words-of-creation': {
    effects: [
      { type: 'spell', spell: 'power-word-heal' },
      { type: 'spell', spell: 'power-word-kill' },
    ],
  },
  'wizard-spell-mastery': {
    choices: [
      { kind: 'spell', id: 'mastery-1', label: 'Spell Mastery: a level 1 spell', count: 1, level: 1, lists: ['wizard'] },
      { kind: 'spell', id: 'mastery-2', label: 'Spell Mastery: a level 2 spell', count: 1, level: 2, lists: ['wizard'] },
    ],
  },
  'wizard-signature-spells': {
    choices: [{ kind: 'spell', id: 'signature', label: 'Signature Spells: two level 3 spells', count: 2, level: 3, lists: ['wizard'] }],
  },
  'paladin-fighting-style': { choices: [featChoice(['fighting-style'], 'Fighting Style feat')] },
  'ranger-weapon-mastery': { choices: [mastery(2)] },
  'ranger-fighting-style': { choices: [featChoice(['fighting-style'], 'Fighting Style feat')] },
  'ranger-favored-enemy': { effects: [{ type: 'spell', spell: 'hunters-mark', note: 'Favored Enemy' }] },
  'ranger-deft-explorer': {
    choices: [
      expertise('expertise', 1),
      { kind: 'language', id: 'languages', label: 'Deft Explorer: two languages', count: 2, from: 'any' },
    ],
  },
  'ranger-expertise': { choices: [expertise('expertise', 2)] },
  'rogue-expertise': { choices: [expertise('expertise-1', 2), expertise('expertise-6', 2, 6)] },
  'rogue-weapon-mastery': { choices: [mastery(2)] },
  'rogue-thieves-cant': {
    effects: [{ type: 'language', language: 'thieves-cant' }],
    choices: [{ kind: 'language', id: 'language', label: "Thieves' Cant: one more language", count: 1, from: 'any' }],
  },
  'sorcerer-metamagic': {
    choices: [
      { kind: 'option', id: 'metamagic-2', label: 'Metamagic options', count: 2, options: metamagicOptions },
      { kind: 'option', id: 'metamagic-10', label: 'Metamagic options', count: 2, options: metamagicOptions, minLevel: 10 },
      { kind: 'option', id: 'metamagic-17', label: 'Metamagic options', count: 2, options: metamagicOptions, minLevel: 17 },
    ],
  },
  'warlock-eldritch-invocations': {
    choices: [
      {
        kind: 'option',
        id: 'invocations',
        label: 'Eldritch Invocations',
        count: 1,
        countKey: 'eldritch_invocations',
        options: invocationOptions,
      },
    ],
  },
  'wizard-scholar': {
    choices: [expertise('expertise', 1, undefined, ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'])],
  },
};

/** Keyed "<subclassId>:<feature name>". */
const SUBCLASS_FEATURE_PATCH: Record<string, FeaturePatch> = {
  'college-of-lore:Bonus Proficiencies': {
    choices: [{ kind: 'skill', id: 'skills', label: 'Bonus Proficiencies: three skills', count: 3, from: 'any' }],
  },
  'college-of-lore:Magical Discoveries': {
    choices: [
      {
        kind: 'spell',
        id: 'discoveries',
        label: 'Magical Discoveries: two Cleric, Druid or Wizard spells',
        count: 2,
        upToSlotLevel: true,
        lists: ['cleric', 'druid', 'wizard'],
      },
    ],
  },
  'life-domain:Life Domain Spells': {
    effects: spells({
      3: ['aid', 'bless', 'cure-wounds', 'lesser-restoration'],
      5: ['mass-healing-word', 'revivify'],
      7: ['aura-of-life', 'death-ward'],
      9: ['greater-restoration', 'mass-cure-wounds'],
    }),
  },
  'champion:Additional Fighting Style': { choices: [featChoice(['fighting-style'], 'Additional Fighting Style feat')] },
  'oath-of-devotion:Oath of Devotion Spells': {
    description:
      'The magic of your oath ensures you always have certain spells ready; when you reach a Paladin level specified in the Oath of Devotion Spells table, you thereafter always have the listed spells prepared.\nPaladin 3: Protection from Evil and Good, Shield of Faith\nPaladin 5: Aid, Zone of Truth\nPaladin 9: Beacon of Hope, Dispel Magic\nPaladin 13: Freedom of Movement, Guardian of Faith\nPaladin 17: Commune, Flame Strike',
    effects: spells({
      3: ['protection-from-evil-and-good', 'shield-of-faith'],
      5: ['aid', 'zone-of-truth'],
      9: ['beacon-of-hope', 'dispel-magic'],
      13: ['freedom-of-movement', 'guardian-of-faith'],
      17: ['commune', 'flame-strike'],
    }),
  },
  "hunter:Hunter's Prey": {
    choices: [
      {
        kind: 'option',
        id: 'prey',
        label: "Hunter's Prey",
        count: 1,
        options: [
          { id: 'colossus-slayer', name: 'Colossus Slayer' },
          { id: 'horde-breaker', name: 'Horde Breaker' },
        ],
      },
    ],
  },
  'hunter:Defensive Tactics': {
    choices: [
      {
        kind: 'option',
        id: 'tactics',
        label: 'Defensive Tactics',
        count: 1,
        options: [
          { id: 'escape-the-horde', name: 'Escape the Horde' },
          { id: 'multiattack-defense', name: 'Multiattack Defense' },
        ],
      },
    ],
  },
  'draconic-sorcery:Draconic Resilience': {
    effects: [
      { type: 'hpPerLevel', value: 1, classId: 'sorcerer' },
      { type: 'acFormula', name: 'Draconic Resilience', base: 10, abilities: ['dex', 'cha'], allowShield: true },
    ],
  },
  'draconic-sorcery:Draconic Spells': {
    effects: spells({
      3: ['alter-self', 'chromatic-orb', 'command', 'dragons-breath'],
      5: ['fear', 'fly'],
      7: ['arcane-eye', 'charm-monster'],
      9: ['legend-lore', 'summon-dragon'],
    }),
  },
  'fiend-patron:Fiend Spells': {
    effects: spells({
      3: ['burning-hands', 'command', 'scorching-ray', 'suggestion'],
      5: ['fireball', 'stinking-cloud'],
      7: ['fire-shield', 'wall-of-fire'],
      9: ['geas', 'insect-plague'],
    }),
  },
  'circle-of-the-land:Circle of the Land Spells': {
    name: 'Circle of the Land Spells',
    choices: [
      {
        kind: 'option',
        id: 'land',
        label: 'Land type (change on Long Rest)',
        count: 1,
        options: [
          { id: 'arid', name: 'Arid', effects: spells({ 3: ['blur', 'burning-hands', 'fire-bolt'], 5: ['fireball'], 7: ['blight'], 9: ['wall-of-stone'] }) },
          { id: 'polar', name: 'Polar', effects: spells({ 3: ['fog-cloud', 'hold-person', 'ray-of-frost'], 5: ['sleet-storm'], 7: ['ice-storm'], 9: ['cone-of-cold'] }) },
          { id: 'temperate', name: 'Temperate', effects: spells({ 3: ['misty-step', 'shocking-grasp', 'sleep'], 5: ['lightning-bolt'], 7: ['freedom-of-movement'], 9: ['tree-stride'] }) },
          { id: 'tropical', name: 'Tropical', effects: spells({ 3: ['acid-splash', 'ray-of-sickness', 'web'], 5: ['stinking-cloud'], 7: ['polymorph'], 9: ['insect-plague'] }) },
        ],
      },
    ],
  },
};

function classFeaturePatch(index: string): FeaturePatch | undefined {
  if (index.endsWith('-ability-score-improvement'))
    return { choices: [featChoice(['general'], 'Ability Score Improvement or feat')] };
  if (index.endsWith('-epic-boon')) return { choices: [featChoice(['epic-boon', 'general'], 'Epic Boon or feat')] };
  return CLASS_FEATURE_PATCH[index];
}

function patchFeature(f: Feature, patch: FeaturePatch | undefined): Feature {
  return patch ? { ...f, ...patch } : f;
}

// ---------- overlays: species traits / feats ----------

const LINEAGE_ABILITY: Choice = {
  kind: 'option',
  id: 'lineage-ability',
  label: 'Spellcasting ability for lineage spells',
  count: 1,
  options: (['int', 'wis', 'cha'] as const).map((a) => ({ id: a, name: a.toUpperCase() })),
};
const lineageAbility = { fromChoice: 'species:lineage-ability' };

const TRAIT_PATCH: Record<string, FeaturePatch> = {
  'darkvision-60': { effects: [{ type: 'darkvision', range: 60 }] },
  'darkvision-120': { effects: [{ type: 'darkvision', range: 120 }] },
  'dwarven-resilience': { effects: [{ type: 'resistance', damage: 'poison' }] },
  'dwarven-toughness': { effects: [{ type: 'hpPerLevel', value: 1 }] },
  'keen-senses': {
    choices: [{ kind: 'skill', id: 'skill', label: 'Keen Senses skill', count: 1, from: ['insight', 'perception', 'survival'] }],
  },
  skillful: { choices: [{ kind: 'skill', id: 'skill', label: 'Skillful: any skill', count: 1, from: 'any' }] },
  versatile: { choices: [featChoice(['origin'], 'Versatile: Origin feat')] },
  'wood-elf-speed-increase': { effects: [{ type: 'speed', value: 35 }] },
  'high-elf-cantrip-versatility': { effects: [{ type: 'spell', spell: 'prestidigitation', ability: lineageAbility }] },
  'gnomish-lineage-forest-gnome': { effects: [{ type: 'spell', spell: 'speak-with-animals', ability: lineageAbility }] },
  'gnomish-lineage-rock-gnome': { effects: [{ type: 'spell', spell: 'prestidigitation', ability: lineageAbility }] },
  'otherworldly-presence': { effects: [{ type: 'spell', spell: 'thaumaturgy', ability: lineageAbility }] },
};

function traitPatch(id: string): FeaturePatch | undefined {
  if (TRAIT_PATCH[id]) return TRAIT_PATCH[id];
  let m = id.match(/^(?:draconic-damage-resistance|lineage-resistance)-(\w+)$/);
  if (m) return { effects: [{ type: 'resistance', damage: m[1] }] };
  m = id.match(/^lineage-spell-(.+)$/);
  if (m) return { effects: [{ type: 'spell', spell: m[1], ability: lineageAbility }] };
  return undefined;
}

const asi = (points: number, from: Ability[] | 'any', max: number, maxPerAbility = points): Choice => ({
  kind: 'asi',
  id: 'asi',
  label: `Ability Score Increase (+${points})`,
  points,
  from,
  max,
  maxPerAbility,
});

const FEAT_PATCH: Record<string, Partial<FeatDef>> = {
  alert: { effects: [{ type: 'initiativeProf' }] },
  skilled: { choices: [{ kind: 'skillOrTool', id: 'picks', label: 'Skilled: three skills or tools', count: 3 }] },
  'magic-initiate': {
    choices: [
      {
        kind: 'option',
        id: 'list',
        label: 'Spell list',
        count: 1,
        options: ['cleric', 'druid', 'wizard'].map((c) => ({ id: c, name: c[0].toUpperCase() + c.slice(1) })),
      },
      {
        kind: 'option',
        id: 'ability',
        label: 'Spellcasting ability',
        count: 1,
        options: (['int', 'wis', 'cha'] as const).map((a) => ({ id: a, name: a.toUpperCase() })),
      },
      { kind: 'spell', id: 'cantrips', label: 'Two cantrips', count: 2, level: 0, lists: { fromChoice: 'list' }, ability: { fromChoice: 'ability' } },
      { kind: 'spell', id: 'spell', label: 'One level 1 spell', count: 1, level: 1, lists: { fromChoice: 'list' }, ability: { fromChoice: 'ability' } },
    ],
  },
  'ability-score-improvement': { choices: [asi(2, 'any', 20, 2)] },
  grappler: { choices: [asi(1, ['str', 'dex'], 20)] },
  archery: { effects: [{ type: 'rangedAttackBonus', value: 2 }] },
  defense: { effects: [{ type: 'acBonus', value: 1, whileArmored: true }] },
};

// ---------- build ----------

function build(): Omit<RulesData, 'edition'> {
  const equipment = raw('Equipment');
  for (const e of equipment) toolNameToId.set(e.name.toLowerCase(), e.index);

  // Items
  const items: ItemDef[] = equipment.map((e): ItemDef => {
    const cats: string[] = e.equipment_categories.map((c: any) => c.index);
    const has = (c: string) => cats.includes(c);
    const item: ItemDef = {
      id: e.index,
      name: e.name,
      source: 'srd',
      category: has('weapons')
        ? 'weapon'
        : has('armor')
          ? 'armor'
          : has('equipment-packs')
            ? 'pack'
            : has('tools') || has('other-tools')
              ? 'tool'
              : has('ammunition')
                ? 'ammunition'
                : has('arcane-foci') || has('druidic-foci') || has('holy-symbols')
                  ? 'focus'
                  : 'gear',
    };
    if (e.cost) item.cost = `${e.cost.quantity} ${e.cost.unit}`;
    if (e.weight != null) item.weight = e.weight;
    const desc = clean(e.description ?? e.desc);
    if (desc) item.description = desc;
    if (item.category === 'weapon' && e.damage) {
      item.weapon = {
        category: has('martial-weapons') ? 'martial' : 'simple',
        kind: has('ranged-weapons') ? 'ranged' : 'melee',
        damage: e.damage.damage_dice,
        damageType: e.damage.damage_type?.index ?? '',
        properties: (e.properties ?? []).map((p: any) => p.index),
      };
      if (e.two_handed_damage) item.weapon.versatile = e.two_handed_damage.damage_dice;
      if (e.mastery) item.weapon.mastery = e.mastery.index;
      const range = has('ranged-weapons') ? e.range : e.throw_range;
      if (range?.normal && (has('ranged-weapons') || e.throw_range))
        item.weapon.range = { normal: range.normal, long: range.long };
    }
    if (item.category === 'armor' && e.armor_class) {
      const shield = has('shields');
      item.armor = {
        type: shield ? 'shield' : has('heavy-armor') ? 'heavy' : has('medium-armor') ? 'medium' : 'light',
        base: e.armor_class.base,
        dexMax: shield || !e.armor_class.dex_bonus ? 0 : (e.armor_class.max_bonus ?? null),
        strMin: e.str_minimum || undefined,
        stealthDisadvantage: e.stealth_disadvantage || undefined,
      };
    }
    if (e.contents) item.contents = e.contents.map((c: any) => ({ item: c.item.index, count: c.quantity }));
    return item;
  });

  const TOOL_CATS = new Set(['tools', 'other-tools', 'artisans-tools', 'musical-instruments', 'gaming-sets']);
  const tools = equipment
    .filter((e) => e.equipment_categories.some((c: any) => TOOL_CATS.has(c.index)))
    .map((e) => ({
      id: e.index,
      name: e.name,
      group: e.equipment_categories.find((c: any) => c.index !== 'tools')?.name,
    }));

  // Classes
  const levelsRaw = raw('Levels');
  const featuresRaw = raw('Features');
  const featureById = new Map<string, any>(featuresRaw.map((f) => [f.index, f]));
  const PROGRESSION: Record<string, CasterProgression> = {
    bard: 'full',
    cleric: 'full',
    druid: 'full',
    sorcerer: 'full',
    wizard: 'full',
    paladin: 'half',
    ranger: 'half',
    warlock: 'pact',
  };

  const classes: ClassDef[] = raw('Classes').map((c): ClassDef => {
    const [skillPc, ...otherPcs] = c.proficiency_choices;
    const skill = profChoiceToChoice(skillPc, 'skills');
    const rows = levelsRaw
      .filter((l) => l.class.index === c.index && !l.subclass)
      .sort((a, b) => a.level - b.level);

    const features: Feature[] = [];
    const seen = new Set<string>();
    const levels: LevelRow[] = rows.map((l): LevelRow => {
      const featureIds: string[] = [];
      for (const ref of l.features) {
        const src = featureById.get(ref.index);
        if (!src) continue;
        const id = seen.has(ref.index) ? `${ref.index}-${l.level}` : ref.index;
        seen.add(ref.index);
        featureIds.push(id);
        const isSubclass = ref.index.endsWith('-subclass');
        features.push(
          patchFeature(
            {
              id,
              name: src.name,
              level: l.level,
              description: clean(src.description ?? src.desc),
              ...(isSubclass ? { hidden: true } : {}),
            },
            classFeaturePatch(ref.index),
          ),
        );
      }
      const extras: Record<string, number | string> = {};
      for (const [k, v] of Object.entries<any>(l.class_specific ?? {})) {
        if (typeof v === 'number') extras[k] = v;
        else if (v && typeof v === 'object' && 'dice_count' in v) extras[k] = `${v.dice_count}d${v.dice_value}`;
      }
      const row: LevelRow = { level: l.level, profBonus: l.prof_bonus, features: featureIds, extras };
      if (l.spellcasting) {
        row.cantrips = l.spellcasting.cantrips_known ?? 0;
        row.prepared = l.spellcasting.prepared_spells ?? 0;
        row.slots = Array.from({ length: 9 }, (_, i) => l.spellcasting[`spell_slots_level_${i + 1}`] ?? 0);
      }
      return row;
    });

    const mc = c.multi_classing ?? {};
    const prerequisites: { ability: Ability; min: number }[][] = mc.prerequisite_options
      ? [mc.prerequisite_options.from.options.map((o: any) => ({ ability: o.ability_score.index, min: o.minimum_score }))]
      : (mc.prerequisites ?? []).map((p: any) => [{ ability: p.ability_score.index, min: p.minimum_score }]);

    const cls: ClassDef = {
      id: c.index,
      name: c.name,
      source: 'srd',
      hitDie: c.hit_die,
      primaryAbilities: optionItems(c.primary_ability?.ability_score_options?.from).map((o: any) => o.item.index),
      saves: c.saving_throws.map((s: any) => s.index),
      skillChoice: { count: skill.kind === 'skill' ? skill.count : 2, from: skill.kind === 'skill' ? skill.from : 'any' },
      effects: c.proficiencies.flatMap(profToEffects),
      choices: otherPcs.map((pc: any, i: number) => profChoiceToChoice(pc, `tools-${i + 1}`)),
      startingEquipment: bundles(c.starting_equipment_options),
      multiclass: {
        prerequisites,
        effects: (mc.proficiencies ?? []).flatMap(profToEffects),
        choices: (mc.proficiency_choices ?? []).map((pc: any, i: number) => profChoiceToChoice(pc, `mc-${i + 1}`)),
      },
      subclassLevel: 3,
      levels,
      features,
    };
    if (!cls.primaryAbilities.length)
      cls.primaryAbilities = (c.primary_ability?.ability_scores ?? []).map((a: any) => a.index);
    // "Dexterity and Wisdom" (Monk) vs "Strength or Dexterity" (Fighter).
    if (cls.primaryAbilities.length > 1 && !c.primary_ability?.ability_score_options) cls.primaryAbilitiesAll = true;
    if (c.spellcasting)
      cls.spellcasting = { ability: c.spellcasting.spellcasting_ability.index, progression: PROGRESSION[c.index] ?? 'full' };
    return cls;
  });

  // Subclasses
  const subclasses: SubclassDef[] = raw('Subclasses').map((s) => ({
    id: s.index,
    name: s.name,
    source: 'srd',
    classId: s.class.index,
    summary: clean(s.summary),
    description: clean(s.description ?? s.desc),
    features: s.features.map((f: any) => {
      const name = f.name.startsWith('Circle of the Land Spells') ? 'Circle of the Land Spells' : f.name;
      return patchFeature(
        { id: `${s.index}-${slug(name)}`, name, level: f.level, description: clean(f.description ?? f.desc) },
        SUBCLASS_FEATURE_PATCH[`${s.index}:${name}`],
      );
    }),
  }));

  // Species
  const traitsRaw = new Map<string, any>(raw('Traits').map((t) => [t.index, t]));
  const trait = (index: string, level = 1): Feature => {
    const t = traitsRaw.get(index);
    return patchFeature(
      { id: index, name: t?.name ?? index, level, description: clean(t?.description ?? t?.desc) },
      traitPatch(index),
    );
  };
  const subspecies = raw('Subspecies');
  const LINEAGE_LABEL: Record<string, string> = {
    dragonborn: 'Draconic Ancestry',
    elf: 'Elven Lineage',
    gnome: 'Gnomish Lineage',
    goliath: 'Giant Ancestry',
    tiefling: 'Fiendish Legacy',
  };
  const LINEAGE_CASTERS = new Set(['elf', 'gnome', 'tiefling']);

  const species: SpeciesDef[] = raw('Species').map((s): SpeciesDef => {
    const sizeOptions: string[] | undefined = s.size_options
      ? optionItems(s.size_options.from).map((o: any) => o.size)
      : s.index === 'human'
        ? ['Small', 'Medium']
        : undefined;
    const lineages = subspecies
      .filter((ss) => ss.species.index === s.index)
      .map((ss) => ({
        id: ss.index,
        name: ss.name.replace(/^[^:]+:\s*/, ''),
        traits: ss.traits.map((t: any) => trait(t.index, t.level ?? 1)),
      }));
    const choices: Choice[] = [];
    if (sizeOptions) choices.push({ kind: 'size', id: 'size', label: 'Size', options: sizeOptions });
    if (LINEAGE_CASTERS.has(s.index)) choices.push(LINEAGE_ABILITY);
    return {
      id: s.index,
      name: s.name,
      source: 'srd',
      creatureType: s.type ?? 'Humanoid',
      size: s.size ?? sizeOptions?.[1] ?? 'Medium',
      ...(sizeOptions ? { sizeOptions } : {}),
      speed: s.speed,
      traits: s.traits.map((t: any) => trait(t.index)),
      ...(choices.length ? { choices } : {}),
      ...(lineages.length ? { lineages, lineageLabel: LINEAGE_LABEL[s.index] ?? 'Lineage' } : {}),
    };
  });

  // Backgrounds
  const FEAT_LIST_NOTE: Record<string, string> = { acolyte: 'cleric', sage: 'wizard' };
  const backgrounds: BackgroundDef[] = raw('Backgrounds').map((b): BackgroundDef => {
    const list = (b.feat.note as string | undefined)?.toLowerCase() ?? FEAT_LIST_NOTE[b.index];
    const effects = b.proficiencies.flatMap(profToEffects);
    const bg: BackgroundDef = {
      id: b.index,
      name: b.name,
      source: 'srd',
      abilities: b.ability_scores.map((a: any) => a.index),
      feat: b.feat.index,
      effects,
      equipment: bundles(b.equipment_options),
    };
    if (b.feat.index === 'magic-initiate' && list) bg.featPresets = { list: [list] };
    if (b.proficiency_choices?.length)
      bg.choices = b.proficiency_choices.map((pc: any, i: number) => profChoiceToChoice(pc, `tool-${i + 1}`));
    return bg;
  });

  // Feats
  const feats: FeatDef[] = raw('Feats').map((f): FeatDef => {
    const description = clean(f.description ?? f.desc);
    const base: FeatDef = {
      id: f.index,
      name: f.name,
      source: 'srd',
      type: f.type,
      description,
      repeatable: Boolean(f.repeatable),
      ...(f.prerequisites ? { prerequisite: { minLevel: f.prerequisites.minimum_level } } : {}),
    };
    if (f.type === 'epic-boon' && /increase one ability score of your choice by 1/i.test(description))
      base.choices = [asi(1, 'any', 30)];
    return { ...base, ...FEAT_PATCH[f.index] };
  });

  // Spells
  const spellsOut: SpellDef[] = raw('Spells').map((s) => {
    const sp: SpellDef = {
      id: s.index,
      name: s.name,
      source: 'srd',
      level: s.level,
      school: s.school?.name ?? '',
      classes: (s.classes ?? []).map((c: any) => c.index),
      castingTime: s.casting_time,
      range: s.range,
      components: s.components ?? [],
      duration: s.duration,
      concentration: Boolean(s.concentration),
      ritual: Boolean(s.ritual),
      description: clean(s.description ?? s.desc),
    };
    if (s.material) sp.material = clean(s.material);
    const hl = clean(s.higher_level);
    if (hl) sp.higherLevel = hl;
    if (s.attack_type) sp.attackType = s.attack_type;
    if (s.dc?.dc_type?.index) sp.save = s.dc.dc_type.index;
    const dmg = Array.isArray(s.damage) ? s.damage[0] : s.damage;
    if (dmg && (dmg.damage_at_slot_level || dmg.damage_at_character_level))
      sp.damage = {
        ...(dmg.damage_type?.index ? { type: dmg.damage_type.index } : {}),
        ...(dmg.damage_at_slot_level ? { atSlot: dmg.damage_at_slot_level } : {}),
        ...(dmg.damage_at_character_level ? { atCharLevel: dmg.damage_at_character_level } : {}),
      };
    if (s.heal_at_slot_level) sp.heal = { atSlot: s.heal_at_slot_level };
    else {
      // 2024 data only states healing in prose: "regains ... equal to 2d8 plus your spellcasting ability modifier".
      const m = sp.description.match(/(\d+d\d+) plus your spellcasting ability modifier/);
      if (m && /regains?/i.test(sp.description)) sp.heal = { atSlot: { [String(s.level)]: `${m[1]} + MOD` } };
    }
    return sp;
  });

  // Keywords: conditions, damage types, weapon properties, masteries, glossary overlay.
  const keywords: KeywordDef[] = [];
  const addKw = (k: KeywordDef) => {
    const dup = keywords.findIndex((x) => x.term.toLowerCase() === k.term.toLowerCase());
    if (dup >= 0) keywords[dup] = k; // later sources (glossary) win
    else keywords.push(k);
  };
  for (const c of raw('Conditions'))
    addKw({ id: c.index, term: c.name, kind: 'condition', description: clean(c.description ?? c.desc), source: 'srd' });
  for (const d of raw('Damage-Types'))
    addKw({
      id: `damage-${d.index}`,
      term: `${d.name} damage`,
      kind: 'damage',
      description: clean(d.description ?? d.desc),
      source: 'srd',
    });
  for (const p of raw('Weapon-Properties'))
    addKw({ id: `property-${p.index}`, term: p.name, kind: 'weapon-property', description: clean(p.description ?? p.desc), source: 'srd' });
  for (const m of raw('Weapon-Mastery-Properties'))
    addKw({ id: `mastery-${m.index}`, term: m.name, kind: 'mastery', description: clean(m.description ?? m.desc), source: 'srd' });
  for (const g of overlay<KeywordDef[]>('glossary', [])) addKw({ ...g, source: 'srd' });

  const languages = raw('Languages').map((l) => ({ id: l.index, name: l.name, rare: Boolean(l.is_rare) }));
  for (const extra of [
    { id: 'druidic', name: 'Druidic', rare: true },
    { id: 'thieves-cant', name: "Thieves' Cant", rare: true },
  ])
    if (!languages.some((l) => l.id === extra.id)) languages.push(extra);

  const itemIds = new Set(items.map((i) => i.id));
  for (const m of raw('Magic-Items')) {
    const item = magicItemOf(m, itemIds);
    if (item) items.push(item);
  }

  return {
    classes,
    subclasses,
    species,
    backgrounds,
    feats,
    spells: spellsOut,
    items,
    keywords,
    languages,
    tools,
  };
}

// ---------- sanity checks + write ----------

function check(data: Omit<RulesData, 'edition'>) {
  const spellIds = new Set(data.spells.map((s) => s.id));
  const problems: string[] = [];
  const visitEffects = (where: string, effects?: Effect[]) => {
    for (const e of effects ?? []) if (e.type === 'spell' && !spellIds.has(e.spell)) problems.push(`${where}: unknown spell ${e.spell}`);
  };
  const visitChoices = (where: string, choices?: Choice[]) => {
    for (const c of choices ?? [])
      if (c.kind === 'option') for (const o of c.options) visitEffects(`${where}/${c.id}/${o.id}`, o.effects);
  };
  const visitFeature = (owner: string, f: Feature) => {
    visitEffects(`${owner}/${f.id}`, f.effects);
    visitChoices(`${owner}/${f.id}`, f.choices);
  };
  for (const c of data.classes) for (const f of c.features) visitFeature(c.id, f);
  for (const s of data.subclasses) for (const f of s.features) visitFeature(s.id, f);
  for (const s of data.species) {
    for (const t of s.traits) visitEffects(`${s.id}/${t.id}`, t.effects);
    for (const l of s.lineages ?? []) for (const t of l.traits) visitEffects(`${l.id}/${t.id}`, t.effects);
  }
  const skillSet = new Set<string>(SKILL_IDS);
  for (const c of data.classes)
    if (c.skillChoice.from !== 'any') for (const s of c.skillChoice.from) if (!skillSet.has(s)) problems.push(`${c.id}: bad skill ${s}`);
  for (const b of data.backgrounds) for (const a of b.abilities) if (!ABILITIES.includes(a)) problems.push(`${b.id}: bad ability ${a}`);
  if (!invocations.length) problems.push('WARN data/overlays/invocations.json missing — Eldritch Invocations have no options');
  if (!metamagic.length) problems.push('WARN data/overlays/metamagic.json missing — Metamagic has no options');
  return problems;
}

const data = build();
const problems = check(data);
mkdirSync(OUT, { recursive: true });
for (const [key, value] of Object.entries(data)) writeFileSync(join(OUT, `${key}.json`), JSON.stringify(value, null, 1) + '\n');
// Creatures are loaded lazily by the companions panel, so they live outside RulesData.
mkdirSync(join(ROOT, 'data/creatures'), { recursive: true });
writeFileSync(join(ROOT, 'data/creatures/2024.json'), JSON.stringify(raw('Monsters').filter(isCompanionCandidate).map(creatureOf)) + '\n');
console.log(
  Object.entries(data)
    .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
    .join(', '),
);
if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));
