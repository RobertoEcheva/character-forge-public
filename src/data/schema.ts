import { z } from 'zod';
import type {
  BackgroundDef,
  Choice,
  ChoiceOption,
  ClassDef,
  Effect,
  FeatDef,
  Feature,
  ItemDef,
  KeywordDef,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from '../types/rules';
import { ABILITIES, SKILL_IDS } from '../types/rules';
import type { CreatureDef } from '../types/creature';
import { parseDice } from '../engine/dice';

const ability = z.enum(ABILITIES);
const skill = z.enum(SKILL_IDS as [string, ...string[]]);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes');
const source = z.enum(['srd', 'custom']);
const fromChoice = z.object({ fromChoice: z.string() });
const edition = z.enum(['2014', '2024']);
const packInfo = {
  pack: z.string().optional(),
  unverified: z.boolean().optional(),
  edited: z.boolean().optional(),
  edition: edition.optional(),
};

export const effectSchema: z.ZodType<Effect> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.literal('skill'), skill: skill, expertise: z.boolean().optional() }),
  z.object({ type: z.literal('save'), ability }),
  z.object({ type: z.literal('armor'), armor: z.enum(['light', 'medium', 'heavy', 'shield']) }),
  z.object({ type: z.literal('weapon'), weapon: z.string() }),
  z.object({ type: z.literal('tool'), tool: z.string() }),
  z.object({ type: z.literal('language'), language: z.string() }),
  z.object({ type: z.literal('speed'), value: z.number() }),
  z.object({
    type: z.literal('speedBonus'),
    value: z.number(),
    valueKey: z.string().optional(),
    unarmored: z.boolean().optional(),
    notHeavy: z.boolean().optional(),
  }),
  z.object({ type: z.literal('darkvision'), range: z.number(), extend: z.number().optional() }),
  z.object({ type: z.literal('resistance'), damage: z.string() }),
  z.object({ type: z.literal('hpPerLevel'), value: z.number(), classId: z.string().optional() }),
  z.object({ type: z.literal('cantripBonus'), classId: z.string(), value: z.number() }),
  z.object({ type: z.literal('hpBonus'), value: z.number() }),
  z.object({
    type: z.literal('resource'),
    id: z.string().min(1),
    label: z.string().min(1),
    max: z.union([z.number().int().min(1), z.literal('pb'), z.object({ ability })]),
    reset: z.enum(['short', 'long']),
    minLevel: z.number().int().optional(),
  }),
  z.object({ type: z.literal('initiativeProf') }),
  z.object({ type: z.literal('halfProficiency') }),
  z.object({
    type: z.literal('acFormula'),
    name: z.string(),
    base: z.number(),
    abilities: z.array(ability),
    allowShield: z.boolean(),
  }),
  z.object({ type: z.literal('acBonus'), value: z.number(), whileArmored: z.boolean().optional(), whileDualWielding: z.boolean().optional() }),
  z.object({ type: z.literal('rangedAttackBonus'), value: z.number() }),
  z.object({
    type: z.literal('spell'),
    spell: z.string(),
    ability: z.union([ability, fromChoice]).optional(),
    minLevel: z.number().optional(),
    note: z.string().optional(),
  }),
  z.object({ type: z.literal('abilityBonus'), ability, value: z.number(), max: z.number().optional() }),
  z.object({ type: z.literal('size'), size: z.string() }),
  z.object({
    type: z.literal('speedMode'),
    mode: z.enum(['climb', 'swim', 'fly', 'burrow']),
    value: z.union([z.number(), z.literal('walk')]),
    hover: z.boolean().optional(),
  }),
  z.object({ type: z.literal('sense'), sense: z.enum(['blindsight', 'tremorsense', 'truesight']), range: z.number() }),
  z.object({ type: z.literal('initiativeBonus'), value: z.number().optional(), ability: ability.optional() }),
  z.object({ type: z.literal('passiveBonus'), skill: z.enum(['perception', 'investigation', 'insight']), value: z.number() }),
  z.object({ type: z.literal('armorDexMax'), armor: z.literal('medium'), value: z.number() }),
  z.object({ type: z.literal('damageBonus'), value: z.number(), when: z.enum(['oneHandedMelee', 'thrown', 'all']) }),
  z.object({ type: z.literal('saveBonus'), value: z.number() }),
  z.object({ type: z.literal('acFloor'), value: z.number() }),
  z.object({ type: z.literal('abilitySet'), ability, value: z.number() }),
  z.object({ type: z.literal('rollBonus'), applies: z.enum(['attack', 'save', 'check']), dice: z.string() }),
  z.object({
    type: z.literal('damageRider'),
    id: z.string(),
    label: z.string(),
    dice: z.string().optional(),
    valueKey: z.string().optional(),
    perSlot: z.object({ base: z.string(), perLevel: z.string() }).optional(),
    when: z.enum(['any', 'finesseOrRanged', 'strMelee', 'melee']).optional(),
    auto: z.boolean().optional(),
    minLevel: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('toggle'),
    id: z.string(),
    label: z.string(),
    effects: z.array(effectSchema),
    concentration: z.boolean().optional(),
    resource: z.string().optional(),
    description: z.string().optional(),
  }),
])) as z.ZodType<Effect>;

const choiceBase = { id: z.string().min(1), label: z.string().min(1), minLevel: z.number().int().optional() };
const count = z.number().int().min(1);

export const choiceOptionSchema: z.ZodType<ChoiceOption> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    effects: z.array(effectSchema).optional(),
    choices: z.array(choiceSchema).optional(),
    prerequisite: z.string().optional(),
  }),
);

export const choiceSchema: z.ZodType<Choice> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ ...choiceBase, kind: z.literal('skill'), count, from: z.union([z.array(skill), z.literal('any')]), expertise: z.boolean().optional() }),
    z.object({ ...choiceBase, kind: z.literal('skillOrTool'), count }),
    z.object({ ...choiceBase, kind: z.literal('tool'), count, from: z.union([z.array(z.string()), z.literal('any')]) }),
    z.object({ ...choiceBase, kind: z.literal('language'), count, from: z.union([z.array(z.string()), z.literal('any')]) }),
    z.object({ ...choiceBase, kind: z.literal('feat'), featTypes: z.array(z.enum(['origin', 'general', 'fighting-style', 'epic-boon'])) }),
    z.object({
      ...choiceBase,
      kind: z.literal('asi'),
      points: count,
      from: z.union([z.array(ability), z.literal('any')]),
      maxPerAbility: z.number().int(),
      max: z.number().int(),
      patterns: z.array(z.array(z.number().int())).optional(),
    }),
    z.object({
      ...choiceBase,
      kind: z.literal('spell'),
      count,
      level: z.number().int().min(0).max(9).optional(),
      upToSlotLevel: z.boolean().optional(),
      minSpellLevel: z.number().int().min(0).max(9).optional(),
      maxSpellLevel: z.number().int().min(0).max(9).optional(),
      lists: z.union([z.array(z.string()), fromChoice]),
      ability: z.union([ability, fromChoice]).optional(),
      schools: z.array(z.string()).optional(),
    }),
    z.object({ ...choiceBase, kind: z.literal('weaponMastery'), count, countKey: z.string().optional() }),
    z.object({ ...choiceBase, kind: z.literal('option'), count, options: z.array(choiceOptionSchema), countKey: z.string().optional() }),
    z.object({ ...choiceBase, kind: z.literal('size'), options: z.array(z.string()) }),
  ]),
) as z.ZodType<Choice>;

export const featureSchema: z.ZodType<Feature> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(20),
  description: z.string(),
  effects: z.array(effectSchema).optional(),
  choices: z.array(choiceSchema).optional(),
  hidden: z.boolean().optional(),
});

const bundle = z.object({
  label: z.string(),
  items: z.array(
    z.object({ item: z.string(), name: z.string(), count: z.number(), choose: z.object({ options: z.array(z.string()), label: z.string() }).optional() }),
  ),
  gp: z.number(),
});

export const classSchema: z.ZodType<ClassDef> = z.object({
  id,
  name: z.string().min(1),
  source,
  description: z.string().optional(),
  hitDie: z.number().int().min(4).max(12),
  primaryAbilities: z.array(ability),
  primaryAbilitiesAll: z.boolean().optional(),
  saves: z.array(ability),
  skillChoice: z.object({ count: z.number().int(), from: z.union([z.array(skill), z.literal('any')]) }),
  effects: z.array(effectSchema),
  choices: z.array(choiceSchema),
  startingEquipment: z.array(bundle),
  startingEquipmentGroups: z.array(z.array(bundle)).optional(),
  multiclass: z.object({
    prerequisites: z.array(z.array(z.object({ ability, min: z.number() }))),
    effects: z.array(effectSchema),
    choices: z.array(choiceSchema),
  }),
  spellcasting: z
    .object({
      ability,
      progression: z.enum(['full', 'half', 'third', 'pact']),
      spellsKnown: z.boolean().optional(),
      preparedFormula: z.object({ levelDivisor: z.union([z.literal(1), z.literal(2)]) }).optional(),
    })
    .optional(),
  subclassLevel: z.number().int(),
  levels: z
    .array(
      z.object({
        level: z.number().int(),
        profBonus: z.number().int(),
        features: z.array(z.string()),
        extras: z.record(z.union([z.number(), z.string()])),
        cantrips: z.number().optional(),
        prepared: z.number().optional(),
        slots: z.array(z.number()).length(9).optional(),
      }),
    )
    .length(20),
  features: z.array(featureSchema),
}) as z.ZodType<ClassDef>;

export const subclassSchema: z.ZodType<SubclassDef> = z.object({
  ...packInfo,
  id,
  name: z.string().min(1),
  source,
  classId: z.string().min(1),
  summary: z.string().optional(),
  spellcasting: z
    .object({
      ability,
      list: z.string().min(1),
      levels: z.array(z.object({ cantrips: z.number().int(), prepared: z.number().int(), slots: z.array(z.number().int()).length(9) })).length(20),
    })
    .optional(),
  description: z.string().optional(),
  features: z.array(featureSchema),
});

export const speciesSchema: z.ZodType<SpeciesDef> = z.object({
  ...packInfo,
  id,
  name: z.string().min(1),
  source,
  description: z.string().optional(),
  creatureType: z.string(),
  size: z.string(),
  sizeOptions: z.array(z.string()).optional(),
  speed: z.number().int(),
  traits: z.array(featureSchema),
  choices: z.array(choiceSchema).optional(),
  lineageLabel: z.string().optional(),
  lineages: z
    .array(z.object({ id, name: z.string(), description: z.string().optional(), traits: z.array(featureSchema) }))
    .optional(),
});

export const backgroundSchema: z.ZodType<BackgroundDef> = z.object({
  ...packInfo,
  id,
  name: z.string().min(1),
  source,
  description: z.string().optional(),
  abilities: z.array(ability).length(3).optional(),
  feat: z.string().min(1).optional(),
  feature: featureSchema.optional(),
  featPresets: z.record(z.array(z.string())).optional(),
  effects: z.array(effectSchema),
  choices: z.array(choiceSchema).optional(),
  equipment: z.array(bundle),
  equipmentGroups: z.array(z.array(bundle)).optional(),
});

export const featSchema: z.ZodType<FeatDef> = z.object({
  ...packInfo,
  id,
  name: z.string().min(1),
  source,
  type: z.enum(['origin', 'general', 'fighting-style', 'epic-boon']),
  description: z.string(),
  prerequisite: z.object({ minLevel: z.number().optional(), text: z.string().optional() }).optional(),
  repeatable: z.boolean(),
  effects: z.array(effectSchema).optional(),
  choices: z.array(choiceSchema).optional(),
});

export const spellSchema: z.ZodType<SpellDef> = z.object({
  ...packInfo,
  id,
  name: z.string().min(1),
  source,
  level: z.number().int().min(0).max(9),
  school: z.string(),
  classes: z.array(z.string()),
  castingTime: z.string(),
  range: z.string(),
  components: z.array(z.string()),
  material: z.string().optional(),
  duration: z.string(),
  concentration: z.boolean(),
  ritual: z.boolean(),
  description: z.string(),
  higherLevel: z.string().optional(),
  attackType: z.string().optional(),
  save: ability.optional(),
  damage: z
    .object({ type: z.string().optional(), atSlot: z.record(z.string()).optional(), atCharLevel: z.record(z.string()).optional() })
    .optional(),
  heal: z.object({ atSlot: z.record(z.string()) }).optional(),
});

export const itemSchema: z.ZodType<ItemDef> = z.object({
  id,
  edition: edition.optional(),
  name: z.string().min(1),
  source,
  category: z.enum(['weapon', 'armor', 'gear', 'tool', 'pack', 'ammunition', 'focus', 'magic', 'other']),
  cost: z.string().optional(),
  weight: z.number().optional(),
  description: z.string().optional(),
  weapon: z
    .object({
      category: z.enum(['simple', 'martial']),
      kind: z.enum(['melee', 'ranged']),
      damage: z.string(),
      damageType: z.string(),
      versatile: z.string().optional(),
      properties: z.array(z.string()),
      mastery: z.string().optional(),
      range: z.object({ normal: z.number(), long: z.number().optional() }).optional(),
    })
    .optional(),
  armor: z
    .object({
      type: z.enum(['light', 'medium', 'heavy', 'shield']),
      base: z.number(),
      dexMax: z.number().nullable(),
      strMin: z.number().optional(),
      stealthDisadvantage: z.boolean().optional(),
    })
    .optional(),
  contents: z.array(z.object({ item: z.string(), count: z.number() })).optional(),
  magic: z
    .object({
      rarity: z.string(),
      attunement: z.boolean(),
      variantOf: z.enum(['weapon', 'armor', 'shield']).optional(),
      bonus: z
        .object({ attack: z.number().optional(), damage: z.number().optional(), ac: z.number().optional(), save: z.number().optional() })
        .optional(),
      abilitySet: z.object({ ability, value: z.number() }).optional(),
      charges: z.number().optional(),
      effects: z.array(effectSchema).optional(),
    })
    .optional(),
});

export const keywordSchema: z.ZodType<KeywordDef> = z.object({
  id: z.string().min(1),
  edition: edition.optional(),
  term: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  kind: z.enum(['condition', 'rule', 'action', 'damage', 'weapon-property', 'mastery', 'spell']),
  description: z.string(),
  source,
});

const dice = z.string().refine((s) => parseDice(s) !== null, 'not a dice expression (e.g. 1d8+2)');

export const creatureSchema: z.ZodType<CreatureDef> = z.object({
  id,
  name: z.string().min(1),
  source: source.optional(),
  ...packInfo,
  size: z.enum(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']),
  type: z.string().min(1),
  cr: z.number().min(0).max(30),
  ac: z.number().int().min(1).max(40),
  hp: z.number().int().min(1),
  hitDice: z.string(),
  speed: z.record(z.string()),
  abilities: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),
  senses: z.string(),
  traits: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  actions: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      attack: z.number().int().optional(),
      damage: dice.optional(),
      damageType: z.string().optional(),
    }),
  ),
});

export const customContentSchema = z.object({
  classes: z.array(classSchema).optional(),
  subclasses: z.array(subclassSchema).optional(),
  species: z.array(speciesSchema).optional(),
  backgrounds: z.array(backgroundSchema).optional(),
  feats: z.array(featSchema).optional(),
  spells: z.array(spellSchema).optional(),
  items: z.array(itemSchema).optional(),
  keywords: z.array(keywordSchema).optional(),
  creatures: z.array(creatureSchema).optional(),
  packs: z
    .array(z.object({ id, name: z.string().min(1), description: z.string().optional(), edition }))
    .optional(),
});
