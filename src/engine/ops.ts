import type { Registry } from '../data/registry';
import type { Character, InventoryItem } from '../types/character';
import { emptyPlayState } from '../types/character';
import type { EquipmentBundle } from '../types/rules';
import type { Rng } from './dice';
import { defaultRng } from './dice';
import type { Sheet } from './derive';

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
  return {
    ...char,
    levels: [
      ...char.levels,
      // Levels after the first record the spells learned while leveling (shown in the level history).
      { classId, hpGain, ...(mode === 'roll' && !first ? { rolled: true } : {}), ...(first ? {} : { spells: { added: [], removed: [] } }) },
    ],
    // Healing to full on level-up is not a rule; keep current HP but grow with max.
    play: { ...char.play, hp: char.play.hp === null ? null : char.play.hp + hpGain },
  };
}

/** Removes the last level gained along with choices that only existed because of it. */
export function removeLastLevel(char: Character): Character {
  if (char.levels.length <= 1) return char;
  const levels = char.levels.slice(0, -1);
  return { ...char, levels };
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

export function longRest(char: Character, sheet: Sheet): Character {
  const fresh = emptyPlayState();
  return {
    ...char,
    // Most charged items regain charges at dawn; treat a long rest as the next dawn.
    inventory: char.inventory.map((i) => (i.chargesUsed ? { ...i, chargesUsed: 0 } : i)),
    play: {
      ...fresh,
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
  const current = char.play.hp ?? sheet.maxHp;
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

/** Apply damage: temp HP first, then HP. */
export function applyDamage(char: Character, sheet: Sheet, amount: number): Character {
  const next = changeHp({ hp: char.play.hp ?? sheet.maxHp, temp: char.play.tempHp }, sheet.maxHp, 'damage', amount);
  return { ...char, play: { ...char.play, tempHp: next.temp, hp: next.hp } };
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
    d20 + bonus >= 10
      ? { ...saves, successes: Math.min(3, saves.successes + 1) }
      : { ...saves, failures: Math.min(3, saves.failures + (d20 === 1 ? 2 : 1)) };
  return { ...char, play: { ...char.play, deathSaves: next } };
}

export function heal(char: Character, sheet: Sheet, amount: number): Character {
  const hp = Math.min(sheet.maxHp, (char.play.hp ?? sheet.maxHp) + amount);
  const deathSaves = hp > 0 ? { successes: 0, failures: 0 } : char.play.deathSaves;
  return { ...char, play: { ...char.play, hp: hp >= sheet.maxHp ? null : hp, deathSaves } };
}
