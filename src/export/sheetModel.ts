import type { Registry } from '../data/registry';
import type { Sheet } from '../engine/derive';
import { featureRows } from '../engine/featureRows';
import type { Character } from '../types/character';
import { ABILITIES, ABILITY_NAMES, type Ability } from '../types/rules';

/** Everything the PDF sheet prints, as plain data. Titles only: no rules text, no companions. */
export interface PdfModel {
  name: string;
  ruleset: string;
  header: { classLevel: string; background: string; species: string; alignment: string };
  abilities: { id: Ability; name: string; score: number; mod: number; save: number; saveProf: boolean }[];
  skills: { name: string; ability: string; bonus: number; proficient: boolean; expertise: boolean }[];
  profBonus: number;
  passivePerception: number;
  ac: number;
  initiative: number;
  speed: number;
  maxHp: number;
  hitDice: string;
  /** Extra speeds, senses and resistances on one line. */
  extras: string;
  attacks: { name: string; bonus: number; damage: string }[];
  proficiencies: { label: string; text: string }[];
  features: string[];
  equipment: string[];
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number };
  personality: string;
  spells: PdfSpells | null;
}

export interface PdfSpells {
  casters: { name: string; ability: string; saveDc: number; attack: number }[];
  /** Index 0 is cantrips; 1-9 are spell levels. */
  levels: { level: number; slots: number; spells: { name: string; always: boolean }[] }[];
  pact: { count: number; level: number } | null;
}

const abbr = (a: string) => a.charAt(0).toUpperCase() + a.slice(1, 3);

export function buildPdfModel(c: Character, s: Sheet, reg: Registry): PdfModel {
  const species = reg.species.get(c.speciesId);
  const lineage = species?.lineages?.find((l) => l.id === c.lineageId);
  const p = s.proficiencies;
  const list = (xs: string[]) => xs.join(', ') || '—';

  const features = featureRows(s, reg).map((f) => (f.pickLabel ? `${f.name}: ${f.pickLabel}` : f.name));

  let spells: PdfSpells | null = null;
  if (s.casters.length > 0 || s.spells.length > 0) {
    const levels: PdfSpells['levels'] = [];
    for (let lvl = 0; lvl <= 9; lvl++) {
      const names = s.spells
        .filter((k) => k.spell.level === lvl)
        .map((k) => ({ name: k.spell.name, always: k.alwaysPrepared }))
        .filter((x, i, arr) => arr.findIndex((y) => y.name === x.name) === i)
        .sort((a, b) => a.name.localeCompare(b.name));
      const slots = lvl === 0 ? 0 : (s.slots[lvl - 1] ?? 0);
      if (names.length || slots) levels.push({ level: lvl, slots, spells: names });
    }
    spells = {
      casters: s.casters.map((k) => ({ name: k.name, ability: ABILITY_NAMES[k.ability], saveDc: k.saveDc, attack: k.attack })),
      levels,
      pact: s.pactSlots && s.pactSlots.count > 0 ? s.pactSlots : null,
    };
  }

  return {
    name: c.name || 'Unnamed hero',
    ruleset: c.ruleset,
    header: {
      classLevel: s.classSummary || `Level ${s.level}`,
      background: reg.backgrounds.get(c.backgroundId)?.name ?? '',
      species: lineage ? `${species?.name ?? ''} (${lineage.name})` : (species?.name ?? ''),
      alignment: c.details.alignment ?? '',
    },
    abilities: ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a], ...s.abilities[a] })),
    skills: s.skills.map((k) => ({ name: k.name, ability: abbr(k.ability), bonus: k.bonus, proficient: k.proficient, expertise: k.expertise })),
    profBonus: s.profBonus,
    passivePerception: s.passives.perception,
    ac: s.ac,
    initiative: s.initiative,
    speed: s.speed,
    maxHp: s.maxHp,
    hitDice: s.hitDice.map((h) => `${h.total}${h.die}`).join(' + '),
    extras: [
      ...s.speeds.map((x) => `${x.mode} ${x.value} ft.`),
      ...s.senses.map((x) => `${x.sense} ${x.range} ft.`),
      ...(s.resistances.length ? [`Resistance: ${s.resistances.join(', ')}`] : []),
    ].join(' · '),
    attacks: s.attacks.map((a) => ({ name: a.name, bonus: a.bonus, damage: `${a.damage} ${a.damageType}`.trim() })),
    proficiencies: [
      { label: 'Armor', text: list(p.armor) },
      { label: 'Weapons', text: list(p.weapons.map((w) => reg.items.get(w)?.name ?? w)) },
      { label: 'Tools', text: list(p.tools.map((t) => reg.tools.get(t)?.name ?? t)) },
      { label: 'Languages', text: list(p.languages.map((l) => reg.languages.get(l)?.name ?? l)) },
    ],
    features,
    equipment: c.inventory.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)),
    coins: { cp: c.coins.cp ?? 0, sp: c.coins.sp ?? 0, ep: c.coins.ep ?? 0, gp: c.coins.gp ?? 0, pp: c.coins.pp ?? 0 },
    personality: c.details.personality?.trim() ?? '',
    spells,
  };
}
