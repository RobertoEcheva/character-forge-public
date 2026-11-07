import type { CreatureDef } from '../types/creature';
import type { Edition } from '../types/rules';

// Lazy: stat blocks are only downloaded when the Companions panel opens.
const loaders = import.meta.glob('../../data/creatures/*.json', { import: 'default' });

const cache = new Map<Edition, Promise<CreatureDef[]>>();

export function loadCreatures(edition: Edition): Promise<CreatureDef[]> {
  if (!cache.has(edition)) {
    const load = loaders[`../../data/creatures/${edition}.json`];
    cache.set(edition, load ? (load() as Promise<CreatureDef[]>) : Promise.resolve([]));
  }
  return cache.get(edition)!;
}

/** SRD creatures plus custom ones of the same edition; custom entries replace SRD ones with the same id. */
export function mergeCreatures(srd: CreatureDef[], custom: CreatureDef[] | undefined, edition: Edition): CreatureDef[] {
  const mine = (custom ?? []).filter((c) => (c.edition ?? '2024') === edition).map((c) => ({ ...c, source: 'custom' as const }));
  return [...srd.filter((c) => !mine.some((m) => m.id === c.id)), ...mine];
}

/** Highest beast CR and movement limits for Wild Shape at a Druid level. */
export function wildShapeLimits(edition: Edition, druidLevel: number, moon: boolean) {
  let cr = druidLevel >= 8 ? 1 : druidLevel >= 4 ? 0.5 : 0.25;
  if (moon) cr = edition === '2024' ? Math.max(1, Math.floor(druidLevel / 3)) : druidLevel >= 6 ? Math.floor(druidLevel / 3) : 1;
  return { cr, fly: druidLevel >= 8, swim: edition === '2024' || druidLevel >= 4 };
}

export function canWildShape(c: CreatureDef, limits: ReturnType<typeof wildShapeLimits>) {
  return c.type.toLowerCase() === 'beast' && c.cr <= limits.cr && (limits.fly || !c.speed.fly) && (limits.swim || !c.speed.swim);
}
