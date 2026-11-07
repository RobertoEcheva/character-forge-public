import type { Registry } from '../data/registry';
import type { Character } from '../types/character';
import type { Sheet } from './derive';
import { featureRows, type FeatureRow } from './featureRows';

/** One character level as it was gained: class, HP, features and the picks it owns. */
export interface LevelStep {
  /** Character level, 1-based. */
  level: number;
  classId: string;
  className: string;
  classLevel: number;
  /** HP gained this level including the Con modifier. */
  hp: { gain: number; rolled: boolean };
  features: FeatureRow[];
  /** Set when this level is the class's subclass level. */
  subclass?: { classId: string; id?: string; name?: string };
  /** ChoiceInstance keys first opened at this level. */
  choiceKeys: string[];
  /** Spells learned while leveling; 'not-recorded' for level 1 and levels from older saves. */
  spells: { added: string[]; removed: string[] } | 'not-recorded';
}

/** Character level at which a class reached a class level (walks `character.levels`). */
function levelLookup(character: Character) {
  const at = new Map<string, number>();
  const seen = new Map<string, number>();
  character.levels.forEach((e, i) => {
    const n = (seen.get(e.classId) ?? 0) + 1;
    seen.set(e.classId, n);
    at.set(`${e.classId}@${n}`, i + 1);
  });
  return (classId: string, classLevel: number) => at.get(`${classId}@${Math.max(1, classLevel)}`);
}

/**
 * Maps a feature/choice key ("class:fighter:fighter-asi:feat", "feat@class:...:feat:asi",
 * "species:...", "background:asi") to the character level that opened it.
 */
export function keyLevelResolver(character: Character, reg: Registry) {
  const charLevelOf = levelLookup(character);
  // Feature key -> where it unlocks. Includes hidden features, whose choices still exist.
  const featureAt = new Map<string, { classId?: string; level: number }>();
  for (const classId of new Set(character.levels.map((l) => l.classId))) {
    const cls = reg.classes.get(classId);
    for (const f of cls?.features ?? []) featureAt.set(`class:${classId}:${f.id}`, { classId, level: f.level });
    const sub = reg.subclasses.get(character.subclasses[classId] ?? '');
    for (const f of sub?.features ?? []) featureAt.set(`subclass:${sub!.id}:${f.id}`, { classId, level: f.level });
  }
  const species = reg.species.get(character.speciesId);
  const traits = [...(species?.traits ?? []), ...(species?.lineages?.find((l) => l.id === character.lineageId)?.traits ?? [])];
  for (const t of traits) featureAt.set(`species:${t.id}`, { level: t.level });
  const keys = [...featureAt.keys()].sort((a, b) => b.length - a.length);

  return (rawKey: string, minLevel?: number): number => {
    let key = rawKey;
    while (key.startsWith('feat@')) key = key.slice('feat@'.length);
    const fk = keys.find((k) => key === k || key.startsWith(`${k}:`));
    if (fk) {
      const at = featureAt.get(fk)!;
      if (!at.classId) return Math.max(1, at.level, minLevel ?? 0);
      return charLevelOf(at.classId, Math.max(at.level, minLevel ?? 0)) ?? 1;
    }
    // Class-level choices (skills, multiclass proficiencies): the level the class was taken.
    const m = /^class:([^:]+)/.exec(key);
    if (m) return charLevelOf(m[1], minLevel ?? 1) ?? 1;
    // Species, background and core choices scope minLevel by character level.
    return Math.max(1, minLevel ?? 1);
  };
}

export function levelHistory(character: Character, sheet: Sheet, reg: Registry): LevelStep[] {
  const levelOf = keyLevelResolver(character, reg);
  const rows = featureRows(sheet, reg);
  const conMod = sheet.abilities.con.mod;
  const seen = new Map<string, number>();

  return character.levels.map((entry, i) => {
    const level = i + 1;
    const classLevel = (seen.get(entry.classId) ?? 0) + 1;
    seen.set(entry.classId, classLevel);
    const cls = reg.classes.get(entry.classId);
    const subId = character.subclasses[entry.classId];
    return {
      level,
      classId: entry.classId,
      className: cls?.name ?? entry.classId,
      classLevel,
      hp: { gain: (i === 0 ? (cls?.hitDie ?? entry.hpGain) : entry.hpGain) + conMod, rolled: Boolean(entry.rolled) },
      features: rows.filter((r) => levelOf(r.key) === level),
      ...(cls && classLevel === cls.subclassLevel
        ? { subclass: { classId: entry.classId, ...(subId ? { id: subId, name: reg.subclasses.get(subId)?.name ?? subId } : {}) } }
        : {}),
      choiceKeys: sheet.collected.choices
        .filter((c) => !c.locked && levelOf(c.key, c.choice.minLevel) === level)
        .map((c) => c.key),
      spells: entry.spells ?? 'not-recorded',
    };
  });
}
