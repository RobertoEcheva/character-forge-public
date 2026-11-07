import type { CreatureDef } from '../types/creature';
import type {
  BackgroundDef,
  Edition,
  ClassDef,
  FeatDef,
  ItemDef,
  KeywordDef,
  RulesData,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from '../types/rules';

export interface Registry {
  data: RulesData;
  classes: Map<string, ClassDef>;
  subclasses: Map<string, SubclassDef>;
  species: Map<string, SpeciesDef>;
  backgrounds: Map<string, BackgroundDef>;
  feats: Map<string, FeatDef>;
  spells: Map<string, SpellDef>;
  items: Map<string, ItemDef>;
  keywords: Map<string, KeywordDef>;
  languages: Map<string, { id: string; name: string; rare: boolean }>;
  tools: Map<string, { id: string; name: string; group?: string }>;
}

/** A content pack the user made in the browser (bundled packs live in data/packs). */
export interface UserPack {
  id: string;
  name: string;
  description?: string;
  edition: Edition;
}

/** User-added content. Creatures live here too, though they aren't part of RulesData (SRD ones load lazily). */
export type CustomContent = Partial<Omit<RulesData, 'languages' | 'tools' | 'edition'>> & {
  creatures?: CreatureDef[];
  packs?: UserPack[];
};

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

/** Custom entries of the same edition override SRD entries with the same id, otherwise append. */
function mergeList<T extends { id: string; edition?: Edition }>(base: T[], extra: T[] | undefined, edition: Edition): T[] {
  const mine = (extra ?? []).filter((x) => (x.edition ?? '2024') === edition);
  if (!mine.length) return base;
  const map = new Map(base.map((x) => [x.id, x]));
  for (const x of mine) map.set(x.id, x);
  return [...map.values()];
}

export function mergeRules(base: RulesData, custom: CustomContent = {}): RulesData {
  const e = base.edition;
  return {
    edition: e,
    classes: mergeList(base.classes, custom.classes, e),
    subclasses: mergeList(base.subclasses, custom.subclasses, e),
    species: mergeList(base.species, custom.species, e),
    backgrounds: mergeList(base.backgrounds, custom.backgrounds, e),
    feats: mergeList(base.feats, custom.feats, e),
    spells: mergeList(base.spells, custom.spells, e),
    items: mergeList(base.items, custom.items, e),
    keywords: mergeList(base.keywords, custom.keywords, e),
    languages: base.languages,
    tools: base.tools,
  };
}

export function createRegistry(data: RulesData): Registry {
  return {
    data,
    classes: byId(data.classes),
    subclasses: byId(data.subclasses),
    species: byId(data.species),
    backgrounds: byId(data.backgrounds),
    feats: byId(data.feats),
    spells: byId(data.spells),
    items: byId(data.items),
    keywords: byId(data.keywords),
    languages: byId(data.languages),
    tools: byId(data.tools),
  };
}
