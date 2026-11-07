/** Converters shared by the 2024 and 2014 SRD build scripts. */
import type { CreatureDef } from '../../src/types/creature';
import type { Ability, Choice, Effect, EquipmentBundle, ItemDef, SkillId } from '../../src/types/rules';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- text cleanup ----------

export const MOJIBAKE: [RegExp, string][] = [
  [/â€™/g, '’'],
  [/â€œ/g, '“'],
  [/â€\u009d/g, '”'],
  [/â€”/g, '—'],
  [/â€“/g, '–'],
];

export function clean(text: string | string[] | undefined): string {
  if (!text) return '';
  let t = Array.isArray(text) ? text.join('\n') : text;
  for (const [re, rep] of MOJIBAKE) t = t.replace(re, rep);
  t = t
    .replace(/([a-z])- ([a-z])/g, '$1$2') // PDF hyphenation: "ex- pended"
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
  return t.trim();
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------- proficiency mapping ----------

export const toolNameToId = new Map<string, string>();
export const WEAPON_PLURALS: Record<string, string> = {
  longswords: 'longsword',
  rapiers: 'rapier',
  scimitars: 'scimitar',
  shortswords: 'shortsword',
  whips: 'whip',
  'hand-crossbows': 'hand-crossbow',
};

export function toolId(profIndex: string, profName?: string): string {
  const name = (profName ?? '').replace(/^Tool:\s*/, '').toLowerCase();
  return toolNameToId.get(name) ?? profIndex.replace(/^tool-/, '');
}

export function profToEffects(p: { index: string; name?: string }): Effect[] {
  const i = p.index;
  if (i === 'all-armor') return (['light', 'medium', 'heavy'] as const).map((armor) => ({ type: 'armor', armor }));
  if (i === 'light-armor' || i === 'medium-armor' || i === 'heavy-armor')
    return [{ type: 'armor', armor: i.replace('-armor', '') as 'light' }];
  if (i === 'shields') return [{ type: 'armor', armor: 'shield' }];
  if (i === 'simple-weapons') return [{ type: 'weapon', weapon: 'simple' }];
  if (i === 'martial-weapons') return [{ type: 'weapon', weapon: 'martial' }];
  if (WEAPON_PLURALS[i]) return [{ type: 'weapon', weapon: WEAPON_PLURALS[i] }];
  if (i.startsWith('saving-throw-')) return [{ type: 'save', ability: i.slice(13) as Ability }];
  if (i.startsWith('skill-')) return [{ type: 'skill', skill: i.slice(6) as SkillId }];
  return [{ type: 'tool', tool: toolId(i, p.name) }];
}

export function optionItems(from: any): any[] {
  return from?.options ?? [];
}

export function profChoiceToChoice(pc: any, id: string): Choice {
  const opts = optionItems(pc.from);
  const refs = opts.filter((o) => o.option_type === 'reference').map((o) => o.item);
  if (refs.length && refs.every((r: any) => r.index.startsWith('skill-'))) {
    const from = refs.map((r: any) => r.index.slice(6)) as SkillId[];
    return {
      kind: 'skill',
      id,
      label: from.length === 18 ? `Choose ${pc.choose} skills` : clean(pc.desc) || `Choose ${pc.choose} skills`,
      count: pc.choose,
      from: from.length === 18 ? 'any' : from,
    };
  }
  // tools, possibly nested choices (Monk: artisan's tools or instrument)
  const tools: string[] = [];
  for (const o of opts) {
    if (o.option_type === 'reference') tools.push(toolId(o.item.index, o.item.name));
    if (o.option_type === 'choice')
      for (const n of optionItems(o.choice.from)) if (n.item) tools.push(toolId(n.item.index, n.item.name));
  }
  return { kind: 'tool', id, label: clean(pc.desc) || `Choose ${pc.choose}`, count: pc.choose, from: tools };
}

// ---------- equipment ----------

export function bundleFromOption(o: any, label: string): EquipmentBundle {
  const b: EquipmentBundle = { label, items: [], gp: 0 };
  const add = (x: any) => {
    if (x.option_type === 'money') b.gp += x.count;
    else if (x.option_type === 'counted_reference')
      b.items.push({ item: x.of.index, name: x.of.note ? `${x.of.name} (${x.of.note})` : x.of.name, count: x.count });
    else if (x.option_type === 'reference') b.items.push({ item: x.item.index, name: x.item.name, count: 1 });
    else if (x.option_type === 'choice') b.items.push({ item: '', name: clean(x.choice.desc) || 'Item of your choice', count: 1 });
    else if (x.option_type === 'multiple') x.items.forEach(add);
  };
  add(o);
  return b;
}

export function bundles(opts: any[] | undefined): EquipmentBundle[] {
  const out: EquipmentBundle[] = [];
  for (const set of opts ?? [])
    optionItems(set.from).forEach((o: any, i: number) => out.push(bundleFromOption(o, String.fromCharCode(65 + i))));
  return out;
}


// ---------- magic items ----------

const ABILITY_WORDS: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

/** Magic item -> ItemDef with mechanics parsed from its text (bonuses, ability scores, charges). */
export function magicItemOf(m: any, taken: Set<string>): ItemDef | null {
  // Parent entries that only list "+1/+2/+3" variants are skipped; the variants themselves are kept.
  if (m.variants?.length) return null;
  const text = clean(m.desc);
  const base = slug(m.index);
  const id = taken.has(base) ? `magic-${base}` : base;
  const cat = m.equipment_category?.index ?? '';
  const attunement = typeof m.attunement === 'boolean' ? m.attunement : /requires attunement/i.test(text);
  const isShield = /\bshield\b/i.test(m.name) && /armor/.test(cat);
  const variantOf: 'weapon' | 'armor' | 'shield' | undefined = m.variant
    ? isShield
      ? 'shield'
      : cat.startsWith('weapon')
        ? 'weapon'
        : cat === 'armor'
          ? 'armor'
          : undefined
    : undefined;

  const bonus: { attack?: number; damage?: number; ac?: number; save?: number } = {};
  const wb = text.match(/\+(\d) bonus to attack (?:rolls )?and damage rolls/i);
  if (wb) bonus.attack = bonus.damage = Number(wb[1]);
  const acb = text.match(/\+(\d) bonus to (?:Armor Class|AC)( and saving throws)?/i);
  if (acb) {
    bonus.ac = Number(acb[1]);
    if (acb[2]) bonus.save = Number(acb[1]);
  }
  const set = text.match(/Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: score)? is (\d+)/i);
  const charges = text.match(/has (\d+) charges/i);

  return {
    id,
    name: m.name,
    source: 'srd',
    category: 'magic',
    description: text,
    magic: {
      rarity: m.rarity?.name ?? '',
      attunement,
      ...(variantOf ? { variantOf } : {}),
      ...(Object.keys(bonus).length ? { bonus } : {}),
      ...(set ? { abilitySet: { ability: ABILITY_WORDS[set[1].toLowerCase()], value: Number(set[2]) } } : {}),
      ...(charges ? { charges: Number(charges[1]) } : {}),
    },
  };
}

// ---------- creatures (companions, familiars, Wild Shape) ----------


const FAMILIARS = new Set(['imp', 'pseudodragon', 'quasit', 'sprite']);

export function isCompanionCandidate(m: any) {
  return (m.type?.toLowerCase() === 'beast' && m.challenge_rating <= 6) || FAMILIARS.has(m.index);
}

export function creatureOf(m: any): CreatureDef {
  return {
    id: m.index,
    name: m.name,
    size: m.size,
    type: m.type,
    cr: m.challenge_rating,
    ac: Array.isArray(m.armor_class) ? (m.armor_class[0]?.value ?? 10) : m.armor_class,
    hp: m.hit_points,
    hitDice: m.hit_points_roll ?? m.hit_dice ?? '',
    speed: m.speed ?? {},
    abilities: {
      str: m.strength,
      dex: m.dexterity,
      con: m.constitution,
      int: m.intelligence,
      wis: m.wisdom,
      cha: m.charisma,
    },
    senses: Object.entries<any>(m.senses ?? {})
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
      .join(', '),
    traits: (m.special_abilities ?? []).map((t: any) => ({ name: t.name, description: clean(t.desc) })),
    actions: (m.actions ?? [])
      .filter((a: any) => a.name !== 'Multiattack' || a.desc)
      .map((a: any) => ({
        name: a.name,
        description: clean(a.desc),
        ...(typeof a.attack_bonus === 'number' ? { attack: a.attack_bonus } : {}),
        ...(a.damage?.[0]?.damage_dice ? { damage: a.damage[0].damage_dice.replace(/\s+/g, ''), damageType: a.damage[0].damage_type?.index } : {}),
      })),
  };
}
