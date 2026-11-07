// Rules data model. SRD data (data/srd) and user custom content share this shape.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const SKILLS = {
  acrobatics: { name: 'Acrobatics', ability: 'dex' },
  'animal-handling': { name: 'Animal Handling', ability: 'wis' },
  arcana: { name: 'Arcana', ability: 'int' },
  athletics: { name: 'Athletics', ability: 'str' },
  deception: { name: 'Deception', ability: 'cha' },
  history: { name: 'History', ability: 'int' },
  insight: { name: 'Insight', ability: 'wis' },
  intimidation: { name: 'Intimidation', ability: 'cha' },
  investigation: { name: 'Investigation', ability: 'int' },
  medicine: { name: 'Medicine', ability: 'wis' },
  nature: { name: 'Nature', ability: 'int' },
  perception: { name: 'Perception', ability: 'wis' },
  performance: { name: 'Performance', ability: 'cha' },
  persuasion: { name: 'Persuasion', ability: 'cha' },
  religion: { name: 'Religion', ability: 'int' },
  'sleight-of-hand': { name: 'Sleight of Hand', ability: 'dex' },
  stealth: { name: 'Stealth', ability: 'dex' },
  survival: { name: 'Survival', ability: 'wis' },
} as const satisfies Record<string, { name: string; ability: Ability }>;
export type SkillId = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export type Source = 'srd' | 'custom';

export type Edition = '2014' | '2024';
export const EDITIONS: Edition[] = ['2024', '2014'];

export type ArmorTraining = 'light' | 'medium' | 'heavy' | 'shield';

/** Something the character gains. Engine folds these into derived stats. */
export type Effect =
  | { type: 'skill'; skill: SkillId; expertise?: boolean }
  | { type: 'save'; ability: Ability }
  | { type: 'armor'; armor: ArmorTraining }
  /** "simple" | "martial" | a specific weapon item id */
  | { type: 'weapon'; weapon: string }
  | { type: 'tool'; tool: string }
  | { type: 'language'; language: string }
  | { type: 'speed'; value: number }
  /** valueKey reads the amount from the owning class's level-table extras. */
  | { type: 'speedBonus'; value: number; valueKey?: string; unarmored?: boolean; notHeavy?: boolean }
  /** extend: if you already have Darkvision, its range increases by this much instead. */
  | { type: 'darkvision'; range: number; extend?: number }
  | { type: 'resistance'; damage: string }
  /** Per character level, or per level in classId when set. */
  | { type: 'hpPerLevel'; value: number; classId?: string }
  | { type: 'cantripBonus'; classId: string; value: number }
  /** Flat Hit Point maximum increase (e.g. Boon of Fortitude). */
  | { type: 'hpBonus'; value: number }
  /**
   * Trackable uses shown under Resources. max is a number, the Proficiency Bonus ("pb"),
   * or an ability modifier (minimum 1). The same id at a higher minLevel replaces the lower one.
   */
  | {
      type: 'resource';
      id: string;
      label: string;
      max: number | 'pb' | { ability: Ability };
      reset: 'short' | 'long';
      minLevel?: number;
    }
  | { type: 'initiativeProf' }
  /** Jack of All Trades: half proficiency on ability checks without proficiency. */
  | { type: 'halfProficiency' }
  /** Unarmored Defense style formula: base + ability mods. */
  | { type: 'acFormula'; name: string; base: number; abilities: Ability[]; allowShield: boolean }
  | { type: 'acBonus'; value: number; whileArmored?: boolean; whileDualWielding?: boolean }
  | { type: 'rangedAttackBonus'; value: number }
  /** Always-prepared / known spell. minLevel is class level (class features) or character level (traits). */
  | { type: 'spell'; spell: string; ability?: Ability | { fromChoice: string }; minLevel?: number; note?: string }
  | { type: 'abilityBonus'; ability: Ability; value: number; max?: number }
  | { type: 'size'; size: string }
  /** Climb/swim/fly/burrow speed: a number, or "walk" for equal to walking speed. */
  | { type: 'speedMode'; mode: 'climb' | 'swim' | 'fly' | 'burrow'; value: number | 'walk'; hover?: boolean }
  | { type: 'sense'; sense: 'blindsight' | 'tremorsense' | 'truesight'; range: number }
  /** Flat initiative bonus and/or an ability modifier added to initiative. */
  | { type: 'initiativeBonus'; value?: number; ability?: Ability }
  | { type: 'passiveBonus'; skill: 'perception' | 'investigation' | 'insight'; value: number }
  /** Raises the Dex cap of medium armor (Medium Armor Master). */
  | { type: 'armorDexMax'; armor: 'medium'; value: number }
  /** Weapon damage bonus: Dueling (one-handed melee, no other weapon), Thrown Weapon Fighting, or all. */
  | { type: 'damageBonus'; value: number; when: 'oneHandedMelee' | 'thrown' | 'all' }
  | { type: 'saveBonus'; value: number }
  /** AC can't be lower than this (Barkskin). */
  | { type: 'acFloor'; value: number }
  /** Sets an ability score to at least this value (Gauntlets of Ogre Power). */
  | { type: 'abilitySet'; ability: Ability; value: number }
  /** Extra die on d20 rolls (Bless, Guidance); negative dice like "-1d4" for Bane. */
  | { type: 'rollBonus'; applies: 'attack' | 'save' | 'check'; dice: string }
  /**
   * Optional extra damage offered on attacks: fixed dice, dice from the class table (valueKey),
   * or per spell-slot level (Divine Smite 2014). melee/finesseOrRanged/strMelee restrict which attacks.
   */
  | {
      type: 'damageRider';
      id: string;
      label: string;
      dice?: string;
      valueKey?: string;
      perSlot?: { base: string; perLevel: string };
      when?: 'any' | 'finesseOrRanged' | 'strMelee' | 'melee';
      auto?: boolean;
      /** Class level (or character level) from which this version applies; the highest eligible one wins. */
      minLevel?: number;
    }
  /** A state the player switches on (Rage, Bless...). Its effects apply only while active. */
  | { type: 'toggle'; id: string; label: string; effects: Effect[]; concentration?: boolean; resource?: string; description?: string }

export type FeatType = 'origin' | 'general' | 'fighting-style' | 'epic-boon';

export interface ChoiceOption {
  id: string;
  name: string;
  description?: string;
  effects?: Effect[];
  /** Further choices unlocked by picking this option. */
  choices?: Choice[];
  prerequisite?: string;
}

interface ChoiceBase {
  /** Unique within its owner (feature, trait, feat...). */
  id: string;
  label: string;
  /** Minimum class level (for class features) or character level (others) before the choice opens. */
  minLevel?: number;
}

export type Choice =
  | (ChoiceBase & { kind: 'skill'; count: number; from: SkillId[] | 'any'; expertise?: boolean })
  | (ChoiceBase & { kind: 'skillOrTool'; count: number })
  | (ChoiceBase & { kind: 'tool'; count: number; from: string[] | 'any' })
  | (ChoiceBase & { kind: 'language'; count: number; from: string[] | 'any' })
  | (ChoiceBase & { kind: 'feat'; featTypes: FeatType[] })
  /** Values are ability ids, one per point: ["str","str","dex"] = +2 STR +1 DEX. */
  | (ChoiceBase & {
      kind: 'asi';
      points: number;
      from: Ability[] | 'any';
      maxPerAbility: number;
      max: number;
      /** Allowed point splits, e.g. [[2,1],[1,1,1]]. Omit for any split within maxPerAbility. */
      patterns?: number[][];
    })
  | (ChoiceBase & {
      kind: 'spell';
      count: number;
      /** Exact spell level (0 = cantrip). Ignored when upToSlotLevel is set. */
      level?: number;
      /** Cantrips or any level the owning class has spell slots for. */
      upToSlotLevel?: boolean;
      /** Bounds applied together with upToSlotLevel (e.g. Savant: levels 1–2). */
      minSpellLevel?: number;
      maxSpellLevel?: number;
      /** Class spell lists to draw from, or the id of a sibling 'option' choice whose value names the list. */
      lists: string[] | { fromChoice: string };
      /** How the picked spells are cast. */
      ability?: Ability | { fromChoice: string };
      /** Restrict to these schools (e.g. ["Divination", "Enchantment"]). */
      schools?: string[];
    })
  | (ChoiceBase & { kind: 'weaponMastery'; count: number; countKey?: string })
  | (ChoiceBase & { kind: 'option'; count: number; options: ChoiceOption[]; countKey?: string })
  | (ChoiceBase & { kind: 'size'; options: string[] });

export interface Feature {
  id: string;
  name: string;
  /** Class level (class/subclass features) or character level (species traits). */
  level: number;
  description: string;
  effects?: Effect[];
  choices?: Choice[];
  /** Hide from sheet (e.g. placeholder "Subclass" feature rows). */
  hidden?: boolean;
}

export interface EquipmentBundle {
  label: string;
  items: { item: string; name: string; count: number; choose?: EquipmentPick }[];
  gp: number;
}

/** "A martial weapon of your choice": `count` items picked from `options`. */
export interface EquipmentPick {
  /** Item ids to pick from. */
  options: string[];
  /** Singular, lowercase: "martial weapon". */
  label: string;
}

export interface LevelRow {
  level: number;
  profBonus: number;
  features: string[];
  /** Class-specific columns (rage_count, sneak_attack_dice, weapon_mastery...). */
  extras: Record<string, number | string>;
  cantrips?: number;
  prepared?: number;
  /** slots[0] = level 1 slots ... slots[8] = level 9. */
  slots?: number[];
}

export type CasterProgression = 'full' | 'half' | 'third' | 'pact';

export interface ClassDef {
  id: string;
  name: string;
  source: Source;
  description?: string;
  hitDie: number;
  primaryAbilities: Ability[];
  /** True when every primary ability matters ("and"); otherwise any one ("or"). */
  primaryAbilitiesAll?: boolean;
  saves: Ability[];
  skillChoice: { count: number; from: SkillId[] | 'any' };
  /** Starting proficiencies (taken at character level 1). */
  effects: Effect[];
  /** Extra starting choices (tools, instruments...). */
  choices: Choice[];
  startingEquipment: EquipmentBundle[];
  /** 2014: several independent "(a) or (b)" picks; each inner array is one pick. */
  startingEquipmentGroups?: EquipmentBundle[][];
  multiclass: {
    /** Each inner array is OR, outer is AND. */
    prerequisites: { ability: Ability; min: number }[][];
    effects: Effect[];
    choices: Choice[];
  };
  spellcasting?: {
    ability: Ability;
    progression: CasterProgression;
    /** 2014 Bard/Sorcerer/Ranger/Warlock: the table's number is spells known, not prepared. */
    spellsKnown?: boolean;
    /** 2014 Cleric/Druid/Wizard (1) and Paladin (2): prepared = class level / divisor + ability mod (min 1). */
    preparedFormula?: { levelDivisor: 1 | 2 };
  };
  subclassLevel: number;
  levels: LevelRow[];
  features: Feature[];
}

/** Marks content that came from a content pack and whether the user has checked it. */
export interface PackInfo {
  pack?: string;
  unverified?: boolean;
  /** User replaced the pack's summary text (kept when the pack is updated). */
  edited?: boolean;
  /** Rule set the custom entry belongs to (default 2024). */
  edition?: Edition;
}

/** Subclass-granted spellcasting (Eldritch Knight, Arcane Trickster): one row per class level. */
export interface SubclassSpellcasting {
  ability: Ability;
  /** Spell list to choose from (a class id, e.g. "wizard"). */
  list: string;
  levels: { cantrips: number; prepared: number; slots: number[] }[];
}

export interface SubclassDef extends PackInfo {
  id: string;
  name: string;
  source: Source;
  classId: string;
  summary?: string;
  description?: string;
  spellcasting?: SubclassSpellcasting;
  features: Feature[];
}

export interface SpeciesDef extends PackInfo {
  id: string;
  name: string;
  source: Source;
  description?: string;
  creatureType: string;
  size: string;
  sizeOptions?: string[];
  speed: number;
  traits: Feature[];
  /** Species-level choices (size, lineage spellcasting ability...). Keyed "species:<id>". */
  choices?: Choice[];
  lineageLabel?: string;
  lineages?: { id: string; name: string; description?: string; traits: Feature[] }[];
}

export interface BackgroundDef extends PackInfo {
  id: string;
  name: string;
  source: Source;
  description?: string;
  /** 2024 only: the three abilities the background can raise. */
  abilities?: Ability[];
  /** 2024 only: the Origin feat granted. */
  feat?: string;
  /** 2014: the background's feature (e.g. Shelter of the Faithful). */
  feature?: Feature;
  /** Pre-resolved choices on the granted feat, e.g. Magic Initiate list = cleric. */
  featPresets?: Record<string, string[]>;
  effects: Effect[];
  choices?: Choice[];
  equipment: EquipmentBundle[];
  equipmentGroups?: EquipmentBundle[][];
}

export interface FeatDef extends PackInfo {
  id: string;
  name: string;
  source: Source;
  type: FeatType;
  description: string;
  prerequisite?: { minLevel?: number; text?: string };
  repeatable: boolean;
  effects?: Effect[];
  choices?: Choice[];
}

export interface SpellDef extends PackInfo {
  id: string;
  name: string;
  source: Source;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  higherLevel?: string;
  attackType?: string;
  save?: Ability;
  /** Damage dice by slot level (leveled spells) or character level (cantrips). */
  damage?: { type?: string; atSlot?: Record<string, string>; atCharLevel?: Record<string, string> };
  /** Healing dice by slot level; "MOD" in the string means + spellcasting modifier. */
  heal?: { atSlot: Record<string, string> };
}

export interface WeaponStats {
  category: 'simple' | 'martial';
  kind: 'melee' | 'ranged';
  damage: string;
  damageType: string;
  versatile?: string;
  properties: string[];
  mastery?: string;
  range?: { normal: number; long?: number };
}

export interface ArmorStats {
  type: 'light' | 'medium' | 'heavy' | 'shield';
  base: number;
  /** null = add full Dex, 0 = no Dex, n = Dex capped at n. */
  dexMax: number | null;
  strMin?: number;
  stealthDisadvantage?: boolean;
}

export interface ItemDef extends Pick<PackInfo, 'edition'> {
  id: string;
  name: string;
  source: Source;
  category: 'weapon' | 'armor' | 'gear' | 'tool' | 'pack' | 'ammunition' | 'focus' | 'magic' | 'other';
  cost?: string;
  weight?: number;
  description?: string;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  magic?: MagicStats;
  contents?: { item: string; count: number }[];
}

export interface MagicStats {
  rarity: string;
  attunement: boolean;
  /** Generic "+1 weapon/armor" items that need a base item when added. */
  variantOf?: 'weapon' | 'armor' | 'shield';
  bonus?: { attack?: number; damage?: number; ac?: number; save?: number };
  abilitySet?: { ability: Ability; value: number };
  charges?: number;
  /** Granted while equipped (and attuned, when required): resistance, speed, a spell… */
  effects?: Effect[];
}

export type KeywordKind =
  | 'condition'
  | 'rule'
  | 'action'
  | 'damage'
  | 'weapon-property'
  | 'mastery'
  | 'spell';

export interface KeywordDef extends Pick<PackInfo, 'edition'> {
  id: string;
  term: string;
  aliases?: string[];
  kind: KeywordKind;
  description: string;
  source: Source;
}

export interface RulesData {
  edition: Edition;
  classes: ClassDef[];
  subclasses: SubclassDef[];
  species: SpeciesDef[];
  backgrounds: BackgroundDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  items: ItemDef[];
  keywords: KeywordDef[];
  languages: { id: string; name: string; rare: boolean }[];
  tools: { id: string; name: string; group?: string }[];
}
