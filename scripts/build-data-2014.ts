/**
 * Converts the 5e-bits 2014 SRD dataset (data/raw-2014, SRD 5.1 CC-BY-4.0) into the app's
 * rules schema (data/srd-2014). Mechanics the SRD only states in prose are patched below.
 *
 * Run: npm run build:data   (builds both editions)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  EquipmentBundle,
  FeatDef,
  Feature,
  ItemDef,
  KeywordDef,
  LevelRow,
  RulesData,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from '../src/types/rules';
import { SKILL_IDS } from '../src/types/rules';
import { WEAPON_PLURALS, clean, creatureOf, isCompanionCandidate, magicItemOf, optionItems, profChoiceToChoice, profToEffects, slug, toolNameToId } from './lib/convert';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data/raw-2014');
const OUT = join(ROOT, 'data/srd-2014');
const raw = (name: string): any[] => JSON.parse(readFileSync(join(RAW, `${name}.json`), 'utf8'));

// ---------- items ----------

const equipment = raw('Equipment');
for (const e of equipment) toolNameToId.set(e.name.toLowerCase(), e.index);
// 2014 weapon proficiencies are plural names ("Hand crossbows", "Light hammers").
for (const e of equipment.filter((x) => x.weapon_category)) {
  const n = e.name.toLowerCase();
  if (n.includes(',')) {
    const [base, kind] = n.split(', ');
    WEAPON_PLURALS[slug(`${kind} ${base}s`)] = e.index; // "light crossbows"
    WEAPON_PLURALS[slug(`${base}s ${kind}`)] = e.index; // "crossbows-light"
  } else WEAPON_PLURALS[slug(`${n}s`)] = e.index;
}

function itemOf(e: any): ItemDef {
  const cat = e.equipment_category?.index;
  const item: ItemDef = {
    id: e.index,
    name: e.name,
    source: 'srd',
    category:
      cat === 'weapon'
        ? 'weapon'
        : cat === 'armor'
          ? 'armor'
          : cat === 'tools'
            ? 'tool'
            : e.gear_category?.index === 'equipment-packs'
              ? 'pack'
              : e.gear_category?.index === 'ammunition'
                ? 'ammunition'
                : ['arcane-foci', 'druidic-foci', 'holy-symbols'].includes(e.gear_category?.index)
                  ? 'focus'
                  : 'gear',
  };
  if (e.cost) item.cost = `${e.cost.quantity} ${e.cost.unit}`;
  if (e.weight != null) item.weight = e.weight;
  const desc = clean(e.desc);
  if (desc) item.description = desc;
  if (item.category === 'weapon' && e.damage) {
    const ranged = e.weapon_range === 'Ranged';
    item.weapon = {
      category: e.weapon_category === 'Martial' ? 'martial' : 'simple',
      kind: ranged ? 'ranged' : 'melee',
      damage: e.damage.damage_dice,
      damageType: e.damage.damage_type?.index ?? '',
      properties: (e.properties ?? []).map((p: any) => p.index),
    };
    if (e.two_handed_damage) item.weapon.versatile = e.two_handed_damage.damage_dice;
    const range = ranged ? e.range : e.throw_range;
    if (range?.normal) item.weapon.range = { normal: range.normal, long: range.long };
  }
  if (item.category === 'armor' && e.armor_class) {
    const type = (e.armor_category ?? '').toLowerCase();
    item.armor = {
      type: type === 'shield' ? 'shield' : (type as 'light'),
      base: e.armor_class.base,
      dexMax: type === 'shield' || !e.armor_class.dex_bonus ? 0 : (e.armor_class.max_bonus ?? null),
      strMin: e.str_minimum || undefined,
      stealthDisadvantage: e.stealth_disadvantage || undefined,
    };
  }
  if (e.contents) item.contents = e.contents.map((c: any) => ({ item: c.item.index, count: c.quantity }));
  return item;
}

// ---------- equipment groups ----------

const equipmentIds = new Set(equipment.map((e) => e.index));
const categories = new Map<string, any>(raw('Equipment-Categories').map((c) => [c.index, c]));
/** Singular labels for the categories that starting equipment lets you pick from. */
const PICK_LABELS: Record<string, string> = {
  'simple-weapons': 'simple weapon',
  'simple-melee-weapons': 'simple melee weapon',
  'martial-weapons': 'martial weapon',
  'martial-melee-weapons': 'martial melee weapon',
  'holy-symbols': 'holy symbol',
  'arcane-foci': 'arcane focus',
  'druidic-foci': 'druidic focus',
  'musical-instruments': 'musical instrument',
};

/** "2 × Martial Weapons of your choice" as a pick from the category's items. */
function pickItem(categoryIndex: string, count: number): EquipmentBundle['items'][number] {
  const cat = categories.get(categoryIndex);
  const label = PICK_LABELS[categoryIndex] ?? cat.name.toLowerCase();
  const options = cat.equipment.map((e: any) => e.index).filter((id: string) => equipmentIds.has(id));
  return { item: '', name: `${cat.name} of your choice`, count, choose: { options, label } };
}

function optionToBundle(o: any, label: string): EquipmentBundle {
  const b: EquipmentBundle = { label, items: [], gp: 0 };
  const add = (x: any) => {
    if (x.option_type === 'counted_reference') b.items.push({ item: x.of.index, name: x.of.name, count: x.count });
    else if (x.option_type === 'reference') b.items.push({ item: x.item.index, name: x.item.name, count: 1 });
    else if (x.option_type === 'choice') {
      const cat = x.choice.from?.equipment_category?.index;
      b.items.push(cat ? pickItem(cat, x.choice.choose ?? 1) : { item: '', name: clean(x.choice.desc), count: 1 });
    } else if (x.option_type === 'multiple') x.items.forEach(add);
  };
  add(o);
  return b;
}

function equipmentGroups(fixed: any[] | undefined, options: any[] | undefined, gp = 0): EquipmentBundle[][] {
  const groups: EquipmentBundle[][] = [];
  if (fixed?.length || gp)
    groups.push([
      { label: 'Included', items: (fixed ?? []).map((f) => ({ item: f.equipment.index, name: f.equipment.name, count: f.quantity })), gp },
    ]);
  for (const set of options ?? []) {
    if (set.from?.option_set_type === 'equipment_category') {
      groups.push([{ label: 'A', items: [pickItem(set.from.equipment_category.index, set.choose ?? 1)], gp: 0 }]);
      continue;
    }
    groups.push(optionItems(set.from).map((o: any, i: number) => optionToBundle(o, String.fromCharCode(65 + i))));
  }
  return groups;
}

// ---------- features ----------

const featuresRaw = raw('Features');
const featureById = new Map<string, any>(featuresRaw.map((f) => [f.index, f]));

/** Features that only announce the subclass choice; the subclass itself is picked separately. */
const SUBCLASS_PICK = new Set([
  'Primal Path', 'Bard College', 'Divine Domain', 'Druid Circle', 'Martial Archetype', 'Monastic Tradition',
  'Sacred Oath', 'Ranger Archetype', 'Roguish Archetype', 'Sorcerous Origin', 'Otherworldly Patron', 'Arcane Tradition',
]);

const FIGHTING_STYLE_EFFECTS: Record<string, Effect[]> = {
  archery: [{ type: 'rangedAttackBonus', value: 2 }],
  defense: [{ type: 'acBonus', value: 1, whileArmored: true }],
};

const FEATURE_EFFECTS: Record<string, Effect[]> = {
  rage: [
    {
      type: 'toggle',
      id: 'rage',
      label: 'Rage',
      resource: 'rage_count',
      description: 'Resistance to bludgeoning, piercing and slashing damage; Rage damage on Strength melee attacks; advantage on Strength checks and saves.',
      effects: [
        { type: 'resistance', damage: 'bludgeoning' },
        { type: 'resistance', damage: 'piercing' },
        { type: 'resistance', damage: 'slashing' },
        { type: 'damageRider', id: 'rage', label: 'Rage damage', valueKey: 'rage_damage_bonus', when: 'strMelee', auto: true },
      ],
    },
  ],
  'sneak-attack': [{ type: 'damageRider', id: 'sneak-attack', label: 'Sneak Attack', valueKey: 'sneak_attack', when: 'finesseOrRanged' }],
  'divine-smite': [
    { type: 'damageRider', id: 'divine-smite', label: 'Divine Smite (spend a slot)', perSlot: { base: '2d8', perLevel: '1d8' }, when: 'melee' },
  ],
  'barbarian-unarmored-defense': [{ type: 'acFormula', name: 'Unarmored Defense', base: 10, abilities: ['dex', 'con'], allowShield: true }],
  'monk-unarmored-defense': [{ type: 'acFormula', name: 'Unarmored Defense', base: 10, abilities: ['dex', 'wis'], allowShield: false }],
  'fast-movement': [{ type: 'speedBonus', value: 10, notHeavy: true }],
  'unarmored-movement-1': [{ type: 'speedBonus', value: 0, valueKey: 'unarmored_movement', unarmored: true }],
  'jack-of-all-trades': [{ type: 'halfProficiency' }],
  'thieves-cant': [{ type: 'language', language: 'thieves-cant' }],
  druidic: [{ type: 'language', language: 'druidic' }],
  'bonus-proficiency': [{ type: 'armor', armor: 'heavy' }],
  'draconic-resilience': [
    { type: 'hpPerLevel', value: 1, classId: 'sorcerer' },
    { type: 'acFormula', name: 'Draconic Resilience', base: 13, abilities: ['dex'], allowShield: true },
  ],
};

function nestedChoose(fs: any): number {
  const opts = optionItems(fs.from);
  const nested = opts.find((o: any) => o.option_type === 'choice');
  return nested ? nested.choice.choose : fs.choose;
}

function choicesFromFeature(f: any): Choice[] {
  const out: Choice[] = [];
  for (const [key, spec] of Object.entries<any>(f.feature_specific ?? {})) {
    if (key === 'expertise_options') {
      out.push({ kind: 'skill', id: 'expertise', label: `Expertise: choose ${nestedChoose(spec)} proficient skills`, count: nestedChoose(spec), from: 'any', expertise: true });
    } else if (key === 'subfeature_options') {
      const options: ChoiceOption[] = optionItems(spec.from).map((o: any) => {
        const sub = featureById.get(o.item.index);
        const name = (sub?.name ?? o.item.name).replace(/^[^:]+:\s*/, '');
        return { id: o.item.index, name, description: clean(sub?.desc), effects: FIGHTING_STYLE_EFFECTS[slug(name)] };
      });
      out.push({ kind: 'option', id: 'options', label: f.name, count: spec.choose ?? 1, options });
    } else if (key === 'invocations') {
      const options: ChoiceOption[] = (spec as any[]).map((r) => {
        const sub = featureById.get(r.index);
        const prereq = (sub?.prerequisites ?? []).map((p: any) => (p.type === 'level' ? `Level ${p.level ?? p.index?.split('-').pop()}+` : p.spell ? `${p.spell.split('/').pop()} cantrip` : p.feature ? p.feature.split('/').pop() : '')).filter(Boolean);
        return { id: r.index, name: r.name.replace(/^Eldritch Invocation:\s*/, ''), description: clean(sub?.desc), ...(prereq.length ? { prerequisite: prereq.join(', ') } : {}) };
      });
      out.push({ kind: 'option', id: 'invocations', label: 'Eldritch Invocations', count: 2, countKey: 'invocations_known', options });
    } else if (key.endsWith('_options')) {
      const options: ChoiceOption[] = optionItems(spec.from).map((o: any) => {
        const v = o.string ?? o.item?.name ?? String(o);
        return { id: slug(v), name: v };
      });
      out.push({ kind: 'option', id: key.replace(/_options$/, ''), label: `${f.name}: choose ${spec.choose}`, count: spec.choose ?? 1, options });
    }
  }
  return out;
}

function toFeature(f: any, level: number): Feature {
  const feature: Feature = { id: f.index, name: f.name, level, description: clean(f.desc) };
  if (SUBCLASS_PICK.has(f.name)) feature.hidden = true;
  if (/^Domain Spells$|^Circle Spells$|^Oath Spells$/.test(f.name)) feature.hidden = true;
  if (f.index === 'bonus-proficiencies')
    feature.choices = [{ kind: 'skill', id: 'skills', label: 'Bonus Proficiencies: three skills', count: 3, from: 'any' }];
  if (f.name === 'Ability Score Improvement')
    feature.choices = [{ kind: 'feat', id: 'feat', label: 'Ability Score Improvement (or a feat)', featTypes: ['general'] }];
  const choices = choicesFromFeature(f);
  if (choices.length) feature.choices = [...(feature.choices ?? []), ...choices];
  const effects = FEATURE_EFFECTS[f.index];
  if (effects) feature.effects = effects;
  return feature;
}

// ---------- classes ----------

const PROGRESSION: Record<string, CasterProgression> = {
  bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full', paladin: 'half', ranger: 'half', warlock: 'pact',
};
const KNOWN = new Set(['bard', 'ranger', 'sorcerer', 'warlock']);
const PREPARED_DIVISOR: Record<string, 1 | 2> = { cleric: 1, druid: 1, wizard: 1, paladin: 2 };
const PRIMARY: Record<string, { abilities: Ability[]; all?: boolean }> = {
  barbarian: { abilities: ['str'] }, bard: { abilities: ['cha'] }, cleric: { abilities: ['wis'] }, druid: { abilities: ['wis'] },
  fighter: { abilities: ['str', 'dex'] }, monk: { abilities: ['dex', 'wis'], all: true }, paladin: { abilities: ['str', 'cha'], all: true },
  ranger: { abilities: ['dex', 'wis'], all: true }, rogue: { abilities: ['dex'] }, sorcerer: { abilities: ['cha'] },
  warlock: { abilities: ['cha'] }, wizard: { abilities: ['int'] },
};

const levelsRaw = raw('Levels');

const classes: ClassDef[] = raw('Classes').map((c): ClassDef => {
  const pcs: any[] = c.proficiency_choices ?? [];
  const skillIdx = pcs.findIndex((pc) => optionItems(pc.from).some((o: any) => o.item?.index?.startsWith('skill-')));
  const skill = skillIdx >= 0 ? profChoiceToChoice(pcs[skillIdx], 'skills') : undefined;
  const rows = levelsRaw.filter((l) => l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);

  const features: Feature[] = [];
  let subclassLevel = 3;
  const levels: LevelRow[] = rows.map((l): LevelRow => {
    const ids: string[] = [];
    for (const ref of l.features) {
      const src = featureById.get(ref.index);
      if (!src || features.some((f) => f.id === ref.index)) continue;
      if (SUBCLASS_PICK.has(src.name)) subclassLevel = Math.min(subclassLevel, l.level);
      features.push(toFeature(src, l.level));
      ids.push(ref.index);
    }
    const extras: Record<string, number | string> = {};
    for (const [k, v] of Object.entries<any>(l.class_specific ?? {})) {
      if (typeof v === 'number') extras[k] = v;
      else if (v && typeof v === 'object' && 'dice_count' in v) extras[k] = `${v.dice_count}d${v.dice_value}`;
      else if (v && typeof v === 'object' && 'dice_value' in v) extras[k] = v.dice_value;
    }
    // Normalise names the engine reads for resources/speed.
    if (typeof extras.martial_arts === 'number') extras.martial_arts_die = extras.martial_arts;
    const row: LevelRow = { level: l.level, profBonus: l.prof_bonus, features: ids, extras };
    if (l.spellcasting) {
      row.cantrips = l.spellcasting.cantrips_known ?? 0;
      row.prepared = KNOWN.has(c.index) ? (l.spellcasting.spells_known ?? 0) : 0;
      row.slots = Array.from({ length: 9 }, (_, i) => l.spellcasting[`spell_slots_level_${i + 1}`] ?? 0);
    }
    return row;
  });
  // Paladin/Ranger rows before their first spell slot still need a table row.
  if (c.spellcasting) for (const r of levels) r.slots ??= Array(9).fill(0);

  const mc = c.multi_classing ?? {};
  const prerequisites: { ability: Ability; min: number }[][] = mc.prerequisite_options
    ? [mc.prerequisite_options.from.options.map((o: any) => ({ ability: o.ability_score.index, min: o.minimum_score }))]
    : (mc.prerequisites ?? []).map((p: any) => [{ ability: p.ability_score.index, min: p.minimum_score }]);

  const startingGroups = equipmentGroups(c.starting_equipment, c.starting_equipment_options);
  const cls: ClassDef = {
    id: c.index,
    name: c.name,
    source: 'srd',
    hitDie: c.hit_die,
    primaryAbilities: PRIMARY[c.index]?.abilities ?? [],
    ...(PRIMARY[c.index]?.all ? { primaryAbilitiesAll: true } : {}),
    saves: c.saving_throws.map((s: any) => s.index),
    skillChoice: skill?.kind === 'skill' ? { count: skill.count, from: skill.from } : { count: 2, from: 'any' },
    effects: c.proficiencies.flatMap(profToEffects),
    choices: pcs.filter((_, i) => i !== skillIdx).map((pc, i) => profChoiceToChoice(pc, `tools-${i + 1}`)),
    startingEquipment: [],
    startingEquipmentGroups: startingGroups,
    multiclass: {
      prerequisites,
      effects: (mc.proficiencies ?? []).flatMap(profToEffects),
      choices: (mc.proficiency_choices ?? []).map((pc: any, i: number) => profChoiceToChoice(pc, `mc-${i + 1}`)),
    },
    subclassLevel,
    levels,
    features,
  };
  if (c.spellcasting)
    cls.spellcasting = {
      ability: c.spellcasting.spellcasting_ability.index,
      progression: PROGRESSION[c.index] ?? 'full',
      ...(KNOWN.has(c.index) ? { spellsKnown: true } : {}),
      ...(PREPARED_DIVISOR[c.index] ? { preparedFormula: { levelDivisor: PREPARED_DIVISOR[c.index] } } : {}),
    };
  return cls;
});

// ---------- subclasses ----------

const subclasses: SubclassDef[] = raw('Subclasses').map((s): SubclassDef => {
  const feats = featuresRaw
    .filter((f) => f.subclass?.index === s.index && !f.parent)
    .sort((a, b) => a.level - b.level)
    .map((f) => toFeature(f, f.level));
  // Spells tied to a sub-option (Circle of the Land terrain) go on that option.
  const byOption = new Map<string, Effect[]>();
  const always: Effect[] = [];
  for (const sp of s.spells ?? []) {
    const lvlRef = sp.prerequisites.find((p: any) => p.type === 'level');
    const featRef = sp.prerequisites.find((p: any) => p.type === 'feature');
    const effect: Effect = { type: 'spell', spell: sp.spell.index, minLevel: Number(lvlRef?.index.split('-').pop() ?? 1) };
    if (featRef) byOption.set(featRef.index, [...(byOption.get(featRef.index) ?? []), effect]);
    else always.push(effect);
  }
  for (const f of feats)
    for (const ch of f.choices ?? [])
      if (ch.kind === 'option') for (const o of ch.options) if (byOption.has(o.id)) o.effects = [...(o.effects ?? []), ...byOption.get(o.id)!];
  if (always.length) {
    const first = Math.min(...always.map((e) => (e.type === 'spell' ? (e.minLevel ?? 1) : 1)));
    feats.unshift({
      id: `${s.index}-spells`,
      name: `${s.name} Spells`,
      level: first,
      description: `You always have these spells prepared once you reach the listed class level: ${(s.spells ?? [])
        .filter((sp: any) => !sp.prerequisites.some((p: any) => p.type === 'feature'))
        .map((sp: any) => sp.spell.name)
        .join(', ')}.`,
      effects: always,
    });
  }
  return {
    id: s.index,
    name: s.name,
    source: 'srd',
    classId: s.class.index,
    summary: s.subclass_flavor,
    description: clean(s.desc),
    features: feats,
  };
});

// ---------- races ----------

const traitsRaw = new Map<string, any>(raw('Traits').map((t) => [t.index, t]));

const TRAIT_EFFECTS: Record<string, Effect[]> = {
  darkvision: [{ type: 'darkvision', range: 60 }],
  'dwarven-resilience': [{ type: 'resistance', damage: 'poison' }],
  'dwarven-toughness': [{ type: 'hpPerLevel', value: 1 }],
  'hellish-resistance': [{ type: 'resistance', damage: 'fire' }],
  'infernal-legacy': [
    { type: 'spell', spell: 'thaumaturgy', ability: 'cha' },
    { type: 'spell', spell: 'hellish-rebuke', ability: 'cha', minLevel: 3 },
    { type: 'spell', spell: 'darkness', ability: 'cha', minLevel: 5 },
  ],
};

function traitFeature(index: string, level = 1): Feature {
  const t = traitsRaw.get(index);
  const f: Feature = { id: index, name: t?.name ?? index, level, description: clean(t?.desc) };
  const effects: Effect[] = [...(TRAIT_EFFECTS[index] ?? []), ...(t?.proficiencies ?? []).flatMap(profToEffects)];
  const choices: Choice[] = [];
  if (t?.proficiency_choices) {
    const ch = profChoiceToChoice(t.proficiency_choices, 'proficiency');
    choices.push({ ...ch, label: `${t.name}: choose ${t.proficiency_choices.choose}` });
  }
  if (t?.language_options) choices.push(languageChoice(t.language_options, 'language', t.name));
  const ts = t?.trait_specific ?? {};
  if (ts.spell_options)
    choices.push({ kind: 'spell', id: 'cantrip', label: `${t.name}: one Wizard cantrip`, count: ts.spell_options.choose ?? 1, level: 0, lists: ['wizard'], ability: 'int' });
  if (ts.subtrait_options)
    choices.push({
      kind: 'option',
      id: 'ancestry',
      label: t.name,
      count: 1,
      options: optionItems(ts.subtrait_options.from).map((o: any) => {
        const sub = traitsRaw.get(o.item.index);
        const dmg = sub?.trait_specific?.damage_type?.index;
        return { id: o.item.index, name: o.item.name.replace(/^.*\((.*)\)$/, '$1'), description: clean(sub?.desc), ...(dmg ? { effects: [{ type: 'resistance' as const, damage: dmg }] } : {}) };
      }),
    });
  if (effects.length) f.effects = effects;
  if (choices.length) f.choices = choices;
  return f;
}

function languageChoice(lo: any, id: string, label: string): Choice {
  const from = lo.from?.option_set_type === 'resource_list' ? 'any' : optionItems(lo.from).map((o: any) => o.item.index);
  return { kind: 'language', id, label: `${label}: ${lo.choose} language${lo.choose > 1 ? 's' : ''}`, count: lo.choose, from };
}

function abilityTrait(id: string, bonuses: any[]): Feature {
  return {
    id,
    name: 'Ability Score Increase',
    level: 1,
    description: bonuses.map((b) => `${b.ability_score.name} +${b.bonus}`).join(', '),
    effects: bonuses.map((b) => ({ type: 'abilityBonus' as const, ability: b.ability_score.index, value: b.bonus, max: 20 })),
  };
}

const subraces = raw('Subraces');
const species: SpeciesDef[] = raw('Races').map((r): SpeciesDef => {
  const traits: Feature[] = [abilityTrait(`${r.index}-asi`, r.ability_bonuses ?? []), ...r.traits.map((t: any) => traitFeature(t.index))];
  const langs: Feature = {
    id: `${r.index}-languages`,
    name: 'Languages',
    level: 1,
    description: clean(r.language_desc),
    effects: (r.languages ?? []).map((l: any) => ({ type: 'language' as const, language: l.index })),
    ...(r.language_options ? { choices: [languageChoice(r.language_options, 'languages', 'Languages')] } : {}),
  };
  traits.push(langs);
  const choices: Choice[] = [];
  if (r.ability_bonus_options)
    choices.push({
      kind: 'asi',
      id: 'asi',
      label: `Ability Score Increase: +1 to ${r.ability_bonus_options.choose} abilities`,
      points: r.ability_bonus_options.choose,
      from: optionItems(r.ability_bonus_options.from).map((o: any) => o.ability_score.index),
      maxPerAbility: 1,
      max: 20,
    });
  const lineages = subraces
    .filter((s) => s.race.index === r.index)
    .map((s) => ({
      id: s.index,
      name: s.name,
      description: clean(s.desc),
      traits: [abilityTrait(`${s.index}-asi`, s.ability_bonuses ?? []), ...(s.racial_traits ?? []).map((t: any) => traitFeature(t.index))],
    }));
  return {
    id: r.index,
    name: r.name,
    source: 'srd',
    description: [clean(r.age), clean(r.alignment), clean(r.size_description)].filter(Boolean).join('\n'),
    creatureType: 'Humanoid',
    size: r.size,
    speed: r.speed,
    traits: traits.map((t, i) => (i === 0 ? { ...t, hidden: !(r.ability_bonuses ?? []).length } : t)),
    ...(choices.length ? { choices } : {}),
    ...(lineages.length ? { lineages, lineageLabel: 'Subrace' } : {}),
  };
});

// ---------- backgrounds ----------

const backgrounds: BackgroundDef[] = raw('Backgrounds').map((b): BackgroundDef => {
  const groups = equipmentGroups(b.starting_equipment, b.starting_equipment_options, b.starting_gold?.quantity ?? 0);
  const choices: Choice[] = [];
  if (b.language_options) choices.push(languageChoice(b.language_options, 'languages', 'Languages'));
  for (const [i, pc] of (b.starting_proficiency_options ? [b.starting_proficiency_options] : []).entries())
    choices.push(profChoiceToChoice(pc, `proficiency-${i + 1}`));
  return {
    id: b.index,
    name: b.name,
    source: 'srd',
    effects: (b.starting_proficiencies ?? []).flatMap(profToEffects),
    ...(choices.length ? { choices } : {}),
    ...(b.feature ? { feature: { id: `${b.index}-feature`, name: b.feature.name, level: 0, description: clean(b.feature.desc) } } : {}),
    equipment: [],
    equipmentGroups: groups,
  };
});

// ---------- feats ----------

const feats: FeatDef[] = [
  {
    id: 'ability-score-improvement',
    name: 'Ability Score Improvement',
    source: 'srd',
    type: 'general',
    description: 'Increase one ability score by 2, or two ability scores by 1. You can’t increase an ability score above 20 this way.',
    repeatable: true,
    choices: [{ kind: 'asi', id: 'asi', label: 'Ability Score Improvement (+2)', points: 2, from: 'any', maxPerAbility: 2, max: 20 }],
  },
  ...raw('Feats').map(
    (f): FeatDef => ({
      id: f.index,
      name: f.name,
      source: 'srd',
      type: 'general',
      description: clean(f.desc),
      repeatable: false,
      ...(f.prerequisites?.length
        ? { prerequisite: { text: f.prerequisites.map((p: any) => `${p.ability_score.name} ${p.minimum_score}`).join(', ') } }
        : {}),
    }),
  ),
];

// ---------- spells ----------

const spells: SpellDef[] = raw('Spells').map((s) => {
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
    description: clean(s.desc),
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

// ---------- keywords ----------

const keywords: KeywordDef[] = [];
for (const c of raw('Conditions')) keywords.push({ id: c.index, term: c.name, kind: 'condition', description: clean(c.desc), source: 'srd' });
for (const d of raw('Damage-Types'))
  keywords.push({ id: `damage-${d.index}`, term: `${d.name} damage`, kind: 'damage', description: clean(d.desc), source: 'srd' });
for (const p of raw('Weapon-Properties'))
  keywords.push({ id: `property-${p.index}`, term: p.name, kind: 'weapon-property', description: clean(p.desc), source: 'srd' });

/** Rule-section headings to expose as hover terms: heading -> [term, aliases, kind]. */
const RULE_TERMS: Record<string, [string, string[], KeywordDef['kind']]> = {
  Advantage: ['Advantage', ['advantage', 'Disadvantage', 'disadvantage'], 'rule'],
  'Advantage and Disadvantage': ['Advantage', ['advantage', 'Disadvantage', 'disadvantage'], 'rule'],
  'Bonus Actions': ['Bonus Action', ['bonus action', 'Bonus Actions'], 'rule'],
  Reactions: ['Reaction', ['reaction', 'Reactions'], 'rule'],
  'Opportunity Attacks': ['Opportunity Attack', ['opportunity attack', 'Opportunity Attacks'], 'rule'],
  Concentration: ['Concentration', ['concentration'], 'rule'],
  'Temporary Hit Points': ['Temporary Hit Points', ['temporary hit points'], 'rule'],
  Cover: ['Cover', ['half cover', 'three-quarters cover', 'total cover'], 'rule'],
  'Difficult Terrain': ['Difficult Terrain', ['difficult terrain'], 'rule'],
  'Damage Resistance and Vulnerability': ['Resistance', ['resistance', 'vulnerability', 'Vulnerability'], 'rule'],
  'Death Saving Throws': ['Death Saving Throw', ['death saving throw', 'death saving throws'], 'rule'],
  'Short Rest': ['Short Rest', ['short rest'], 'rule'],
  'Long Rest': ['Long Rest', ['long rest'], 'rule'],
  Surprise: ['Surprise', ['surprised'], 'rule'],
  'Critical Hits': ['Critical Hit', ['critical hit'], 'rule'],
  Grappling: ['Grappling', ['grapple'], 'rule'],
  'Shoving a Creature': ['Shove', ['shove'], 'action'],
  Dash: ['Dash', ['Dash action'], 'action'],
  Disengage: ['Disengage', ['Disengage action'], 'action'],
  Dodge: ['Dodge', ['Dodge action'], 'action'],
  Rituals: ['Ritual', ['ritual'], 'rule'],
  'Proficiency Bonus': ['Proficiency Bonus', ['proficiency bonus'], 'rule'],
  'Passive Checks': ['Passive Check', ['passive Wisdom (Perception)'], 'rule'],
  'Two-Weapon Fighting': ['Two-Weapon Fighting', ['two-weapon fighting'], 'rule'],
};

for (const rs of raw('Rule-Sections')) {
  const text: string = rs.desc ?? '';
  // Sections are markdown: split on headings (## / ### / ####).
  const parts = text.split(/\n(?=#{2,4} )/);
  for (const part of parts) {
    const m = part.match(/^#{2,4} (.+)\n/);
    if (!m) continue;
    const heading = m[1].trim();
    const spec = RULE_TERMS[heading];
    if (!spec || keywords.some((k) => k.term === spec[0])) continue;
    const body = clean(part.slice(m[0].length).replace(/\*\*\*/g, '**'));
    keywords.push({ id: slug(spec[0]), term: spec[0], aliases: spec[1], kind: spec[2], description: body.slice(0, 2500), source: 'srd' });
  }
}

// ---------- languages / tools ----------

const languages = raw('Languages').map((l) => ({ id: l.index, name: l.name, rare: l.type === 'Exotic' }));
for (const extra of [
  { id: 'druidic', name: 'Druidic', rare: true },
  { id: 'thieves-cant', name: "Thieves' Cant", rare: true },
])
  if (!languages.some((l) => l.id === extra.id)) languages.push(extra);

const tools = equipment
  // Proficiency kits are filed under adventuring gear in the 2014 data.
  .filter((e) => e.equipment_category?.index === 'tools' || e.tool_category || ['herbalism-kit', 'disguise-kit', 'forgery-kit', 'poisoners-kit'].includes(e.index))
  .map((e) => ({ id: e.index, name: e.name, group: e.tool_category }));

// ---------- check + write ----------

const data: Omit<RulesData, 'edition'> = {
  classes,
  subclasses,
  species,
  backgrounds,
  feats,
  spells,
  items: (() => {
    const items = equipment.map(itemOf);
    const ids = new Set(items.map((i) => i.id));
    for (const m of raw('Magic-Items')) {
      const item = magicItemOf(m, ids);
      if (item) items.push(item);
    }
    return items;
  })(),
  keywords,
  languages,
  tools,
};

const problems: string[] = [];
const spellIds = new Set(spells.map((s) => s.id));
const toolIds = new Set(tools.map((t) => t.id));
const itemIds = new Set(data.items.map((t) => t.id));
const skillSet = new Set<string>(SKILL_IDS);
const visit = (where: string, effects: Effect[] = [], choices: Choice[] = []) => {
  for (const e of effects) {
    if (e.type === 'spell' && !spellIds.has(e.spell)) problems.push(`${where}: unknown spell ${e.spell}`);
    if (e.type === 'tool' && !toolIds.has(e.tool)) problems.push(`${where}: unknown tool ${e.tool}`);
    if (e.type === 'skill' && !skillSet.has(e.skill)) problems.push(`${where}: unknown skill ${e.skill}`);
    if (e.type === 'weapon' && !['simple', 'martial'].includes(e.weapon) && !itemIds.has(e.weapon)) problems.push(`${where}: unknown weapon ${e.weapon}`);
  }
  for (const c of choices) if (c.kind === 'option') for (const o of c.options) visit(`${where}/${o.id}`, o.effects, o.choices);
};
for (const c of classes) {
  visit(c.id, c.effects, c.choices);
  for (const f of c.features) visit(`${c.id}/${f.id}`, f.effects, f.choices);
}
for (const s of subclasses) for (const f of s.features) visit(`${s.id}/${f.id}`, f.effects, f.choices);
for (const s of species) for (const t of [...s.traits, ...(s.lineages ?? []).flatMap((l) => l.traits)]) visit(`${s.id}/${t.id}`, t.effects, t.choices);
for (const b of backgrounds) visit(b.id, b.effects, b.choices);

mkdirSync(OUT, { recursive: true });
for (const [key, value] of Object.entries(data)) writeFileSync(join(OUT, `${key}.json`), JSON.stringify(value, null, 1) + '\n');
mkdirSync(join(ROOT, 'data/creatures'), { recursive: true });
writeFileSync(join(ROOT, 'data/creatures/2014.json'), JSON.stringify(raw('Monsters').filter(isCompanionCandidate).map(creatureOf)) + '\n');
console.log('2014: ' + Object.entries(data).map(([k, v]) => `${k}: ${(v as unknown[]).length}`).join(', '));
if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));

