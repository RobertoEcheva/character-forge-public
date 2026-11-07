import type { Ability, Edition } from './rules';

export const CHARACTER_VERSION = 1;

/** Heraldic colours: two metals and five colours. */
export type Tincture = 'argent' | 'or' | 'gules' | 'azure' | 'vert' | 'purpure' | 'sable';
export type Division = 'plain' | 'per-pale' | 'per-fess' | 'per-bend' | 'quarterly' | 'chevron' | 'chief';
export type Charge = 'none' | 'mullet' | 'lozenge' | 'roundel' | 'cross' | 'crescent';

/** A simple coat of arms: a field (optionally divided) with one charge on it. */
export interface Blazon {
  field: Tincture;
  division: Division;
  /** Second tincture of the division (ignored for plain). */
  second: Tincture;
  charge: Charge;
  chargeTincture: Tincture;
}

/** One entry per character level gained, in order. */
export interface LevelEntry {
  classId: string;
  /** HP gained at this level before Con; level 1 always takes the max die. */
  hpGain: number;
  /** True when hpGain came from a roll rather than the fixed value. */
  rolled?: boolean;
  /** Spells learned and dropped while gaining this level. Absent on levels gained before this was tracked. */
  spells?: { added: string[]; removed: string[] };
}

export interface InventoryItem {
  uid: string;
  /** Rules item id; absent for free-form items. */
  itemId?: string;
  name: string;
  qty: number;
  equipped?: boolean;
  notes?: string;
  /** Magic item applied on top of the base item (e.g. "weapon-1" on a longsword). */
  magicId?: string;
  attuned?: boolean;
  chargesUsed?: number;
}

export interface Companion {
  uid: string;
  creatureId: string;
  name: string;
  kind: 'familiar' | 'companion' | 'summon';
  hp: number | null;
  notes?: string;
}

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface PlayState {
  hp: number | null; // null = full
  tempHp: number;
  hitDiceUsed: Record<string, number>; // keyed by die size, e.g. "d10"
  slotsUsed: number[]; // index 0 = level 1
  pactSlotsUsed: number;
  deathSaves: { successes: number; failures: number };
  conditions: string[];
  exhaustion: number;
  heroicInspiration: boolean;
  /** Free-form counters keyed by label (Rage, Second Wind...). */
  counters: Record<string, number>;
  /** Toggle ids currently switched on (Rage, Bless...). */
  active: string[];
  /** Wild Shape: creature id and its current HP. */
  wildShape?: { creatureId: string; hp: number; tempHp: number } | null;
}

export interface Character {
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Rules edition; chosen at creation and fixed once a class is picked. */
  ruleset: Edition;

  speciesId: string;
  lineageId?: string;
  backgroundId: string;
  baseAbilities: Record<Ability, number>;

  /** Levels gained in order; levels[0] is the starting class. */
  levels: LevelEntry[];
  subclasses: Record<string, string>; // classId -> subclassId

  /**
   * Every player decision keyed by choice path, e.g.
   * "class:fighter/skills", "background:acolyte/asi", "class:rogue/feature:rogue-expertise/expertise-1".
   */
  choices: Record<string, string[]>;

  /** classId (or "feat:<path>") -> chosen spells. */
  spells: Record<string, { cantrips: string[]; prepared: string[] }>;

  inventory: InventoryItem[];
  coins: Coins;

  details: {
    /** The character's coat of arms; a default is derived from the id until one is chosen. */
    blazon?: Blazon;
    alignment: string;
    appearance: string;
    backstory: string;
    personality: string;
    notes: string;
  };

  play: PlayState;
  companions: Companion[];
}

export function emptyPlayState(): PlayState {
  return {
    hp: null,
    tempHp: 0,
    hitDiceUsed: {},
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactSlotsUsed: 0,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    exhaustion: 0,
    heroicInspiration: false,
    counters: {},
    active: [],
    wildShape: null,
  };
}

export function newCharacter(id: string): Character {
  const now = new Date().toISOString();
  return {
    version: CHARACTER_VERSION,
    id,
    name: '',
    createdAt: now,
    updatedAt: now,
    ruleset: '2024',
    speciesId: '',
    backgroundId: '',
    baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    levels: [],
    subclasses: {},
    choices: {},
    spells: {},
    inventory: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    details: { alignment: '', appearance: '', backstory: '', personality: '', notes: '' },
    play: emptyPlayState(),
    companions: [],
  };
}
