import type { Registry } from '../data/registry';
import type { Character, InventoryItem } from '../types/character';
import { emptyPlayState } from '../types/character';
import type { EquipmentBundle } from '../types/rules';
import { collect } from './collect';
import type { Rng } from './dice';
import { defaultRng } from './dice';
import { deriveSheet, type Sheet } from './derive';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const fixedHp = (hitDie: number) => hitDie / 2 + 1;

/** Set a choice; clears picks nested under the old value (option sub-choices, feat choices). */
export function setChoice(char: Character, key: string, values: string[]): Character {
  const choices: Record<string, string[]> = {};
  const removed = (char.choices[key] ?? []).filter((v) => !values.includes(v));
  for (const [k, v] of Object.entries(char.choices)) {
    const nestedUnderRemoved = removed.some((r) => k.startsWith(`${key}>${r}:`));
    const featChanged = k.startsWith(`feat@${key}:`) && removed.length > 0;
    if (!nestedUnderRemoved && !featChanged) choices[k] = v;
  }
  choices[key] = values;
  return { ...char, choices };
}

/** Prerequisites to take a level in a class you don't have yet (2024: also meet your current classes'). */
export function multiclassBlockers(char: Character, classId: string, sheet: Sheet, reg: Registry): string[] {
  const existing = new Set(char.levels.map((l) => l.classId));
  if (existing.has(classId) || !char.levels.length) return [];
  const problems: string[] = [];
  for (const id of [...existing, classId]) {
    const cls = reg.classes.get(id);
    if (!cls) continue;
    for (const group of cls.multiclass.prerequisites) {
      const ok = group.some((p) => sheet.abilities[p.ability].score >= p.min);
      if (!ok) problems.push(`${cls.name}: ${group.map((p) => `${p.ability.toUpperCase()} ${p.min}`).join(' or ')}`);
    }
  }
  return problems;
}

export function addLevel(
  char: Character,
  classId: string,
  reg: Registry,
  mode: 'fixed' | 'roll' = 'fixed',
  rng: Rng = defaultRng,
): Character {
  const hd = reg.classes.get(classId)?.hitDie ?? 8;
  const first = char.levels.length === 0;
  const hpGain = first ? hd : mode === 'roll' ? rng(hd) : fixedHp(hd);
  const next: Character = {
    ...char,
    levels: [
      ...char.levels,
      // Levels after the first record the spells learned while leveling (shown in the level history).
      { classId, hpGain, ...(mode === 'roll' && !first ? { rolled: true } : {}), ...(first ? {} : { spells: { added: [], removed: [] } }) },
    ],
  };
  // Healing to full on level-up is not a rule; keep current HP but grow with max.
  return withMaxHpDelta(char, next, reg);
}

/** Hit points for a rolled level: the class's hit die (d8 if the class is unknown). */
export const rollLevelHp = (classId: string, reg: Registry, rng: Rng = defaultRng) => rng(reg.classes.get(classId)?.hitDie ?? 8);

/**
 * Applies an edit to the character's build (choices, subclass, spells, wizard steps) that a component made
 * from the copy it last drew. Build editors never change play state, so the latest play state (HP, slots,
 * Hit Dice, death saves) is kept from `prev`, and current HP then follows any change to max HP.
 */
export function applyBuildEdit(prev: Character, edited: Character, reg: Registry): Character {
  return withMaxHpDelta(prev, { ...edited, play: prev.play }, reg);
}

/** Current hit points, never above the maximum (null in storage means full). */
export const currentHp = (char: Character, sheet: Sheet) => Math.min(char.play.hp ?? sheet.maxHp, sheet.maxHp);

/**
 * Moves current HP by however much max HP changed between `prev` and `next` (level up, Con increase,
 * a feature that grants HP, undoing a level). Full HP stays full; a conscious character stays above 0.
 */
export function withMaxHpDelta(prev: Character, next: Character, reg: Registry): Character {
  // Full stays full; 0 HP stays 0 (more max HP doesn't wake a dying character).
  if (next.play.hp === null || next.play.hp === 0) return next;
  const before = deriveSheet(prev, reg).maxHp;
  const after = deriveSheet(next, reg).maxHp;
  if (before === after) return next;
  const hp = next.play.hp;
  const moved = Math.min(after, Math.max(hp > 0 ? 1 : 0, Math.min(hp, before) + after - before));
  return { ...next, play: { ...next.play, hp: moved } };
}

/**
 * Removes the last level gained along with what came with it: choices that only existed because of
 * that level, the subclass if the class drops below its subclass level, the spells learned or replaced
 * on that level, and the hit points and Hit Dice it added.
 */
export function removeLastLevel(char: Character, reg: Registry): Character {
  if (char.levels.length <= 1) return char;
  const last = char.levels.at(-1)!;
  const levels = char.levels.slice(0, -1);
  const classLevel = levels.filter((l) => l.classId === last.classId).length;
  const cls = reg.classes.get(last.classId);

  const subclasses = { ...char.subclasses };
  if (cls && classLevel < cls.subclassLevel) delete subclasses[last.classId];

  // Spells: drop what this level added, put back what it replaced.
  const added = new Set(last.spells?.added ?? []);
  const spells: Character['spells'] = {};
  for (const [id, s] of Object.entries(char.spells))
    spells[id] = { cantrips: s.cantrips.filter((x) => !added.has(x)), prepared: s.prepared.filter((x) => !added.has(x)) };
  for (const id of last.spells?.removed ?? []) {
    // Back into the class list it most likely came from: this level's class if the spell is on its list,
    // otherwise another class the character still has whose list includes it.
    const on = reg.spells.get(id)?.classes ?? [];
    const owner = on.includes(last.classId) ? last.classId : (Object.keys(spells).find((k) => k !== last.classId && on.includes(k)) ?? last.classId);
    const list = (spells[owner] ??= { cantrips: [], prepared: [] });
    const target = reg.spells.get(id)?.level === 0 ? list.cantrips : list.prepared;
    if (!target.includes(id)) target.push(id);
  }
  if (classLevel === 0) delete spells[last.classId];

  let next: Character = { ...char, levels, subclasses, spells };

  // Choices that the removed level opened (and anything nested under them).
  const after = new Set(collect(next, reg).choices.map((c) => c.key));
  const gone = collect(char, reg).choices.filter((c) => !after.has(c.key)).map((c) => c.key);
  if (gone.length) {
    const choices = { ...char.choices };
    for (const k of gone) delete choices[k];
    next = { ...next, choices };
  }

  next = withMaxHpDelta(char, next, reg);
  const dice = deriveSheet(next, reg).hitDice;
  const hitDiceUsed: Record<string, number> = {};
  for (const [die, used] of Object.entries(next.play.hitDiceUsed)) {
    const total = dice.find((h) => h.die === die)?.total ?? 0;
    if (Math.min(used, total) > 0) hitDiceUsed[die] = Math.min(used, total);
  }
  return { ...next, play: { ...next.play, hitDiceUsed } };
}

const allSpells = (c: Character) =>
  new Set(Object.values(c.spells).flatMap((s) => [...s.cantrips, ...s.prepared]));

/**
 * Applies `next` and folds its spell changes (against `prev`) into the last level entry, so the
 * level history can show what was learned or replaced. Unlearning a spell added this level cancels it.
 */
export function recordLevelSpells(prev: Character, next: Character): Character {
  const last = next.levels.at(-1);
  if (!last || next.levels.length < 2) return next;
  const before = allSpells(prev);
  const after = allSpells(next);
  let added = [...(last.spells?.added ?? [])];
  let removed = [...(last.spells?.removed ?? [])];
  for (const id of after)
    if (!before.has(id)) {
      if (removed.includes(id)) removed = removed.filter((x) => x !== id);
      else if (!added.includes(id)) added.push(id);
    }
  for (const id of before)
    if (!after.has(id)) {
      if (added.includes(id)) added = added.filter((x) => x !== id);
      else if (!removed.includes(id)) removed.push(id);
    }
  return { ...next, levels: [...next.levels.slice(0, -1), { ...last, spells: { added, removed } }] };
}

/**
 * Inventory rows for a bundle. `picks[i]` holds the item ids chosen for bundle item i when it is
 * "of your choice"; slots not picked yet stay as one placeholder row.
 */
const CUSTOM = 'custom:';
/** True for an equipment pick the player named themselves (with a non-empty name). */
export const isCustomPick = (id: string) => id.startsWith(CUSTOM) && id.length > CUSTOM.length && id.slice(CUSTOM.length).trim() !== '';

export function inventoryFromBundle(bundle: EquipmentBundle, reg: Registry, tag: string, picks: Record<number, string[]> = {}): InventoryItem[] {
  const row = (id: string, name: string, qty: number): InventoryItem => {
    const item = id ? reg.items.get(id) : undefined;
    const isGear = item && (item.weapon || item.armor);
    return {
      uid: uid(),
      ...(item ? { itemId: item.id } : {}),
      name: item?.name ?? name,
      qty,
      equipped: Boolean(isGear),
      notes: tag,
    };
  };
  return bundle.items.flatMap((b, i) => {
    if (!b.choose) return [row(b.item, b.name, b.count)];
    // A pick is a listed item id, or "custom:<name>" for an item the player describes (their own focus...).
    const chosen = (picks[i] ?? []).slice(0, b.count).filter((id) => b.choose!.options.includes(id) || isCustomPick(id));
    const open = b.count - chosen.length;
    return [
      ...chosen.map((id) => (isCustomPick(id) ? row('', id.slice(CUSTOM.length).trim(), 1) : row(id, id, 1))),
      ...(open > 0 ? [row('', b.name, open)] : []),
    ];
  });
}

/** Replace starting equipment from one source (class/background) with a chosen bundle. */
export function applyStartingBundle(
  char: Character,
  tag: string,
  bundle: EquipmentBundle | undefined,
  reg: Registry,
  previousGp: number,
  picks?: Record<number, string[]>,
): Character {
  const inventory = char.inventory.filter((i) => i.notes !== tag);
  const added = bundle ? inventoryFromBundle(bundle, reg, tag, picks) : [];
  return {
    ...char,
    inventory: [...inventory, ...added],
    coins: { ...char.coins, gp: Math.max(0, char.coins.gp - previousGp + (bundle?.gp ?? 0)) },
  };
}

export function shortRest(char: Character, sheet: Sheet): Character {
  const counters = { ...char.play.counters };
  for (const c of sheet.counters) if (c.reset === 'short') delete counters[c.id];
  return { ...char, play: { ...char.play, counters, pactSlotsUsed: 0 } };
}

/**
 * Hit Dice still spent after a Long Rest. 2024: you regain all of them. 2014: up to half your total
 * (minimum 1), largest dice first.
 */
function hitDiceAfterLongRest(char: Character, sheet: Sheet): Record<string, number> {
  if (char.ruleset !== '2014') return {};
  const total = sheet.hitDice.reduce((n, h) => n + h.total, 0);
  let regain = Math.max(1, Math.floor(total / 2));
  const left: Record<string, number> = {};
  const bySize = Object.entries(char.play.hitDiceUsed).sort(([a], [b]) => Number(b.slice(1)) - Number(a.slice(1)));
  for (const [die, used] of bySize) {
    const back = Math.min(used, regain);
    regain -= back;
    if (used - back > 0) left[die] = used - back;
  }
  return left;
}

export function longRest(char: Character, sheet: Sheet): Character {
  const fresh = emptyPlayState();
  return {
    ...char,
    // Most charged items regain charges at dawn; treat a long rest as the next dawn.
    inventory: char.inventory.map((i) => (i.chargesUsed ? { ...i, chargesUsed: 0 } : i)),
    play: {
      ...fresh,
      hitDiceUsed: hitDiceAfterLongRest(char, sheet),
      exhaustion: Math.max(0, char.play.exhaustion - 1),
      conditions: char.play.conditions,
      heroicInspiration:
        char.play.heroicInspiration || sheet.features.some((f) => f.key.endsWith(':resourceful')),
    },
  };
}

/** Spend one hit die: roll it + Con and heal. */
export function spendHitDie(char: Character, sheet: Sheet, die: string, rng: Rng = defaultRng): { char: Character; healed: number } {
  const total = sheet.hitDice.find((h) => h.die === die)?.total ?? 0;
  const used = char.play.hitDiceUsed[die] ?? 0;
  if (used >= total) return { char, healed: 0 };
  const healed = Math.max(1, rng(Number(die.slice(1))) + sheet.abilities.con.mod);
  const current = currentHp(char, sheet);
  return {
    healed,
    char: {
      ...char,
      play: {
        ...char.play,
        hp: Math.min(sheet.maxHp, current + healed),
        hitDiceUsed: { ...char.play.hitDiceUsed, [die]: used + 1 },
      },
    },
  };
}

/**
 * Shared hit point math for characters and companions: damage drains Temporary HP first,
 * healing never passes the maximum, neither goes below 0.
 */
export function changeHp(cur: { hp: number; temp: number }, max: number, kind: 'damage' | 'heal', amount: number): { hp: number; temp: number } {
  if (kind === 'heal') return { hp: Math.min(max, cur.hp + amount), temp: cur.temp };
  const absorbed = Math.min(cur.temp, amount);
  return { hp: Math.max(0, cur.hp - (amount - absorbed)), temp: cur.temp - absorbed };
}

/**
 * Apply damage: temp HP first, then HP. Damage that reaches a character already at 0 HP is a failed
 * death saving throw (a stable character starts over at one failure). Massive damage kills outright:
 * at 0 HP, damage of at least max HP; from above 0, what's left after reaching 0 being at least max HP.
 */
export function applyDamage(char: Character, sheet: Sheet, amount: number): Character {
  const hp = currentHp(char, sheet);
  const next = changeHp({ hp, temp: char.play.tempHp }, sheet.maxHp, 'damage', amount);
  const through = Math.max(0, amount - char.play.tempHp);
  const dead = { successes: 0, failures: 3 };
  let deathSaves = char.play.deathSaves;
  if (hp === 0 && through > 0) {
    if (through >= sheet.maxHp) deathSaves = dead;
    else if (deathState(deathSaves) === 'stable') deathSaves = { successes: 0, failures: 1 };
    else deathSaves = { ...deathSaves, failures: Math.min(3, deathSaves.failures + 1) };
  } else if (hp > 0 && next.hp === 0 && through - hp >= sheet.maxHp) {
    deathSaves = dead;
  }
  return { ...char, play: { ...char.play, tempHp: next.temp, hp: next.hp, deathSaves } };
}

export type DeathState = 'dying' | 'stable' | 'dead';

export function deathState(saves: { successes: number; failures: number }): DeathState {
  if (saves.failures >= 3) return 'dead';
  if (saves.successes >= 3) return 'stable';
  return 'dying';
}

/**
 * Applies a rolled death saving throw (the d20 face, before bonuses): 10+ is a success, below is a failure,
 * a 1 counts as two failures, a 20 brings you back with 1 Hit Point. Does nothing once stable or dead.
 */
export function applyDeathSave(char: Character, d20: number, bonus = 0): Character {
  const saves = char.play.deathSaves;
  if (deathState(saves) !== 'dying') return char;
  if (d20 === 20) return { ...char, play: { ...char.play, hp: 1, deathSaves: { successes: 0, failures: 0 } } };
  const next =
    d20 === 1
      ? { ...saves, failures: Math.min(3, saves.failures + 2) }
      : d20 + bonus >= 10
        ? { ...saves, successes: Math.min(3, saves.successes + 1) }
        : { ...saves, failures: Math.min(3, saves.failures + 1) };
  return { ...char, play: { ...char.play, deathSaves: next } };
}

export function heal(char: Character, sheet: Sheet, amount: number): Character {
  const hp = Math.min(sheet.maxHp, currentHp(char, sheet) + amount);
  const deathSaves = hp > 0 ? { successes: 0, failures: 0 } : char.play.deathSaves;
  return { ...char, play: { ...char.play, hp: hp >= sheet.maxHp ? null : hp, deathSaves } };
}
