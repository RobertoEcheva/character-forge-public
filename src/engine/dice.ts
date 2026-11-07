export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface DiceTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
}

export interface ParsedDice {
  dice: DiceTerm[];
  flat: number;
}

export interface RollResult {
  label: string;
  expression: string;
  total: number;
  /** Individual die results per term; d20 rolls with adv/dis keep both. */
  rolls: { sides: number; values: number[]; kept?: number }[];
  flat: number;
  mode: RollMode;
  crit?: boolean;
  fumble?: boolean;
  at: number;
}

/** Parses expressions like "1d20+5", "2d6 + 1d4 - 1", "d8", "7". Returns null on invalid input. */
export function parseDice(expr: string): ParsedDice | null {
  const s = expr.replace(/\s+/g, '').toLowerCase();
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
  const out: ParsedDice = { dice: [], flat: 0 };
  for (const m of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const term = m[2];
    if (term.includes('d')) {
      const [c, sides] = term.split('d');
      const count = c === '' ? 1 : Number(c);
      if (count > 100 || Number(sides) < 1) return null;
      out.dice.push({ count, sides: Number(sides), sign });
    } else out.flat += sign * Number(term);
  }
  return out;
}

export type Rng = (sides: number) => number;
export const defaultRng: Rng = (sides) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
};

export function roll(label: string, expression: string, mode: RollMode = 'normal', rng: Rng = defaultRng): RollResult | null {
  const parsed = parseDice(expression);
  if (!parsed) return null;
  let total = parsed.flat;
  const rolls: RollResult['rolls'] = [];
  let crit = false;
  let fumble = false;
  for (const term of parsed.dice) {
    // Advantage/disadvantage applies to a single d20.
    if (term.sides === 20 && term.count === 1 && mode !== 'normal') {
      const a = rng(20);
      const b = rng(20);
      const kept = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
      rolls.push({ sides: 20, values: [a, b], kept });
      total += term.sign * kept;
      crit = kept === 20;
      fumble = kept === 1;
      continue;
    }
    const values = Array.from({ length: term.count }, () => rng(term.sides));
    rolls.push({ sides: term.sides, values });
    total += term.sign * values.reduce((x, y) => x + y, 0);
    if (term.sides === 20 && term.count === 1) {
      crit = values[0] === 20;
      fumble = values[0] === 1;
    }
  }
  return { label, expression, total, rolls, flat: parsed.flat, mode, crit, fumble, at: Date.now() };
}

/** Critical hit: double every die count, keep flat modifiers ("2d6+3" -> "4d6+3"). */
export function critExpression(expr: string): string {
  return expr.replace(/(\d*)d(\d+)/g, (_, n, sides) => `${(Number(n || 1)) * 2}d${sides}`);
}

/** d20 + modifier expression. */
export const d20 = (modifier: number) => `1d20${modifier >= 0 ? '+' : ''}${modifier}`;
