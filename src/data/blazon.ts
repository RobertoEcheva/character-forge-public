/** Coat-of-arms data: tinctures, divisions, charges, default arms and plain-words descriptions. */
import type { Blazon, Charge, Division, Tincture } from '../types/character';

/** Fixed heraldic colours: arms keep their tinctures in light and dark mode. */
export const TINCTURES: { id: Tincture; name: string; plain: string; hex: string }[] = [
  { id: 'argent', name: 'Argent', plain: 'silver', hex: '#f1f2f4' },
  { id: 'or', name: 'Or', plain: 'gold', hex: '#d4a12a' },
  { id: 'gules', name: 'Gules', plain: 'red', hex: '#b3261e' },
  { id: 'azure', name: 'Azure', plain: 'blue', hex: '#1e4c9a' },
  { id: 'vert', name: 'Vert', plain: 'green', hex: '#2a6a3c' },
  { id: 'purpure', name: 'Purpure', plain: 'purple', hex: '#5e2f72' },
  { id: 'sable', name: 'Sable', plain: 'black', hex: '#17161c' },
];
export const TINCTURE_HEX = Object.fromEntries(TINCTURES.map((t) => [t.id, t.hex])) as Record<Tincture, string>;
export const isMetal = (t: Tincture) => t === 'argent' || t === 'or';

export const DIVISIONS: { id: Division; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'per-pale', name: 'Per pale' },
  { id: 'per-fess', name: 'Per fess' },
  { id: 'per-bend', name: 'Per bend' },
  { id: 'quarterly', name: 'Quarterly' },
  { id: 'chevron', name: 'Chevron' },
  { id: 'chief', name: 'Chief' },
];

export const CHARGES: { id: Charge; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'mullet', name: 'Star' },
  { id: 'lozenge', name: 'Lozenge' },
  { id: 'roundel', name: 'Roundel' },
  { id: 'cross', name: 'Cross' },
  { id: 'crescent', name: 'Crescent' },
];

/** Stable arms from an id: a colour field with a metal charge, so the rule of tincture holds. */
export function defaultBlazon(id: string): Blazon {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = <T>(xs: T[], shift: number) => xs[(h >>> shift) % xs.length];
  const metal = pick<Tincture>(['or', 'argent'], 3);
  return {
    field: pick<Tincture>(['gules', 'azure', 'vert', 'purpure', 'sable'], 0),
    division: pick<Division>(['plain', 'plain', 'per-pale', 'per-bend', 'chief', 'chevron'], 6),
    second: metal,
    charge: pick<Charge>(['mullet', 'lozenge', 'roundel', 'cross', 'crescent'], 11),
    chargeTincture: metal,
  };
}

/** The character's chosen arms, or their default ones. */
export const blazonOf = (c: { id: string; details: { blazon?: Blazon } }) => c.details.blazon ?? defaultBlazon(c.id);

/** Plain-words description: "Blue and gold per pale, a gold star". */
export function describeBlazon(b: Blazon) {
  const name = (t: Tincture) => TINCTURES.find((x) => x.id === t)!.plain;
  const div = b.division === 'plain' ? '' : ` and ${name(b.second)} ${DIVISIONS.find((d) => d.id === b.division)!.name.toLowerCase()}`;
  const charge = b.charge === 'none' ? '' : `, a ${name(b.chargeTincture)} ${CHARGES.find((c) => c.id === b.charge)!.name.toLowerCase()}`;
  const first = name(b.field);
  return `${first[0].toUpperCase()}${first.slice(1)}${div}${charge}`;
}
