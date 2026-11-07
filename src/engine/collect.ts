import type { Registry } from '../data/registry';
import type { Character } from '../types/character';
import type { Ability, Choice, Effect, Feature } from '../types/rules';
import { ABILITIES } from '../types/rules';

/** Where a feature/effect came from, for display and level scoping. */
export interface Origin {
  kind: 'species' | 'background' | 'class' | 'subclass' | 'feat' | 'core';
  name: string;
  classId?: string;
}

export interface GrantedEffect {
  effect: Effect;
  origin: Origin;
  /** Choice key prefix that owns this effect (resolves relative fromChoice references). */
  owner: string;
}

export interface GrantedFeature {
  key: string;
  name: string;
  description: string;
  level: number;
  origin: Origin;
}

export interface ChoiceInstance {
  key: string;
  choice: Choice;
  /** Resolved count (countKey / pattern aware). */
  count: number;
  values: string[];
  origin: Origin;
  /** Owner prefix used to resolve sibling references. */
  owner: string;
  /** Values preset by data (e.g. background Magic Initiate list); not editable. */
  locked?: boolean;
}

export interface FeatInstance {
  key: string;
  featId: string;
  origin: Origin;
}

export interface Collected {
  totalLevel: number;
  classLevels: Map<string, number>;
  /** Classes in the order they were first taken. */
  classOrder: string[];
  effects: GrantedEffect[];
  features: GrantedFeature[];
  choices: ChoiceInstance[];
  feats: FeatInstance[];
  /** Classes at/over their subclass level without a chosen subclass. */
  needsSubclass: string[];
  /** Character choices plus data presets. */
  resolved: Record<string, string[]>;
}

export const STANDARD_LANGUAGE_CHOICE: Choice = {
  kind: 'language',
  id: 'languages',
  label: 'Languages: Common plus two more',
  count: 2,
  from: 'any',
};

export const BACKGROUND_ASI = (abilities: Ability[]): Choice => ({
  kind: 'asi',
  id: 'asi',
  label: 'Background ability scores (+2/+1 or +1/+1/+1)',
  points: 3,
  from: abilities,
  maxPerAbility: 2,
  max: 20,
  patterns: [
    [2, 1],
    [1, 1, 1],
  ],
});

export function classLevelsOf(character: Character) {
  const classLevels = new Map<string, number>();
  const classOrder: string[] = [];
  for (const entry of character.levels) {
    if (!classLevels.has(entry.classId)) classOrder.push(entry.classId);
    classLevels.set(entry.classId, (classLevels.get(entry.classId) ?? 0) + 1);
  }
  return { classLevels, classOrder };
}

/** Resolve a fromChoice reference: relative ("list") to the owner, or absolute ("species:lineage-ability"). */
export function resolveRef(ref: string, owner: string, choices: Record<string, string[]>): string[] {
  const key = ref.includes(':') ? ref : `${owner}:${ref}`;
  return choices[key] ?? [];
}

export function collect(character: Character, reg: Registry): Collected {
  const { classLevels, classOrder } = classLevelsOf(character);
  const totalLevel = character.levels.length;
  const out: Collected = {
    totalLevel,
    classLevels,
    classOrder,
    effects: [],
    features: [],
    choices: [],
    feats: [],
    needsSubclass: [],
    resolved: {},
  };
  // Copy so data presets (locked picks) are visible to fromChoice lookups.
  const values: Record<string, string[]> = { ...character.choices };

  const addEffects = (effects: Effect[] | undefined, origin: Origin, owner: string) => {
    for (const effect of effects ?? []) out.effects.push({ effect, origin, owner });
  };

  /** Level used to scope minLevel: class level for class origins, character level otherwise. */
  const scopeLevel = (origin: Origin) =>
    origin.classId && (origin.kind === 'class' || origin.kind === 'subclass')
      ? (classLevels.get(origin.classId) ?? 0)
      : totalLevel;

  const countFor = (choice: Choice, origin: Origin): number => {
    if ('countKey' in choice && choice.countKey && origin.classId) {
      const cls = reg.classes.get(origin.classId);
      const row = cls?.levels[(classLevels.get(origin.classId) ?? 1) - 1];
      const v = row?.extras[choice.countKey];
      if (typeof v === 'number') return v;
    }
    if (choice.kind === 'feat' || choice.kind === 'size') return 1;
    if (choice.kind === 'asi') return choice.points;
    return choice.count;
  };

  const addChoices = (
    choices: Choice[] | undefined,
    owner: string,
    origin: Origin,
    presets?: Record<string, string[]>,
  ) => {
    for (const choice of choices ?? []) {
      if (choice.minLevel && scopeLevel(origin) < choice.minLevel) continue;
      const key = `${owner}:${choice.id}`;
      const preset = presets?.[choice.id];
      const picked = preset ?? values[key] ?? [];
      if (preset) values[key] = preset;
      out.choices.push({
        key,
        choice,
        count: countFor(choice, origin),
        values: picked,
        origin,
        owner,
        ...(preset ? { locked: true } : {}),
      });
      applyChoice(choice, key, picked, owner, origin);
    }
  };

  const applyChoice = (choice: Choice, key: string, picked: string[], owner: string, origin: Origin) => {
    switch (choice.kind) {
      case 'skill':
        for (const v of picked)
          out.effects.push({
            effect: { type: 'skill', skill: v as never, ...(choice.expertise ? { expertise: true } : {}) },
            origin,
            owner,
          });
        break;
      case 'skillOrTool':
        for (const v of picked) {
          const [kind, id] = v.split(':');
          const effect: Effect = kind === 'skill' ? { type: 'skill', skill: id as never } : { type: 'tool', tool: id };
          out.effects.push({ effect, origin, owner });
        }
        break;
      case 'tool':
        for (const v of picked) out.effects.push({ effect: { type: 'tool', tool: v }, origin, owner });
        break;
      case 'language':
        for (const v of picked) out.effects.push({ effect: { type: 'language', language: v }, origin, owner });
        break;
      case 'size':
        if (picked[0]) out.effects.push({ effect: { type: 'size', size: picked[0] }, origin, owner });
        break;
      case 'asi':
        for (const v of picked)
          if ((ABILITIES as readonly string[]).includes(v))
            out.effects.push({ effect: { type: 'abilityBonus', ability: v as Ability, value: 1, max: choice.max }, origin, owner });
        break;
      case 'spell': {
        const ability =
          choice.ability && typeof choice.ability === 'object'
            ? (resolveRef(choice.ability.fromChoice, owner, values)[0] as Ability | undefined)
            : choice.ability;
        for (const v of picked)
          out.effects.push({ effect: { type: 'spell', spell: v, ...(ability ? { ability } : {}) }, origin, owner });
        break;
      }
      case 'option':
        for (const v of picked) {
          const opt = choice.options.find((o) => o.id === v);
          if (!opt) continue;
          addEffects(opt.effects, origin, owner);
          addChoices(opt.choices, `${key}>${opt.id}`, origin);
        }
        break;
      case 'feat':
        if (picked[0]) addFeat(picked[0], key, origin);
        break;
      case 'weaponMastery':
        break; // read directly from choices when building attacks
    }
  };

  const addFeat = (featId: string, sourceKey: string, via: Origin, presets?: Record<string, string[]>) => {
    const feat = reg.feats.get(featId);
    if (!feat) return;
    const owner = `feat@${sourceKey}`;
    const origin: Origin = { kind: 'feat', name: feat.name, classId: via.classId };
    out.feats.push({ key: owner, featId, origin: via });
    out.features.push({ key: owner, name: feat.name, description: feat.description, level: 0, origin });
    addEffects(feat.effects, origin, owner);
    addChoices(feat.choices, owner, { ...origin, kind: 'feat' }, presets);
  };

  const addFeature = (f: Feature, owner: string, origin: Origin) => {
    const key = `${owner}:${f.id}`;
    if (!f.hidden) out.features.push({ key, name: f.name, description: f.description, level: f.level, origin });
    addEffects(f.effects, origin, key);
    addChoices(f.choices, key, origin);
  };

  // Core rules: languages. 2014 languages come from race and background instead.
  if (reg.data.edition === '2024') addChoices([STANDARD_LANGUAGE_CHOICE], 'core', { kind: 'core', name: 'Character' });
  out.effects.push({ effect: { type: 'language', language: 'common' }, origin: { kind: 'core', name: 'Character' }, owner: 'core' });

  // Species and lineage.
  const species = reg.species.get(character.speciesId);
  if (species) {
    const origin: Origin = { kind: 'species', name: species.name };
    addChoices(species.choices, 'species', origin);
    for (const t of species.traits) if (t.level <= Math.max(1, totalLevel)) addFeature(t, 'species', origin);
    const lineage = species.lineages?.find((l) => l.id === character.lineageId);
    if (lineage) {
      const lo: Origin = { kind: 'species', name: `${species.name} (${lineage.name})` };
      for (const t of lineage.traits) {
        // Lineage spell traits are listed at the level they unlock; skip until reached.
        if (t.level > Math.max(1, totalLevel)) continue;
        addFeature(t, 'species', lo);
      }
    }
  }

  // Background.
  const bg = reg.backgrounds.get(character.backgroundId);
  if (bg) {
    const origin: Origin = { kind: 'background', name: bg.name };
    addEffects(bg.effects, origin, 'background');
    addChoices([...(bg.abilities?.length ? [BACKGROUND_ASI(bg.abilities)] : []), ...(bg.choices ?? [])], 'background', origin);
    if (bg.feat) addFeat(bg.feat, 'background', origin, bg.featPresets);
    if (bg.feature) addFeature(bg.feature, 'background', origin);
  }

  // Classes.
  classOrder.forEach((classId, index) => {
    const cls = reg.classes.get(classId);
    if (!cls) return;
    const level = classLevels.get(classId) ?? 0;
    const origin: Origin = { kind: 'class', name: cls.name, classId };
    const owner = `class:${classId}`;
    if (index === 0) {
      addEffects(cls.effects, origin, owner);
      addChoices(
        [{ kind: 'skill', id: 'skills', label: `${cls.name} skills`, count: cls.skillChoice.count, from: cls.skillChoice.from }, ...cls.choices],
        owner,
        origin,
      );
    } else {
      addEffects(cls.multiclass.effects, origin, `${owner}:mc`);
      addChoices(cls.multiclass.choices, `${owner}:mc`, origin);
    }
    for (const f of cls.features) if (f.level <= level) addFeature(f, owner, origin);

    const subclassId = character.subclasses[classId];
    const sub = subclassId ? reg.subclasses.get(subclassId) : undefined;
    if (level >= cls.subclassLevel && !sub) out.needsSubclass.push(classId);
    if (sub && level >= cls.subclassLevel) {
      const so: Origin = { kind: 'subclass', name: sub.name, classId };
      for (const f of sub.features) if (f.level <= level) addFeature(f, `subclass:${sub.id}`, so);
    }
  });

  out.resolved = values;
  return out;
}

/** Choices that still need picks. */
export function pendingChoices(c: Collected): ChoiceInstance[] {
  return c.choices.filter((ch) => !ch.locked && ch.values.length < ch.count);
}
