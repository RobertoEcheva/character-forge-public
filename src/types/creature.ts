import type { Ability, PackInfo } from './rules';

/** Trimmed stat block used for familiars, companions, summons and Wild Shape forms (SRD or custom). */
export interface CreatureDef extends PackInfo {
  source?: 'srd' | 'custom';
  id: string;
  name: string;
  size: string;
  type: string;
  cr: number;
  ac: number;
  hp: number;
  hitDice: string;
  speed: Record<string, string>;
  abilities: Record<Ability, number>;
  senses: string;
  traits: { name: string; description: string }[];
  actions: { name: string; description: string; attack?: number; damage?: string; damageType?: string }[];
}
