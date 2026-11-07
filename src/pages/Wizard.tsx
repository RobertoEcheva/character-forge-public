import { Fragment, useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChoicesPanel } from '../components/Choices';
import { FeatureList } from '../components/Features';
import { SpellPicker } from '../components/SpellPicker';
import { SubclassPicker } from '../components/SubclassPicker';
import { pendingChoices, type ChoiceInstance } from '../engine/collect';
import { deriveSheet, fmtMod, type Sheet } from '../engine/derive';
import { addLevel, applyStartingBundle, isCustomPick } from '../engine/ops';
import { BlazonPicker, BlazonShield } from '../components/Blazon';
import { blazonOf, describeBlazon } from '../data/blazon';
import { RichText } from '../keywords/RichText';
import { RulesProvider, useCharacter, useRules } from '../state/AppState';
import type { Character } from '../types/character';
import { ABILITIES, ABILITY_NAMES, type Edition, type EquipmentBundle, type ItemDef } from '../types/rules';

const STEPS = ['ruleset', 'class', 'background', 'species', 'abilities', 'spells', 'details', 'review'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  ruleset: 'Rule set',
  class: 'Class',
  background: 'Background',
  species: 'Species',
  abilities: 'Ability scores',
  spells: 'Spells',
  details: 'Details',
  review: 'Review',
};
const stepLabel = (s: Step, edition: Edition) => (s === 'species' && edition === '2014' ? 'Race' : STEP_LABELS[s]);

const byPrefix = (...prefixes: string[]) => (c: ChoiceInstance) => prefixes.some((p) => c.key.startsWith(p));
const CLASS_CHOICES = byPrefix('class:', 'feat@class:', 'subclass:', 'feat@subclass:');
const isAsi = (c: ChoiceInstance) => c.choice.kind === 'asi' && (c.key.startsWith('background:') || c.key.startsWith('species:'));
const BACKGROUND_CHOICES = (c: ChoiceInstance) => byPrefix('background:', 'feat@background')(c) && !isAsi(c);
const SPECIES_CHOICES = (c: ChoiceInstance) => byPrefix('species:', 'feat@species')(c) && !isAsi(c);

/** Removes choice keys under the given prefixes. */
function dropChoices(c: Character, ...prefixes: string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(c.choices).filter(([k]) => !prefixes.some((p) => k.startsWith(p))));
}

export function stepComplete(step: Step, c: Character, sheet: Sheet): boolean {
  const pending = pendingChoices(sheet.collected);
  switch (step) {
    case 'ruleset':
      return c.levels.length > 0;
    case 'class':
      return c.levels.length > 0 && !pending.some(CLASS_CHOICES);
    case 'background':
      return Boolean(c.backgroundId) && !pending.some(BACKGROUND_CHOICES);
    case 'species':
      return Boolean(c.speciesId) && !pending.some(SPECIES_CHOICES);
    case 'abilities':
      return Boolean(c.backgroundId && c.speciesId) && !pending.some(isAsi);
    case 'spells':
      return sheet.casters.every((k) => {
        const p = c.spells[k.classId];
        return (p?.cantrips.length ?? 0) >= k.cantrips && (p?.prepared.length ?? 0) >= k.prepared;
      });
    case 'details':
      return Boolean(c.name.trim()) && !pending.some((p) => p.key === 'core:languages');
    case 'review':
      return false;
  }
}

export default function Wizard() {
  const { id } = useParams();
  const [character] = useCharacter(id);
  if (!character) return <Navigate to="/" replace />;
  return (
    <RulesProvider edition={character.ruleset}>
      <WizardSteps />
    </RulesProvider>
  );
}

function WizardSteps() {
  const { id, step } = useParams();
  const [character, update] = useCharacter(id);
  const { registry, edition } = useRules();
  const navigate = useNavigate();
  const sheet = useMemo(() => (character ? deriveSheet(character, registry) : null), [character, registry]);
  if (!character || !sheet) return <Navigate to="/" replace />;
  const fallback: Step = character.levels.length ? 'class' : 'ruleset';
  const current = step && (STEPS as readonly string[]).includes(step) ? (step as Step) : fallback;
  const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s, stepLabel(s, edition)])) as Record<Step, string>;
  const steps = STEPS.filter((s) => s !== 'spells' || sheet.casters.length > 0);
  const idx = steps.indexOf(current);
  const go = (s: Step) => navigate(`/c/${character.id}/build/${s}`);
  const set = (c: Character) => update(() => c);

  return (
    <div className="wizard">
      <ol className="steps" aria-label="Character creation steps">
        {steps.map((s) => (
          <li key={s}>
            <button type="button" aria-current={s === current ? 'step' : undefined} className={stepComplete(s, character, sheet) ? 'done' : ''} onClick={() => go(s)}>
              {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>

      <main>
        {current === 'ruleset' && <RulesetStep c={character} sheet={sheet} set={set} />}
        {current === 'class' && <ClassStep c={character} sheet={sheet} set={set} />}
        {current === 'background' && <BackgroundStep c={character} sheet={sheet} set={set} />}
        {current === 'species' && <SpeciesStep c={character} sheet={sheet} set={set} />}
        {current === 'abilities' && <AbilitiesStep c={character} sheet={sheet} set={set} />}
        {current === 'spells' && <SpellsStep c={character} sheet={sheet} set={set} />}
        {current === 'details' && <DetailsStep c={character} sheet={sheet} set={set} />}
        {current === 'review' && <ReviewStep c={character} sheet={sheet} steps={steps} go={go} />}
        <div className="step-nav">
          {idx > 0 ? <button type="button" onClick={() => go(steps[idx - 1])}>Back: {STEP_LABEL[steps[idx - 1]]}</button> : <span />}
          {idx < steps.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => go(steps[idx + 1])}>
              Next: {STEP_LABEL[steps[idx + 1]]}
            </button>
          ) : (
            <Link className="btn btn-primary" to={`/c/${character.id}`}>Open character sheet</Link>
          )}
        </div>
      </main>

      <Summary c={character} sheet={sheet} />
    </div>
  );
}

interface StepProps {
  c: Character;
  sheet: Sheet;
  set: (c: Character) => void;
}

function StepHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="step-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

function Picker<T extends { id: string; name: string; source: string; unverified?: boolean }>({
  items,
  selected,
  onSelect,
  sub,
}: {
  items: T[];
  selected: string;
  onSelect: (id: string) => void;
  sub?: (x: T) => string;
}) {
  return (
    <div className="picker">
      {items.map((x) => (
        <button key={x.id} type="button" className="pick" aria-pressed={x.id === selected} onClick={() => onSelect(x.id)}>
          <strong>{x.name}</strong>
          {sub && <small>{sub(x)}</small>}
          {x.source === 'custom' && <span className="tag tag-custom">Custom</span>}
          {x.unverified && <span className="tag tag-unverified">Unverified</span>}
        </button>
      ))}
    </div>
  );
}

/** Choice key / inventory tag per equipment group; single-group lists keep the plain tag. */
const equipTag = (tag: string, i: number, n: number) => (n === 1 ? tag : `${tag}:${i}`);

/** Gold granted by the bundles currently chosen for a tag. */
function chosenGold(c: Character, tag: string, groups: EquipmentBundle[][]) {
  return groups.reduce((sum, g, i) => sum + (g.find((b) => b.label === c.choices[`equip:${equipTag(tag, i, groups.length)}`]?.[0])?.gp ?? 0), 0);
}

const NUMBER_WORDS = ['', 'a', 'two', 'three', 'four', 'five'];
const plural = (w: string) => (w.endsWith('us') ? `${w.slice(0, -2)}i` : `${w}s`);
const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');

/** "a martial weapon", "two martial weapons", "5 × Javelin", "10 GP". */
function describeBundle(b: EquipmentBundle) {
  const parts = b.items.map((i) => {
    if (!i.choose) return i.count > 1 ? `${i.count} × ${i.name}` : i.name;
    const w = i.choose.label;
    return i.count === 1 ? `${article(w)} ${w}` : `${NUMBER_WORDS[i.count] ?? i.count} ${plural(w)}`;
  });
  if (b.gp) parts.push(`${b.gp} GP`);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Box title from what the options hold. Only a choice between things of one kind gets that kind's name
 * (Weapons, Armor…); a choice between a whole kit and gold is "Starting gear".
 */
function groupTitle(bundles: EquipmentBundle[], registry: ReturnType<typeof useRules>['registry']) {
  const cats = new Set(
    bundles.flatMap((b) => b.items.map((i) => registry.items.get(i.item || i.choose?.options[0] || '')?.category)),
  );
  const goldOnly = bundles.some((b) => b.items.length === 0 && b.gp);
  const names: Record<string, string> = { weapon: 'Weapons', armor: 'Armor', pack: 'Pack', focus: 'Spellcasting focus', tool: 'Tools' };
  const [only] = [...cats];
  return !goldOnly && cats.size === 1 && only && names[only] ? names[only] : 'Starting gear';
}

const CUSTOM_PICK = 'custom:';

/** One line about a picked item: weapon damage and properties, or the first sentence of its description. */
function itemInfo(item?: ItemDef) {
  if (!item) return '';
  if (item.weapon) {
    const w = item.weapon;
    const props = [...new Set(w.properties)].filter((p) => !(w.versatile && /^versatile$/i.test(p)));
    return [`${w.damage} ${w.damageType}`, ...props, w.versatile && !props.some((p) => /versatile/i.test(p)) ? `versatile (${w.versatile})` : '']
      .filter(Boolean)
      .join(', ');
  }
  if (item.armor) return item.armor.type === 'shield' ? `+${item.armor.base} AC` : `${item.armor.type} armor, AC ${item.armor.base}`;
  const first = item.description?.split(/(?<=\.)\s/)[0] ?? '';
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/** Saved picks for each "of your choice" item of a bundle. */
const pickKey = (key: string, b: EquipmentBundle, i: number) => `${key}:${b.label}:${i}`;
const bundlePicks = (c: Character, key: string, b: EquipmentBundle) =>
  Object.fromEntries(b.items.map((_, i) => [i, c.choices[pickKey(key, b, i)] ?? []]));

/** Starting equipment: fixed items, plus independent "this or that" choices, each in its own box. */
function EquipmentChoice({
  c,
  set,
  tag,
  groups,
}: {
  c: Character;
  set: (c: Character) => void;
  tag: 'class' | 'background';
  groups: EquipmentBundle[][];
}) {
  const { registry } = useRules();
  const keyOf = (gi: number) => `equip:${equipTag(tag, gi, groups.length)}`;

  /** Choose bundle b for group gi (picks keep what was chosen before for that bundle). */
  const apply = (from: Character, gi: number, b: EquipmentBundle, picks = bundlePicks(from, keyOf(gi), b)) => {
    const key = keyOf(gi);
    const prevGp = groups[gi].find((x) => x.label === from.choices[key]?.[0])?.gp ?? 0;
    const next = applyStartingBundle(from, equipTag(tag, gi, groups.length), b, registry, prevGp, picks);
    const pickChoices = Object.fromEntries(Object.entries(picks).filter(([, v]) => v.length).map(([i, v]) => [pickKey(key, b, Number(i)), v]));
    return { ...next, choices: { ...next.choices, [key]: [b.label], ...pickChoices } };
  };

  // Groups with a single option are not a choice: add them as soon as the class or background is picked.
  const unapplied = groups.map((g, gi) => (g.length === 1 && !c.choices[keyOf(gi)] ? gi : -1)).filter((gi) => gi >= 0);
  useEffect(() => {
    if (unapplied.length) set(unapplied.reduce((acc, gi) => apply(acc, gi, groups[gi][0]), c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unapplied.join()]);

  if (!groups.some((g) => g.length)) return null;

  const setPick = (gi: number, b: EquipmentBundle, i: number, slot: number, id: string) => {
    const picks = bundlePicks(c, keyOf(gi), b);
    const slots = Array.from({ length: b.items[i].count }, (_, n) => picks[i][n] ?? '');
    slots[slot] = id;
    set(apply(c, gi, b, { ...picks, [i]: slots }));
  };

  const pickers = (gi: number, b: EquipmentBundle) =>
    b.items.flatMap((item, i) => {
      if (!item.choose) return [];
      const picked = c.choices[pickKey(keyOf(gi), b, i)] ?? [];
      const options = item.choose.options.map((id) => registry.items.get(id)).filter((x) => x !== undefined).sort((x, y) => x.name.localeCompare(y.name));
      const melee = options.filter((o) => o.weapon?.kind === 'melee');
      const ranged = options.filter((o) => o.weapon?.kind === 'ranged');
      // Spellcasting focuses come in any form the player likes, so they can also name their own.
      const isFocus = options.length > 0 && options.every((o) => o.category === 'focus');
      const list = (xs: typeof options) => xs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>);
      const what = `${article(item.choose.label)} ${item.choose.label}`;
      const slots = Array.from({ length: item.count }, (_, slot) => {
        const value = picked[slot] ?? '';
        const custom = value.startsWith(CUSTOM_PICK);
        const info = custom ? '' : itemInfo(registry.items.get(value));
        return (
          <span key={`${i}:${slot}`} className="equip-pick">
            <select
              value={custom ? CUSTOM_PICK : value}
              aria-label={`Choose ${what}`}
              onChange={(e) => setPick(gi, b, i, slot, e.target.value)}
            >
              <option value="">Choose {what}</option>
              {melee.length && ranged.length ? (
                <>
                  <optgroup label="Melee">{list(melee)}</optgroup>
                  <optgroup label="Ranged">{list(ranged)}</optgroup>
                </>
              ) : (
                list(options)
              )}
              {isFocus && <option value={CUSTOM_PICK}>Your own (describe it)</option>}
            </select>
            {custom && (
              <input
                aria-label={`Describe your ${item.choose!.label}`}
                placeholder={`e.g. a carved raven skull`}
                value={value.slice(CUSTOM_PICK.length)}
                onChange={(e) => setPick(gi, b, i, slot, CUSTOM_PICK + e.target.value)}
              />
            )}
            {info && <span className="equip-pick__info">{info}</span>}
          </span>
        );
      });
      return isFocus
        ? [
            ...slots,
            <details key={`${i}:help`} className="help">
              <summary>What is a spellcasting focus?</summary>
              <p>
                An object you hold to channel your spells. It replaces material components that have no listed cost, so you don't
                need a component pouch. Any of the forms listed works the same way; the choice is about how your character looks.
              </p>
            </details>,
          ]
        : slots;
    });

  const picksDone = (gi: number, b: EquipmentBundle) =>
    b.items.every(
      (item, i) =>
        !item.choose ||
        (c.choices[pickKey(keyOf(gi), b, i)] ?? []).filter((v) => (v.startsWith(CUSTOM_PICK) ? isCustomPick(v) : Boolean(v))).length >= item.count,
    );

  const fixed = groups.map((g, gi) => [g, gi] as const).filter(([g]) => g.length === 1);
  return (
    <>
      <h3>Starting equipment</h3>
      {fixed.length > 0 && (
        <div className="equip-included">
          <span className="field-label">You get</span>
          <ul>
            {fixed.map(([[b], gi]) => (
              <li key={gi}>
                {describeBundle(b)}
                {pickers(gi, b)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.map((bundles, gi) => {
        if (bundles.length < 2) return null;
        const chosen = bundles.find((b) => b.label === c.choices[keyOf(gi)]?.[0]);
        const done = chosen && picksDone(gi, chosen);
        return (
          <section key={gi} className={`choice ${done ? '' : 'incomplete'}`}>
            <div className="choice__head">
              <strong>{groupTitle(bundles, registry)}</strong>
              <span className="choice__count">{done ? 'Chosen' : chosen ? 'Pick below' : 'Choose one'}</span>
            </div>
            <div className="option-list">
              {bundles.map((b, bi) => (
                <Fragment key={b.label}>
                  {bi > 0 && <div className="equip-or" aria-hidden="true"><span>or</span></div>}
                  <button type="button" className="option" aria-pressed={b === chosen} onClick={() => b !== chosen && set(apply(c, gi, b))}>
                    {describeBundle(b)}
                  </button>
                  {b === chosen && b.items.some((i) => i.choose) && <div className="equip-picks">{pickers(gi, b)}</div>}
                </Fragment>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

const classGroups = (cls: { startingEquipment: EquipmentBundle[]; startingEquipmentGroups?: EquipmentBundle[][] }) =>
  cls.startingEquipmentGroups ?? [cls.startingEquipment];
const backgroundGroups = (bg: { equipment: EquipmentBundle[]; equipmentGroups?: EquipmentBundle[][] }) => bg.equipmentGroups ?? [bg.equipment];

function RulesetStep({ c, set }: StepProps) {
  const locked = c.levels.length > 0;
  const options: { id: Edition; title: string; text: string }[] = [
    { id: '2024', title: '2024 rules', text: 'The current edition (SRD 5.2): backgrounds give ability increases and an Origin feat, weapon mastery, species.' },
    { id: '2014', title: '2014 rules', text: 'The original fifth edition (SRD 5.1): races give ability increases, subraces, optional feats, spells known for some classes.' },
  ];
  return (
    <>
      <StepHead title="Choose a rule set">
        Pick the edition your table plays. Each character keeps its own rule set; you can have characters of both.
      </StepHead>
      <div className="picker picker--wide">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="pick"
            aria-pressed={c.ruleset === o.id}
            disabled={locked && c.ruleset !== o.id}
            onClick={() => set({ ...c, ruleset: o.id, speciesId: '', lineageId: undefined, backgroundId: '', choices: {} })}
          >
            <strong>{o.title}</strong>
            <small>{o.text}</small>
          </button>
        ))}
      </div>
      {locked && <p className="muted small">The rule set is fixed once a class is chosen. Create a new character to use the other edition.</p>}
    </>
  );
}

function ClassStep({ c, sheet, set }: StepProps) {
  const { registry } = useRules();
  const classId = c.levels[0]?.classId ?? '';
  const cls = registry.classes.get(classId);
  const choose = (id: string) => {
    if (id === classId) return;
    const base: Character = {
      ...c,
      levels: [],
      subclasses: {},
      spells: {},
      inventory: c.inventory.filter((i) => !i.notes?.startsWith('class')),
      coins: { ...c.coins, gp: Math.max(0, c.coins.gp - (cls ? chosenGold(c, 'class', classGroups(cls)) : 0)) },
      choices: dropChoices(c, 'class:', 'feat@class:', 'subclass:', 'feat@subclass:', 'equip:class'),
    };
    set(addLevel(base, id, registry));
  };
  return (
    <>
      <StepHead title="Choose a class">Your class shapes how you fight, what you're trained in, and which spells, if any, you cast.</StepHead>
      <Picker items={registry.data.classes} selected={classId} onSelect={choose} sub={(x) => [`d${x.hitDie}`, x.primaryAbilities.map((a) => a.toUpperCase()).join(x.primaryAbilitiesAll ? ' and ' : ' or ')].filter(Boolean).join(' · ')} />
      {cls && (
        <div className="detail">
          <h2>{cls.name}</h2>
          <p className="muted">
            Hit die d{cls.hitDie} · Saving throws {cls.saves.map((s) => ABILITY_NAMES[s]).join(' and ')}
            {cls.spellcasting && ` · Casts spells with ${ABILITY_NAMES[cls.spellcasting.ability]}`}
          </p>
          {cls.subclassLevel <= 1 && (
            <>
              <h3>Subclass</h3>
              <SubclassPicker character={c} classId={cls.id} onChange={set} />
            </>
          )}
          <h3>Your choices</h3>
          <ChoicesPanel character={c} sheet={sheet} filter={CLASS_CHOICES} onChange={set} />
          <EquipmentChoice c={c} set={set} tag="class" groups={classGroups(cls)} />
          <h3>Level 1 features</h3>
          <FeatureList features={cls.features.filter((f) => f.level === 1 && !f.hidden)} />
          <h3>Later levels</h3>
          <FeatureList features={cls.features.filter((f) => f.level > 1 && !f.hidden)} />
        </div>
      )}
    </>
  );
}

function BackgroundStep({ c, sheet, set }: StepProps) {
  const { registry, edition } = useRules();
  const bg = registry.backgrounds.get(c.backgroundId);
  const feat = bg?.feat ? registry.feats.get(bg.feat) : undefined;
  const choose = (id: string) => {
    if (id === c.backgroundId) return;
    const prevGp = bg ? chosenGold(c, 'background', backgroundGroups(bg)) : 0;
    set({
      ...c,
      backgroundId: id,
      inventory: c.inventory.filter((i) => !i.notes?.startsWith('background')),
      coins: { ...c.coins, gp: Math.max(0, c.coins.gp - prevGp) },
      choices: dropChoices(c, 'background:', 'feat@background', 'equip:background'),
    });
  };
  return (
    <>
      <StepHead title="Choose a background">
        {edition === '2024'
          ? 'Your background gives ability score increases, an Origin feat, two skills, and a tool.'
          : 'Your background gives skills, tools or languages, starting equipment, and a background feature.'}
      </StepHead>
      <Picker items={registry.data.backgrounds} selected={c.backgroundId} onSelect={choose} sub={(x) => (x.abilities ?? []).map((a) => a.toUpperCase()).join(', ')} />
      {bg && (
        <div className="detail">
          <h2>{bg.name}</h2>
          {bg.abilities?.length ? (
            <p className="muted">
              Ability scores: {bg.abilities.map((a) => ABILITY_NAMES[a]).join(', ')} (assigned on the Ability scores step)
            </p>
          ) : null}
          {bg.description && <RichText text={bg.description} />}
          <p>
            Proficiencies:{' '}
            {bg.effects
              .map((e) => (e.type === 'skill' ? sheet.skills.find((s) => s.id === e.skill)?.name : e.type === 'tool' ? registry.tools.get(e.tool)?.name ?? e.tool : ''))
              .filter(Boolean)
              .join(', ')}
          </p>
          {feat && (
            <>
              <h3>Origin feat: {feat.name}</h3>
              <RichText text={feat.description} />
            </>
          )}
          {bg.feature && (
            <>
              <h3>Feature: {bg.feature.name}</h3>
              <RichText text={bg.feature.description} />
            </>
          )}
          <h3>Your choices</h3>
          <ChoicesPanel character={c} sheet={sheet} filter={BACKGROUND_CHOICES} onChange={set} emptyText="Nothing to choose." />
          <EquipmentChoice c={c} set={set} tag="background" groups={backgroundGroups(bg)} />
        </div>
      )}
    </>
  );
}

function SpeciesStep({ c, sheet, set }: StepProps) {
  const { registry, edition } = useRules();
  const sp = registry.species.get(c.speciesId);
  const choose = (id: string) => {
    if (id === c.speciesId) return;
    set({ ...c, speciesId: id, lineageId: undefined, choices: dropChoices(c, 'species:', 'feat@species') });
  };
  return (
    <>
      {edition === '2024' ? (
        <StepHead title="Choose a species">Species sets your size, speed, and inborn traits.</StepHead>
      ) : (
        <StepHead title="Choose a race">Race sets your ability score increases, size, speed, languages, and inborn traits.</StepHead>
      )}
      <Picker items={registry.data.species} selected={c.speciesId} onSelect={choose} sub={(x) => `${x.sizeOptions?.join(' or ') ?? x.size} · ${x.speed} ft.`} />
      {sp && (
        <div className="detail">
          <h2>{sp.name}</h2>
          <p className="muted">
            {sp.creatureType} · {sp.sizeOptions?.join(' or ') ?? sp.size} · Speed {sp.speed} ft.
          </p>
          {/* Traits first: what the species gives decides which options make sense. */}
          <h3>Traits</h3>
          <FeatureList features={sp.traits.filter((t) => !t.hidden)} open />
          {sp.lineages && (
            <>
              <h3>{sp.lineageLabel}</h3>
              <div className="option-list">
                {sp.lineages.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="option"
                    aria-pressed={c.lineageId === l.id}
                    onClick={() => set({ ...c, lineageId: l.id, choices: dropChoices(c, 'feat@species') })}
                  >
                    <strong>{l.name}</strong>
                    <span className="small muted"> — {l.traits.map((t) => `${t.name}${t.level > 1 ? ` (level ${t.level})` : ''}`).join(', ')}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <h3>Your choices</h3>
          <ChoicesPanel character={c} sheet={sheet} filter={SPECIES_CHOICES} onChange={set} emptyText="Nothing to choose." />
        </div>
      )}
    </>
  );
}

function AbilitiesStep({ c, sheet, set }: StepProps) {
  const { registry, edition } = useRules();
  const cls = registry.classes.get(c.levels[0]?.classId ?? '');
  return (
    <>
      <StepHead title="Ability scores">
        Enter the six scores you rolled, bought, or were given.{' '}
        {edition === '2024' ? "Then assign your background's increases." : 'Your race and subrace increases are added automatically.'}
        {cls?.primaryAbilities.length ? ` ${cls.name}s rely most on ${cls.primaryAbilities.map((a) => ABILITY_NAMES[a]).join(cls.primaryAbilitiesAll ? ' and ' : ' or ')}.` : ''}
      </StepHead>
      <div className="abil-grid">
        {ABILITIES.map((a) => {
          const bonus = sheet.abilities[a].score - c.baseAbilities[a];
          return (
            <div key={a} className="abil-input">
              <label htmlFor={`ab-${a}`}>{ABILITY_NAMES[a]}</label>
              <input
                id={`ab-${a}`}
                type="number"
                min={1}
                max={30}
                value={c.baseAbilities[a]}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                  set({ ...c, baseAbilities: { ...c.baseAbilities, [a]: v } });
                }}
              />
              <span className="total">
                {sheet.abilities[a].score} ({fmtMod(sheet.abilities[a].mod)})
                {bonus > 0 && <span className="small muted"> incl. +{bonus}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <ChoicesPanel character={c} sheet={sheet} filter={isAsi} onChange={set} />
      {edition === '2024' && !c.backgroundId && <p className="muted">Choose a background to assign its ability increases.</p>}
    </>
  );
}

function SpellsStep({ c, sheet, set }: StepProps) {
  return (
    <>
      <StepHead title="Spells">
        {sheet.casters.some((k) => k.known)
          ? 'Pick your cantrips and the spells you know. You can change them later from your sheet.'
          : 'Pick your cantrips and the spells you have prepared. You can change prepared spells later from your sheet.'}
      </StepHead>
      {sheet.casters.map((k) => (
        <section key={k.classId} className="detail">
          <h2>{k.name} spells</h2>
          <SpellPicker character={c} caster={k} sheet={sheet} onChange={set} />
        </section>
      ))}
    </>
  );
}

function DetailsStep({ c, sheet, set }: StepProps) {
  const d = c.details;
  const field = (k: Exclude<keyof Character['details'], 'blazon'>, label: string, area = false) => (
    <div className="field">
      <label htmlFor={`d-${k}`}>{label}</label>
      {area ? (
        <textarea id={`d-${k}`} value={d[k]} onChange={(e) => set({ ...c, details: { ...d, [k]: e.target.value } })} />
      ) : (
        <input id={`d-${k}`} value={d[k]} onChange={(e) => set({ ...c, details: { ...d, [k]: e.target.value } })} />
      )}
    </div>
  );
  return (
    <>
      <StepHead title="Details">Name your character and fill in whatever else helps you play them.</StepHead>
      <div className="field">
        <label htmlFor="d-name">Name</label>
        <input id="d-name" value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} style={{ fontSize: '1.25rem' }} />
      </div>
      <ChoicesPanel character={c} sheet={sheet} filter={(x) => x.key === 'core:languages'} onChange={set} />
      <AlignmentGrid value={d.alignment} onChange={(alignment) => set({ ...c, details: { ...d, alignment } })} />
      <section className="field">
        <span className="label">Coat of arms</span>
        <p className="small muted">Shown on your character list and your sheet.</p>
        <BlazonPicker value={blazonOf(c)} onChange={(blazon) => set({ ...c, details: { ...d, blazon } })} />
      </section>
      {field('appearance', 'Appearance', true)}
      {field('personality', 'Personality', true)}
      {field('backstory', 'Backstory', true)}
    </>
  );
}

const ALIGNMENTS = [
  ['Lawful good', 'Neutral good', 'Chaotic good'],
  ['Lawful neutral', 'Neutral', 'Chaotic neutral'],
  ['Lawful evil', 'Neutral evil', 'Chaotic evil'],
];

/** 3×3 alignment grid (law–chaos across, good–evil down). Click the chosen one again to clear it. */
function AlignmentGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = ALIGNMENTS.flat().some((a) => a.toLowerCase() === value.trim().toLowerCase());
  return (
    <div className="field">
      <span className="label" id="align-label">
        Alignment
      </span>
      <div className="align-grid" role="radiogroup" aria-labelledby="align-label">
        {ALIGNMENTS.flat().map((a) => {
          const on = a.toLowerCase() === value.trim().toLowerCase();
          return (
            <button key={a} type="button" role="radio" aria-checked={on} className="align" onClick={() => onChange(on ? '' : a)}>
              {a}
            </button>
          );
        })}
      </div>
      {value && !known && (
        <p className="small muted">
          Saved as “{value}”. Pick one above to replace it, or{' '}
          <button type="button" className="btn-quiet btn-small" onClick={() => onChange('')}>
            clear it
          </button>
          .
        </p>
      )}
    </div>
  );
}

/** What each step still needs, in words. */
function stepNeeds(step: Step, c: Character, sheet: Sheet, pending: ChoiceInstance[], edition: Edition): string[] {
  const labels = (f: (x: ChoiceInstance) => boolean) => pending.filter(f).map((p) => p.choice.label);
  switch (step) {
    case 'class':
      return [...(c.levels.length ? [] : ['Pick a class']), ...labels(CLASS_CHOICES)];
    case 'background':
      return [...(c.backgroundId ? [] : ['Pick a background']), ...labels(BACKGROUND_CHOICES)];
    case 'species':
      return [...(c.speciesId ? [] : [`Pick a ${edition === '2014' ? 'race' : 'species'}`]), ...labels(SPECIES_CHOICES)];
    case 'abilities':
      return labels(isAsi);
    case 'spells':
      return sheet.casters.flatMap((k) => {
        const p = c.spells[k.classId];
        const out: string[] = [];
        const cantrips = k.cantrips - (p?.cantrips.length ?? 0);
        const prepared = k.prepared - (p?.prepared.length ?? 0);
        if (cantrips > 0) out.push(`${cantrips} more ${k.name} cantrip${cantrips > 1 ? 's' : ''}`);
        if (prepared > 0) out.push(`${prepared} more ${k.name} spell${prepared > 1 ? 's' : ''}`);
        return out;
      });
    case 'details':
      return [...(c.name.trim() ? [] : ['A name']), ...labels((p) => p.key === 'core:languages')];
    default:
      return [];
  }
}

function ReviewStep({ c, sheet, steps, go }: { c: Character; sheet: Sheet; steps: Step[]; go: (s: Step) => void }) {
  const { registry, edition } = useRules();
  const pending = pendingChoices(sheet.collected);
  const checks = steps.filter((s) => s !== 'review' && s !== 'ruleset').map((s) => ({ step: s, needs: stepNeeds(s, c, sheet, pending, edition), done: stepComplete(s, c, sheet) }));
  const open = checks.filter((x) => !x.done);
  const species = registry.species.get(c.speciesId);
  const lineage = species?.lineages?.find((l) => l.id === c.lineageId);
  const skills = sheet.skills.filter((s) => s.proficient);
  const gear = c.inventory.filter((i) => i.notes?.startsWith('class') || i.notes?.startsWith('background'));
  const spellNames = sheet.spells.map((s) => s.spell.name);
  const arms = blazonOf(c);

  return (
    <>
      <header className="review-head">
        <BlazonShield blazon={arms} size={88} label={`Coat of arms: ${describeBlazon(arms)}`} />
        <div>
          <h1>{c.name || 'Unnamed hero'}</h1>
          <p className="muted">
            {sheet.classSummary || 'No class yet'}
            {species && `, ${lineage ? `${lineage.name} ` : ''}${species.name}`}
            {c.backgroundId && `, ${registry.backgrounds.get(c.backgroundId)?.name}`}
            {c.details.alignment && `, ${c.details.alignment}`}
          </p>
        </div>
      </header>

      <section className={`review-status ${open.length ? '' : 'is-done'}`} role="status">
        <h2>{open.length ? `${open.length} step${open.length > 1 ? 's' : ''} still open` : '✓ Ready to play'}</h2>
        <p className="small muted">
          {open.length ? 'You can finish them now, or later from the sheet.' : 'Everything is chosen. Open the sheet to start playing.'}
        </p>
        <ul className="checklist">
          {checks.map(({ step, needs, done }) => (
            <li key={step} className={done ? 'is-done' : ''}>
              <span className="checklist__mark" aria-hidden="true">{done ? '✓' : '•'}</span>
              <span className="checklist__step">{stepLabel(step, edition)}</span>
              <span className="checklist__note">{done ? 'Done' : needs.length ? needs.join('; ') : 'Not finished'}</span>
              <button type="button" className="btn-small" onClick={() => go(step)}>
                {done ? 'Change' : 'Finish'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="review-grid" aria-label="Character at a glance">
        <div className="review-stats">
          {ABILITIES.map((a) => (
            <div key={a} className="review-stat">
              <span className="review-stat__label">{ABILITY_NAMES[a]}</span>
              <span className="review-stat__value">{fmtMod(sheet.abilities[a].mod)}</span>
              <span className="review-stat__sub">{sheet.abilities[a].score}</span>
            </div>
          ))}
        </div>
        <dl className="review-facts">
          <div>
            <dt>Hit points</dt>
            <dd>{sheet.maxHp || '—'}</dd>
          </div>
          <div>
            <dt>Armor Class</dt>
            <dd>{sheet.ac}</dd>
          </div>
          <div>
            <dt>Initiative</dt>
            <dd>{fmtMod(sheet.initiative)}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{sheet.speed} ft.</dd>
          </div>
        </dl>
        <dl className="review-lists">
          <dt>Skills</dt>
          <dd>{skills.length ? skills.map((s) => s.name).join(', ') : 'None yet'}</dd>
          <dt>Languages</dt>
          <dd>{sheet.proficiencies.languages.map((l) => registry.languages.get(l)?.name ?? l).join(', ') || 'None yet'}</dd>
          <dt>Starting gear</dt>
          <dd>{gear.length ? gear.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', ') : 'None chosen'}{c.coins.gp ? `, ${c.coins.gp} GP` : ''}</dd>
          {sheet.casters.length > 0 && (
            <>
              <dt>Spells</dt>
              <dd>{spellNames.length ? spellNames.join(', ') : 'None chosen'}</dd>
            </>
          )}
        </dl>
      </section>
    </>
  );
}

function Summary({ c, sheet }: { c: Character; sheet: Sheet }) {
  const { registry, edition } = useRules();
  const pending = pendingChoices(sheet.collected).length;
  return (
    <aside className="summary" aria-label="Character summary">
      <div className="summary__id">
        <BlazonShield blazon={blazonOf(c)} size={40} />
        <h3>{c.name || 'Unnamed hero'}</h3>
      </div>
      <dl>
        <dt>Rules</dt>
        <dd>{edition}</dd>
        <dt>Class</dt>
        <dd>{sheet.classSummary || '—'}</dd>
        <dt>{edition === '2014' ? 'Race' : 'Species'}</dt>
        <dd>{registry.species.get(c.speciesId)?.name ?? '—'}</dd>
        <dt>Background</dt>
        <dd>{registry.backgrounds.get(c.backgroundId)?.name ?? '—'}</dd>
        {ABILITIES.map((a) => (
          <div key={a} style={{ display: 'contents' }}>
            <dt>{a.toUpperCase()}</dt>
            <dd>
              {sheet.abilities[a].score} ({fmtMod(sheet.abilities[a].mod)})
            </dd>
          </div>
        ))}
        <dt>HP</dt>
        <dd>{sheet.maxHp || '—'}</dd>
        <dt>AC</dt>
        <dd>{sheet.ac}</dd>
        <dt>Speed</dt>
        <dd>{sheet.speed} ft.</dd>
      </dl>
      {pending > 0 && <p className="todo small">{pending} open choice{pending > 1 ? 's' : ''}</p>}
    </aside>
  );
}
