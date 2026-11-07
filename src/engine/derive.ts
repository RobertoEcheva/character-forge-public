import type { Registry } from '../data/registry';
import type { Character } from '../types/character';
import type { Ability, ArmorTraining, Effect, ItemDef, SkillId, SpellDef } from '../types/rules';
import { ABILITIES, SKILLS, SKILL_IDS } from '../types/rules';
import { collect, resolveRef, type Collected, type GrantedEffect, type GrantedFeature, type Origin } from './collect';
import { builtinToggles, type ToggleDef } from './toggles';

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profBonusFor = (level: number) => Math.ceil(Math.max(1, level) / 4) + 1;
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** PHB multiclass spellcaster table: slots per spell level for caster levels 1-20. */
export const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export interface SkillLine {
  id: SkillId;
  name: string;
  ability: Ability;
  bonus: number;
  proficient: boolean;
  expertise: boolean;
}

export interface Attack {
  id: string;
  name: string;
  bonus: number;
  damage: string;
  kind: 'melee' | 'ranged';
  /** Finesse or ranged: Sneak Attack eligible. */
  finesseOrRanged: boolean;
  /** Uses Strength: Rage damage eligible. */
  strBased: boolean;
  /** Thrown Weapon Fighting style bonus, applied only when thrown. */
  thrownBonus?: number;
  damageType: string;
  range: string;
  properties: string[];
  mastery?: string;
  notes?: string;
}

export interface KnownSpell {
  spell: SpellDef;
  /** classId, or "feat"/"species" for innate spells. */
  via: string;
  viaName: string;
  alwaysPrepared: boolean;
  ability?: Ability;
  /** e.g. "1 charge" for a spell cast from an item. */
  note?: string;
}

export interface CasterInfo {
  classId: string;
  /** Spell list picks come from (usually the class itself). */
  list: string;
  /** 2014 known casters: the prepared count is spells known. */
  known: boolean;
  name: string;
  ability: Ability;
  saveDc: number;
  attack: number;
  cantrips: number;
  prepared: number;
  maxSpellLevel: number;
}

export interface Counter {
  id: string;
  label: string;
  max: number;
  reset: 'short' | 'long';
}

export interface Rider {
  id: string;
  label: string;
  dice: string;
  when: 'any' | 'finesseOrRanged' | 'strMelee' | 'melee';
  auto: boolean;
  /** Divine Smite (2014): extra dice per slot level above 1st. */
  perSlot?: { base: string; perLevel: string };
}

export interface Sheet {
  collected: Collected;
  level: number;
  profBonus: number;
  classSummary: string;
  abilities: Record<Ability, { score: number; mod: number; save: number; saveProf: boolean }>;
  skills: SkillLine[];
  passivePerception: number;
  initiative: number;
  speed: number;
  size: string;
  darkvision: number;
  speeds: { mode: string; value: number; hover?: boolean }[];
  senses: { sense: string; range: number }[];
  passives: { perception: number; investigation: number; insight: number };
  /** Extra dice per d20 roll type from active effects (Bless, Bane, Guidance). */
  rollBonuses: { attack: string[]; save: string[]; check: string[] };
  /** Flat penalty to every d20 roll (2024 exhaustion). */
  d20Penalty: number;
  riders: Rider[];
  /** Toggles the character can switch on, from features and common spells. */
  toggles: ToggleDef[];
  concentration: ToggleDef | null;
  conditionNotes: string[];
  attuned: number;
  ac: number;
  acNote: string;
  maxHp: number;
  hitDice: { die: string; total: number }[];
  resistances: string[];
  proficiencies: { armor: ArmorTraining[]; weapons: string[]; tools: string[]; languages: string[] };
  attacks: Attack[];
  masteries: string[];
  casters: CasterInfo[];
  slots: number[];
  pactSlots: { count: number; level: number } | null;
  spells: KnownSpell[];
  features: GrantedFeature[];
  counters: Counter[];
  warnings: string[];
}

const COUNTER_EXTRAS: Record<string, { label: string; reset: 'short' | 'long' }> = {
  rage_count: { label: 'Rage', reset: 'long' },
  second_wind_uses: { label: 'Second Wind', reset: 'long' },
  focus_points: { label: 'Focus Points', reset: 'short' },
  ki_points: { label: 'Ki Points', reset: 'short' },
  action_surges: { label: 'Action Surge', reset: 'short' },
  indomitable_uses: { label: 'Indomitable', reset: 'long' },
  sorcery_points: { label: 'Sorcery Points', reset: 'long' },
  channel_divinity_charges: { label: 'Channel Divinity', reset: 'long' },
  wild_shape_uses: { label: 'Wild Shape', reset: 'long' },
};

export function deriveSheet(character: Character, reg: Registry): Sheet {
  const c = collect(character, reg);
  const level = Math.max(1, c.totalLevel);
  const pb = profBonusFor(level);
  const warnings: string[] = [];

  // Toggles: from features (Rage...) plus common spell effects. Active ones add their effects.
  const active = new Set(character.play.active ?? []);
  const featureToggles: ToggleDef[] = c.effects.flatMap((g) =>
    g.effect.type === 'toggle' ? [{ ...g.effect, source: g.origin.name, classId: g.origin.classId }] : [],
  );
  const builtin = builtinToggles(reg.data.edition);
  // Any concentration spell being cast shows as an effect ("spell:<id>") so concentration is tracked.
  const castSpells: ToggleDef[] = [...active]
    .filter((id) => id.startsWith('spell:'))
    .flatMap((id) => {
      const sp = reg.spells.get(id.slice(6));
      return sp ? [{ type: 'toggle' as const, id, label: sp.name, effects: [], concentration: sp.concentration, source: 'Spell' }] : [];
    });
  const toggles = [...featureToggles, ...castSpells, ...builtin];
  const granted: GrantedEffect[] = [...c.effects];
  for (const t of toggles)
    if (active.has(t.id))
      for (const effect of t.effects) granted.push({ effect, origin: { kind: 'core', name: t.label, classId: t.classId }, owner: `toggle:${t.id}` });

  // Magic items: equipped (and attuned when required) items add their effects.
  let attuned = 0;
  const magicOf = (inv: Character['inventory'][number]) => reg.items.get(inv.magicId ?? inv.itemId ?? '')?.magic;
  for (const inv of character.inventory) {
    const m = magicOf(inv);
    if (!m) continue;
    if (inv.attuned) attuned++;
    if (!inv.equipped || (m.attunement && !inv.attuned)) continue;
    const origin: Origin = { kind: 'core', name: inv.name };
    const add = (effect: Effect) => granted.push({ effect, origin, owner: `item:${inv.uid}` });
    for (const effect of m.effects ?? []) add(effect);
    // A "+N" variant's bonuses apply through its base weapon or armor instead.
    if (m.variantOf) continue;
    if (m.bonus?.ac) add({ type: 'acBonus', value: m.bonus.ac });
    if (m.bonus?.save) add({ type: 'saveBonus', value: m.bonus.save });
    if (m.abilitySet) add({ type: 'abilitySet', ability: m.abilitySet.ability, value: m.abilitySet.value });
  }
  if (attuned > 3) warnings.push(`Attuned to ${attuned} items; the limit is 3.`);
  const effects = granted.map((e) => e.effect);

  // Abilities: apply bonuses in order, respecting per-source caps.
  const scores = { ...character.baseAbilities };
  for (const e of effects)
    if (e.type === 'abilityBonus') scores[e.ability] = Math.min(e.max ?? 20, scores[e.ability] + e.value);
  for (const e of effects) if (e.type === 'abilitySet') scores[e.ability] = Math.max(scores[e.ability], e.value);

  const saveProf = new Set(effects.flatMap((e) => (e.type === 'save' ? [e.ability] : [])));
  const saveBonus = effects.reduce((s, e) => s + (e.type === 'saveBonus' ? e.value : 0), 0);
  const abilities = Object.fromEntries(
    ABILITIES.map((a) => {
      const m = mod(scores[a]);
      return [a, { score: scores[a], mod: m, saveProf: saveProf.has(a), save: m + (saveProf.has(a) ? pb : 0) + saveBonus }];
    }),
  ) as Sheet['abilities'];

  const skillProf = new Set<string>();
  const skillExp = new Set<string>();
  for (const e of effects)
    if (e.type === 'skill') (e.expertise ? skillExp : skillProf).add(e.skill);
  const halfProf = effects.some((e) => e.type === 'halfProficiency');
  const skills: SkillLine[] = SKILL_IDS.map((id) => {
    const { name, ability } = SKILLS[id];
    const proficient = skillProf.has(id) || skillExp.has(id);
    const expertise = skillExp.has(id) && proficient;
    const extra = expertise ? pb * 2 : proficient ? pb : halfProf ? Math.floor(pb / 2) : 0;
    return { id, name, ability, proficient, expertise, bonus: abilities[ability].mod + extra };
  });
  const passive = (skill: 'perception' | 'investigation' | 'insight') =>
    10 + skills.find((s) => s.id === skill)!.bonus + effects.reduce((s, e) => s + (e.type === 'passiveBonus' && e.skill === skill ? e.value : 0), 0);
  const passives = { perception: passive('perception'), investigation: passive('investigation'), insight: passive('insight') };
  const passivePerception = passives.perception;

  // Equipment.
  const equipped = character.inventory
    .filter((i) => i.equipped && i.itemId)
    .map((i) => ({ inv: i, item: reg.items.get(i.itemId!) }))
    .filter((x): x is { inv: (typeof x)['inv']; item: ItemDef } => Boolean(x.item));
  const armorEq = equipped.find((x) => x.item.armor && x.item.armor.type !== 'shield');
  const shieldEq = equipped.find((x) => x.item.armor?.type === 'shield');
  const armor = armorEq?.item;
  const shield = shieldEq?.item;
  /** Bonus from a "+N" variant applied to an equipped base item. */
  const variantBonus = (inv: Character['inventory'][number] | undefined) => {
    const m = inv ? magicOf(inv) : undefined;
    // Also a magic weapon with its own stats (its AC bonus is already an acBonus effect).
    const ownWeapon = Boolean(inv?.itemId && !inv.magicId && reg.items.get(inv.itemId)?.weapon);
    return m && (m.variantOf || ownWeapon) && (!m.attunement || inv?.attuned) ? (m.bonus ?? {}) : {};
  };

  const armorTraining = new Set<ArmorTraining>(effects.flatMap((e) => (e.type === 'armor' ? [e.armor] : [])));
  if (armor && !armorTraining.has(armor.armor!.type as ArmorTraining))
    warnings.push(`Not trained with ${armor.name}: Disadvantage on Str/Dex checks, saves and attacks; can't cast spells.`);
  if (shield && !armorTraining.has('shield')) warnings.push('Not trained with Shields.');

  // AC: best of armor or any unarmored formula.
  const dex = abilities.dex.mod;
  let ac: number;
  let acNote: string;
  if (armor?.armor) {
    const a = armor.armor;
    const dexCap =
      a.type === 'medium'
        ? Math.max(a.dexMax ?? 2, ...effects.map((e) => (e.type === 'armorDexMax' ? e.value : 0)))
        : a.dexMax;
    ac = a.base + (dexCap === null ? dex : Math.min(dex, dexCap)) + (variantBonus(armorEq?.inv).ac ?? 0);
    acNote = armorEq!.inv.name;
  } else {
    ac = 10 + dex;
    acNote = 'Unarmored';
    for (const e of effects)
      if (e.type === 'acFormula' && (!shield || e.allowShield)) {
        const v = e.base + e.abilities.reduce((s, ab) => s + abilities[ab].mod, 0);
        if (v > ac) {
          ac = v;
          acNote = e.name;
        }
      }
  }
  if (shield) {
    ac += shield.armor!.base + (variantBonus(shieldEq?.inv).ac ?? 0);
    acNote += ` + ${shieldEq!.inv.name}`;
  }
  const meleeWeapons = equipped.filter((x) => x.item.weapon?.kind === 'melee');
  const floor = Math.max(0, ...effects.map((e) => (e.type === 'acFloor' ? e.value : 0)));
  for (const e of effects)
    if (e.type === 'acBonus' && (!e.whileArmored || armor) && (!e.whileDualWielding || meleeWeapons.length >= 2)) {
      ac += e.value;
      acNote += ` +${e.value}`;
    }
  if (floor > ac) {
    ac = floor;
    acNote += ` (minimum ${floor})`;
  }

  // Speed.
  let speed = reg.species.get(character.speciesId)?.speed ?? 30;
  for (const e of effects) if (e.type === 'speed') speed = Math.max(speed, e.value);
  for (const g of granted) {
    const e = g.effect;
    if (e.type !== 'speedBonus') continue;
    if (e.unarmored && (armor || shield)) continue;
    if (e.notHeavy && armor?.armor?.type === 'heavy') continue;
    let v = e.value;
    if (e.valueKey && g.origin.classId) {
      const row = reg.classes.get(g.origin.classId)?.levels[(c.classLevels.get(g.origin.classId) ?? 1) - 1];
      v = Number(row?.extras[e.valueKey] ?? 0);
    }
    speed += v;
  }

  const species = reg.species.get(character.speciesId);
  const size =
    [...effects].reverse().find((e): e is Extract<typeof e, { type: 'size' }> => e.type === 'size')?.size ??
    species?.size ??
    'Medium';
  let darkvision = Math.max(0, ...effects.map((e) => (e.type === 'darkvision' && !e.extend ? e.range : 0)));
  for (const e of effects) if (e.type === 'darkvision' && e.extend) darkvision = darkvision ? darkvision + e.extend : e.range;
  const initiative =
    dex +
    (effects.some((e) => e.type === 'initiativeProf') ? pb : 0) +
    effects.reduce((s, e) => s + (e.type === 'initiativeBonus' ? (e.value ?? 0) + (e.ability ? abilities[e.ability].mod : 0) : 0), 0);
  const senses = [
    ...(darkvision ? [{ sense: 'darkvision', range: darkvision }] : []),
    ...Object.entries(
      effects.reduce<Record<string, number>>((m, e) => (e.type === 'sense' ? { ...m, [e.sense]: Math.max(m[e.sense] ?? 0, e.range) } : m), {}),
    ).map(([sense, range]) => ({ sense, range })),
  ];

  // Hit points and hit dice.
  const conMod = abilities.con.mod;
  let maxHp = 0;
  const dice = new Map<string, number>();
  character.levels.forEach((entry, i) => {
    const hd = reg.classes.get(entry.classId)?.hitDie ?? 8;
    maxHp += (i === 0 ? hd : entry.hpGain) + conMod;
    dice.set(`d${hd}`, (dice.get(`d${hd}`) ?? 0) + 1);
  });
  for (const e of effects)
    if (e.type === 'hpPerLevel') maxHp += e.value * (e.classId ? (c.classLevels.get(e.classId) ?? 0) : c.totalLevel);
  for (const e of effects) if (e.type === 'hpBonus') maxHp += e.value;
  maxHp = Math.max(c.totalLevel ? 1 : 0, maxHp);

  // Proficiency lists.
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const weaponsProf = uniq(effects.flatMap((e) => (e.type === 'weapon' ? [e.weapon] : [])));
  const tools = uniq(effects.flatMap((e) => (e.type === 'tool' ? [e.tool] : [])));
  const languages = uniq(effects.flatMap((e) => (e.type === 'language' ? [e.language] : [])));
  const resistances = uniq(effects.flatMap((e) => (e.type === 'resistance' ? [e.damage] : [])));

  // Exhaustion and conditions.
  const exhaustion = character.play.exhaustion ?? 0;
  let d20Penalty = 0;
  const conditionNotes: string[] = [];
  if (exhaustion && reg.data.edition === '2024') {
    d20Penalty = 2 * exhaustion;
    speed = Math.max(0, speed - 5 * exhaustion);
    conditionNotes.push(`Exhaustion ${exhaustion}: −${d20Penalty} to d20 Tests, Speed −${5 * exhaustion} ft.`);
  } else if (exhaustion) {
    const notes = ['Disadvantage on ability checks'];
    if (exhaustion >= 2) speed = Math.floor(speed / 2);
    if (exhaustion >= 3) notes.push('Disadvantage on attack rolls and saving throws');
    if (exhaustion >= 4) maxHp = Math.floor(maxHp / 2);
    if (exhaustion >= 5) speed = 0;
    conditionNotes.push(`Exhaustion ${exhaustion}: ${notes.join('; ')}${exhaustion >= 2 ? '; speed reduced' : ''}${exhaustion >= 4 ? '; HP max halved' : ''}.`);
  }
  const CONDITION_NOTES: Record<string, string> = {
    poisoned: 'Poisoned: Disadvantage on attack rolls and ability checks.',
    prone: 'Prone: Disadvantage on attack rolls; melee attacks against you have Advantage.',
    frightened: 'Frightened: Disadvantage on checks and attacks while the source is in sight.',
    restrained: 'Restrained: Speed 0; Disadvantage on attacks and Dexterity saves.',
    blinded: 'Blinded: Disadvantage on attack rolls; attacks against you have Advantage.',
    grappled: 'Grappled: Speed 0.',
    invisible: 'Invisible: Advantage on attack rolls; attacks against you have Disadvantage.',
  };
  for (const cond of character.play.conditions) if (CONDITION_NOTES[cond]) conditionNotes.push(CONDITION_NOTES[cond]);
  if (character.play.conditions.some((x) => ['grappled', 'restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(x))) speed = 0;

  const speeds = effects.flatMap((e) =>
    e.type === 'speedMode' ? [{ mode: e.mode, value: e.value === 'walk' ? speed : e.value, ...(e.hover ? { hover: true } : {}) }] : [],
  );
  const rollBonuses = { attack: [] as string[], save: [] as string[], check: [] as string[] };
  for (const e of effects) if (e.type === 'rollBonus') rollBonuses[e.applies].push(e.dice);

  // Weapon masteries.
  const masteries = uniq(c.choices.filter((ch) => ch.choice.kind === 'weaponMastery').flatMap((ch) => ch.values));

  // Attacks.
  const rangedBonus = effects.reduce((s, e) => s + (e.type === 'rangedAttackBonus' ? e.value : 0), 0);
  const monkLevel = c.classLevels.get('monk') ?? 0;
  const martialDie = monkLevel
    ? Number(reg.classes.get('monk')?.levels[monkLevel - 1]?.extras.martial_arts_die ?? 6)
    : 0;
  const isMonkWeapon = (w: NonNullable<ItemDef['weapon']>) =>
    w.kind === 'melee' && (w.category === 'simple' || w.properties.includes('light'));
  const attacks: Attack[] = equipped
    .filter((x) => x.item.weapon)
    .map(({ inv, item }) => {
      const w = item.weapon!;
      const proficient = weaponsProf.includes(w.category) || weaponsProf.includes(item.id);
      const finesse = w.properties.includes('finesse');
      let abilityMod =
        w.kind === 'ranged' ? dex : finesse ? Math.max(abilities.str.mod, dex) : abilities.str.mod;
      let die = w.damage;
      if (monkLevel && isMonkWeapon(w)) {
        abilityMod = Math.max(abilities.str.mod, dex, abilityMod);
        if (dieAverage(`1d${martialDie}`) > dieAverage(die)) die = `1d${martialDie}`;
      }
      const magic = variantBonus(inv);
      const twoHanded = w.properties.includes('two-handed');
      const flatDamage =
        abilityMod +
        (magic.damage ?? 0) +
        effects.reduce(
          (s, e) =>
            s +
            (e.type === 'damageBonus' &&
            (e.when === 'all' || (e.when === 'oneHandedMelee' && w.kind === 'melee' && !twoHanded && meleeWeapons.length === 1))
              ? e.value
              : 0),
          0,
        );
      const thrownBonus = w.properties.includes('thrown')
        ? effects.reduce((s, e) => s + (e.type === 'damageBonus' && e.when === 'thrown' ? e.value : 0), 0)
        : 0;
      const bonus = abilityMod + (proficient ? pb : 0) + (w.kind === 'ranged' ? rangedBonus : 0) + (magic.attack ?? 0);
      const range = w.range ? `${w.range.normal}/${w.range.long ?? w.range.normal} ft.` : 'Melee 5 ft.';
      return {
        id: inv.uid,
        name: inv.name,
        bonus,
        damage: `${die}${flatDamage ? fmtMod(flatDamage) : ''}`,
        damageType: w.damageType,
        kind: w.kind,
        finesseOrRanged: finesse || w.kind === 'ranged',
        strBased: w.kind === 'melee' && abilityMod === abilities.str.mod && !(finesse && dex > abilities.str.mod),
        ...(thrownBonus ? { thrownBonus } : {}),
        range: w.kind === 'melee' && w.range ? `5 ft. / thrown ${range}` : range,
        // Versatile is listed once, with its two-handed die: "versatile (1d10)".
        properties: w.versatile ? [...w.properties.filter((p) => p !== 'versatile'), `versatile (${w.versatile})`] : w.properties,
        mastery: w.mastery && masteries.includes(item.id) ? w.mastery : undefined,
        notes: proficient ? undefined : 'Not proficient',
      };
    });
  const unarmedMod = monkLevel ? Math.max(abilities.str.mod, dex) : abilities.str.mod;
  attacks.push({
    id: 'unarmed',
    name: 'Unarmed Strike',
    bonus: unarmedMod + pb,
    damage: monkLevel ? `1d${martialDie}${unarmedMod ? fmtMod(unarmedMod) : ''}` : `${Math.max(1, 1 + unarmedMod)}`,
    damageType: 'bludgeoning',
    range: 'Melee 5 ft.',
    properties: [],
    kind: 'melee',
    finesseOrRanged: false,
    strBased: unarmedMod === abilities.str.mod,
  });

  // Damage riders (Sneak Attack, Rage, Divine Smite, Hunter's Mark...).
  const riders: Rider[] = [];
  const riderLevel = new Map<string, number>();
  for (const g of granted) {
    const e = g.effect;
    if (e.type !== 'damageRider') continue;
    const min = e.minLevel ?? 0;
    if (scopeLevel(g.origin, c) < min || (riderLevel.get(e.id) ?? -1) >= min) continue;
    riderLevel.set(e.id, min);
    const existing = riders.findIndex((r) => r.id === e.id);
    if (existing >= 0) riders.splice(existing, 1);
    let dice = e.dice ?? '';
    if (e.valueKey && g.origin.classId) {
      const row = reg.classes.get(g.origin.classId)?.levels[(c.classLevels.get(g.origin.classId) ?? 1) - 1];
      const v = row?.extras[e.valueKey];
      dice = typeof v === 'number' ? String(v) : (v ?? '');
    }
    if (!dice && !e.perSlot) continue;
    riders.push({ id: e.id, label: e.label, dice, when: e.when ?? 'any', auto: Boolean(e.auto), ...(e.perSlot ? { perSlot: e.perSlot } : {}) });
  }

  // Spellcasting.
  const casters: CasterInfo[] = [];
  let casterLevel = 0;
  let casterClasses = 0;
  let pactSlots: Sheet['pactSlots'] = null;
  let singleTableSlots: number[] | undefined;
  for (const classId of c.classOrder) {
    const cls = reg.classes.get(classId);
    const lvl = c.classLevels.get(classId) ?? 0;
    if (!cls) continue;
    // Subclass casting (Eldritch Knight, Arcane Trickster) when the class itself has none.
    const subCasting = !cls.spellcasting ? reg.subclasses.get(character.subclasses[classId] ?? '')?.spellcasting : undefined;
    const spellcasting = cls.spellcasting ?? (subCasting && lvl >= cls.subclassLevel ? { ability: subCasting.ability, progression: 'third' as const } : undefined);
    if (!spellcasting) continue;
    const row = cls.spellcasting ? cls.levels[lvl - 1] : subCasting!.levels[lvl - 1];
    const ability = spellcasting.ability;
    const m = abilities[ability].mod;
    const bonusCantrips = effects.reduce(
      (s, e) => s + (e.type === 'cantripBonus' && e.classId === classId ? e.value : 0),
      0,
    );
    const rowSlots = row?.slots ?? [];
    const maxSpellLevel = rowSlots.reduce((mx, n, i) => (n > 0 ? i + 1 : mx), 0);
    // 2014 Paladin/Ranger at level 1: no spellcasting yet.
    if (!maxSpellLevel && !row?.cantrips) continue;
    const formula = cls.spellcasting?.preparedFormula;
    const prepared = formula ? Math.max(1, Math.floor(lvl / formula.levelDivisor) + m) : (row?.prepared ?? 0);
    casters.push({
      classId,
      list: subCasting ? subCasting.list : classId,
      name: cls.name,
      ability,
      saveDc: 8 + pb + m,
      attack: pb + m,
      cantrips: (row?.cantrips ?? 0) + bonusCantrips,
      prepared,
      known: Boolean(cls.spellcasting?.spellsKnown),
      maxSpellLevel,
    });
    const prog = spellcasting.progression;
    if (prog === 'pact') {
      pactSlots = { count: rowSlots.reduce((a, b) => a + b, 0), level: maxSpellLevel };
    } else {
      casterClasses++;
      singleTableSlots = rowSlots;
      // 2024 rounds half casters up when multiclassing; 2014 rounds down.
      const half = reg.data.edition === '2014' ? Math.floor(lvl / 2) : Math.ceil(lvl / 2);
      casterLevel += prog === 'full' ? lvl : prog === 'half' ? half : Math.floor(lvl / 3);
    }
  }
  const slots = Array(9).fill(0);
  const table = casterClasses > 1 ? MULTICLASS_SLOTS[Math.min(20, casterLevel) - 1] : singleTableSlots;
  (table ?? []).forEach((n, i) => (slots[i] = n));

  // Known spells: class picks + always-prepared/innate from effects.
  const known: KnownSpell[] = [];
  const seen = new Set<string>();
  const pushSpell = (s: KnownSpell) => {
    const k = `${s.via}:${s.spell.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    known.push(s);
  };
  for (const g of granted) {
    const e = g.effect;
    if (e.type !== 'spell') continue;
    const sp = reg.spells.get(e.spell);
    if (!sp) continue;
    if (e.minLevel && scopeLevel(g.origin, c) < e.minLevel) continue;
    const ability =
      e.ability && typeof e.ability === 'object' ? (resolveRef(e.ability.fromChoice, g.owner, c.resolved)[0] as Ability) : e.ability;
    const classId = g.origin.classId;
    const viaCaster = classId && casters.find((k) => k.classId === classId);
    pushSpell({
      spell: sp,
      via: g.origin.kind === 'class' || g.origin.kind === 'subclass' ? (classId ?? g.origin.kind) : g.origin.kind,
      viaName: g.origin.name,
      alwaysPrepared: true,
      ability: ability ?? (viaCaster ? viaCaster.ability : undefined),
      ...(e.note ? { note: e.note } : {}),
    });
  }
  for (const caster of casters) {
    const picks = character.spells[caster.classId];
    for (const id of [...(picks?.cantrips ?? []), ...(picks?.prepared ?? [])]) {
      const sp = reg.spells.get(id);
      if (sp) pushSpell({ spell: sp, via: caster.classId, viaName: caster.name, alwaysPrepared: false, ability: caster.ability });
    }
  }
  known.sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));

  // Counters from class tables.
  const counters: Counter[] = [];
  for (const classId of c.classOrder) {
    const cls = reg.classes.get(classId);
    const row = cls?.levels[(c.classLevels.get(classId) ?? 1) - 1];
    for (const [k, v] of Object.entries(row?.extras ?? {})) {
      const meta = COUNTER_EXTRAS[k];
      if (meta && typeof v === 'number' && v > 0) counters.push({ id: `${classId}:${k}`, label: meta.label, max: v, reset: meta.reset });
    }
    if (classId === 'bard')
      counters.push({ id: 'bard:inspiration', label: 'Bardic Inspiration', max: Math.max(1, abilities.cha.mod), reset: (c.classLevels.get('bard') ?? 0) >= 5 ? 'short' : 'long' });
    if (classId === 'druid' && reg.data.edition === '2014' && (c.classLevels.get('druid') ?? 0) >= 2)
      counters.push({ id: 'druid:wild_shape_uses', label: 'Wild Shape', max: 2, reset: 'short' });
    if (classId === 'paladin')
      counters.push({ id: 'paladin:lay-on-hands', label: 'Lay on Hands (HP pool)', max: 5 * (c.classLevels.get('paladin') ?? 0), reset: 'long' });
  }

  // Resources granted by features (Superiority Dice, Healing Hands...).
  const resourceMap = new Map<string, { counter: Counter; minLevel: number }>();
  for (const g of granted) {
    const e = g.effect;
    if (e.type !== 'resource') continue;
    const minLevel = e.minLevel ?? 0;
    if (scopeLevel(g.origin, c) < minLevel) continue;
    const prev = resourceMap.get(e.id);
    if (prev && prev.minLevel > minLevel) continue;
    const max = e.max === 'pb' ? pb : typeof e.max === 'number' ? e.max : Math.max(1, abilities[e.max.ability].mod);
    resourceMap.set(e.id, { counter: { id: `res:${e.id}`, label: e.label, max, reset: e.reset }, minLevel });
  }
  counters.push(...[...resourceMap.values()].map((x) => x.counter));

  const classSummary = c.classOrder
    .map((id) => {
      const sub = reg.subclasses.get(character.subclasses[id] ?? '');
      return `${reg.classes.get(id)?.name ?? id} ${c.classLevels.get(id)}${sub ? ` (${sub.name})` : ''}`;
    })
    .join(' / ');

  return {
    collected: c,
    speeds,
    senses,
    passives,
    rollBonuses,
    d20Penalty,
    riders,
    toggles,
    concentration: toggles.find((t) => t.concentration && active.has(t.id)) ?? null,
    conditionNotes,
    attuned,
    level,
    profBonus: pb,
    classSummary,
    abilities,
    skills,
    passivePerception,
    initiative,
    speed,
    size,
    darkvision,
    ac,
    acNote,
    maxHp,
    hitDice: [...dice.entries()].map(([die, total]) => ({ die, total })),
    resistances,
    proficiencies: { armor: [...armorTraining], weapons: weaponsProf, tools, languages },
    attacks,
    masteries,
    casters,
    slots,
    pactSlots,
    spells: known,
    features: c.features,
    counters,
    warnings,
  };
}

function scopeLevel(origin: Origin, c: Collected) {
  return origin.classId && (origin.kind === 'class' || origin.kind === 'subclass')
    ? (c.classLevels.get(origin.classId) ?? 0)
    : c.totalLevel;
}

function dieAverage(expr: string) {
  const m = expr.match(/(\d+)d(\d+)/);
  return m ? (+m[1] * (+m[2] + 1)) / 2 : Number(expr) || 0;
}
