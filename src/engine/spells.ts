import type { SpellDef } from '../types/rules';

/** Highest table key <= n. */
function atOrBelow(table: Record<string, string>, n: number): string | undefined {
  const keys = Object.keys(table).map(Number).filter((k) => k <= n).sort((a, b) => b - a);
  return keys.length ? table[String(keys[0])] : undefined;
}

/** "8d6" + 2 extra levels of "1d6" -> "10d6"; different dice are appended ("8d6+2d4"). */
function addDice(base: string, extra: string, times: number): string {
  if (times <= 0) return base;
  const m = extra.match(/^(\d+)d(\d+)$/);
  const b = base.match(/^(\d+)d(\d+)(.*)$/);
  if (m && b && m[2] === b[2]) return `${Number(b[1]) + Number(m[1]) * times}d${b[2]}${b[3]}`;
  return `${base}+${Number(m?.[1] ?? 1) * times}d${m?.[2] ?? extra}`;
}

/** Per-level increase stated in higher-level text, e.g. "increases by 1d6 for each spell slot level above 3". */
function upcastStep(spell: SpellDef): { dice: string; above: number } | null {
  const re = /(?:increases|increase) by (\d+d\d+) for each (?:spell )?slot level above (\d+)/i;
  const m = spell.higherLevel?.match(re) ?? spell.description.match(re);
  return m ? { dice: m[1], above: Number(m[2]) } : null;
}

/** Cantrip damage tier: x1 / x2 / x3 / x4 at character levels 1 / 5 / 11 / 17. */
const cantripTier = (charLevel: number) => (charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1);

function scaleTable(table: Record<string, string>, spell: SpellDef, slot: number, charLevel: number): string | undefined {
  if (spell.level === 0) {
    const base = table['0'] ?? atOrBelow(table, 9);
    const m = base?.match(/^(\d+)d(\d+)(.*)$/);
    return m ? `${Number(m[1]) * cantripTier(charLevel)}d${m[2]}${m[3]}` : base;
  }
  const exact = table[String(slot)];
  if (exact) return exact;
  const base = atOrBelow(table, slot);
  const step = upcastStep(spell);
  if (!base || !step) return base;
  return addDice(base, step.dice, slot - Math.max(spell.level, step.above));
}

/** Damage and healing roll expressions for casting a spell at a slot level. */
export function spellRolls(spell: SpellDef, slot: number, charLevel: number, abilityMod: number) {
  const clean = (x?: string) => x?.replace(/\s+/g, '').replace(/\+MOD/i, abilityMod >= 0 ? `+${abilityMod}` : `${abilityMod}`);
  const damage = spell.damage?.atCharLevel
    ? atOrBelow(spell.damage.atCharLevel, charLevel)
    : spell.damage?.atSlot
      ? scaleTable(spell.damage.atSlot, spell, slot, charLevel)
      : undefined;
  const heal = spell.heal ? scaleTable(spell.heal.atSlot, spell, slot, charLevel) : undefined;
  return { damage: clean(damage), damageType: spell.damage?.type, heal: clean(heal) };
}
