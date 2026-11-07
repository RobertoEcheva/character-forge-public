import { useRef } from 'react';
import type { ChoiceInstance } from '../engine/collect';
import { pendingChoices, resolveRef } from '../engine/collect';
import type { Sheet } from '../engine/derive';
import { setChoice } from '../engine/ops';
import { RichText } from '../keywords/RichText';
import { useRules } from '../state/AppState';
import type { Character } from '../types/character';
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_IDS, type Ability, type Choice } from '../types/rules';

interface Props {
  character: Character;
  sheet: Sheet;
  filter: (c: ChoiceInstance) => boolean;
  onChange: (c: Character) => void;
  emptyText?: string;
}

export function ChoicesPanel({ character, sheet, filter, onChange, emptyText }: Props) {
  const list = sheet.collected.choices.filter(filter);
  if (!list.length) return emptyText ? <p className="muted">{emptyText}</p> : null;
  return (
    <div>
      {list.map((inst) => (
        <ChoiceBox
          key={inst.key}
          inst={inst}
          sheet={sheet}
          onPick={(values) => onChange(setChoice(character, inst.key, values))}
        />
      ))}
    </div>
  );
}

/**
 * Filter that keeps showing a choice once it has been pending in this view,
 * so boxes don't vanish the moment they're completed.
 */
export function useStickyPending(sheet: Sheet | null): (c: ChoiceInstance) => boolean {
  const seen = useRef(new Set<string>());
  if (sheet) for (const c of pendingChoices(sheet.collected)) seen.current.add(c.key);
  return (c) => !c.locked && seen.current.has(c.key);
}

function toggle(values: string[], v: string, count: number): string[] {
  if (values.includes(v)) return values.filter((x) => x !== v);
  if (count === 1) return [v];
  return values.length >= count ? values : [...values, v];
}

function ChoiceBox({
  inst,
  sheet,
  onPick,
}: {
  inst: ChoiceInstance;
  sheet: Sheet;
  onPick: (v: string[]) => void;
}) {
  const { choice, values, count } = inst;
  const depth = (inst.key.match(/>/g) ?? []).length;
  const complete = values.length >= count;
  return (
    <section className={`choice ${complete ? '' : 'incomplete'}`} style={depth ? { marginLeft: `${depth}rem` } : undefined}>
      <div className="choice__head">
        <strong>{choice.label}</strong>
        {complete && !inst.locked && <span className="choice__done">✓ Done</span>}
        <span className="choice__count">
          {inst.locked ? 'Set by background' : `${values.length}/${count}`} · {inst.origin.name}
        </span>
      </div>
      {inst.locked ? (
        <p className="small">{values.join(', ')}</p>
      ) : (
        <ChoiceBody inst={inst} choice={choice} sheet={sheet} onPick={onPick} />
      )}
    </section>
  );
}

function Chips({
  options,
  values,
  count,
  onPick,
  disabled,
}: {
  options: { id: string; name: string; note?: string }[];
  values: string[];
  count: number;
  onPick: (v: string[]) => void;
  disabled?: (id: string) => boolean;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = values.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={on}
            disabled={!on && disabled?.(o.id)}
            title={o.note}
            onClick={() => onPick(toggle(values, o.id, count))}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function ChoiceBody({
  inst,
  choice,
  sheet,
  onPick,
}: {
  inst: ChoiceInstance;
  choice: Choice;
  sheet: Sheet;
  onPick: (v: string[]) => void;
}) {
  const { registry } = useRules();
  const { values, count } = inst;

  const profFromElsewhere = (skill: string) =>
    sheet.skills.find((s) => s.id === skill)?.proficient && !values.includes(skill);

  switch (choice.kind) {
    case 'skill': {
      const pool = choice.from === 'any' ? SKILL_IDS : choice.from;
      if (choice.expertise) {
        const expertAlready = new Set(
          sheet.collected.effects.flatMap((e) => (e.effect.type === 'skill' && e.effect.expertise ? [e.effect.skill] : [])),
        );
        const options = pool
          .filter((id) => sheet.skills.find((s) => s.id === id)?.proficient)
          .map((id) => ({ id, name: SKILLS[id].name }));
        if (!options.length) return <p className="small muted">Choose skill proficiencies first.</p>;
        return (
          <Chips options={options} values={values} count={count} onPick={onPick} disabled={(id) => expertAlready.has(id as never) && !values.includes(id)} />
        );
      }
      return (
        <Chips
          options={pool.map((id) => ({ id, name: SKILLS[id].name }))}
          values={values}
          count={count}
          onPick={onPick}
          disabled={(id) => Boolean(profFromElsewhere(id))}
        />
      );
    }
    case 'skillOrTool':
      return (
        <>
          <p className="small muted">Skills</p>
          <Chips
            options={SKILL_IDS.map((id) => ({ id: `skill:${id}`, name: SKILLS[id].name }))}
            values={values}
            count={count}
            onPick={onPick}
            disabled={(id) => Boolean(profFromElsewhere(id.slice(6)))}
          />
          <p className="small muted" style={{ marginTop: '0.6em' }}>Tools</p>
          <Chips
            options={registry.data.tools.map((t) => ({ id: `tool:${t.id}`, name: t.name }))}
            values={values}
            count={count}
            onPick={onPick}
          />
        </>
      );
    case 'tool': {
      const pool = choice.from === 'any' ? registry.data.tools.map((t) => t.id) : choice.from;
      return (
        <Chips
          options={pool.map((id) => ({ id, name: registry.tools.get(id)?.name ?? id }))}
          values={values}
          count={count}
          onPick={onPick}
          disabled={(id) => sheet.proficiencies.tools.includes(id)}
        />
      );
    }
    case 'language': {
      const pool = choice.from === 'any' ? registry.data.languages : registry.data.languages.filter((l) => (choice.from as string[]).includes(l.id));
      const known = new Set(sheet.proficiencies.languages);
      const standard = pool.filter((l) => !l.rare);
      const rare = pool.filter((l) => l.rare);
      return (
        <>
          <Chips options={standard} values={values} count={count} onPick={onPick} disabled={(id) => known.has(id)} />
          {rare.length > 0 && (
            <>
              <p className="small muted" style={{ marginTop: '0.6em' }}>Rare languages (with your DM's approval)</p>
              <Chips options={rare} values={values} count={count} onPick={onPick} disabled={(id) => known.has(id)} />
            </>
          )}
        </>
      );
    }
    case 'size':
      return <Chips options={choice.options.map((s) => ({ id: s, name: s }))} values={values} count={1} onPick={onPick} />;
    case 'weaponMastery': {
      const prof = new Set(sheet.proficiencies.weapons);
      const weapons = registry.data.items.filter(
        (i) => i.weapon?.mastery && (prof.has(i.weapon.category) || prof.has(i.id)),
      );
      return (
        <Chips
          options={weapons.map((w) => ({ id: w.id, name: `${w.name} (${w.weapon!.mastery})`, note: w.weapon!.mastery }))}
          values={values}
          count={count}
          onPick={onPick}
        />
      );
    }
    case 'option': {
      // Options already taken by a sibling choice (maneuvers at 3 and at 7, Metamagic at 2/10/17...).
      const takenElsewhere = new Set(
        sheet.collected.choices
          .filter((x) => x.key !== inst.key && x.choice.kind === 'option' && x.origin.name === inst.origin.name)
          .flatMap((x) => x.values)
          .filter((v) => choice.options.some((o) => o.id === v)),
      );
      return (
        <div className="option-list">
          {choice.options.map((o) => {
            const on = values.includes(o.id);
            const full = !on && ((values.length >= count && count > 1) || takenElsewhere.has(o.id));
            return (
              <button key={o.id} type="button" className="option" aria-pressed={on} disabled={full} onClick={() => onPick(toggle(values, o.id, count))}>
                <strong>{o.name}</strong>
                {o.prerequisite && <span className="small muted"> — Prerequisite: {o.prerequisite}</span>}
                {o.description && <RichText text={o.description} />}
              </button>
            );
          })}
        </div>
      );
    }
    case 'feat': {
      const taken = new Set(sheet.collected.feats.filter((f) => f.key !== `feat@${inst.key}`).map((f) => f.featId));
      const feats = registry.data.feats.filter((f) => choice.featTypes.includes(f.type));
      return (
        <div className="option-list">
          {feats.map((f) => {
            const on = values.includes(f.id);
            const tooLow = (f.prerequisite?.minLevel ?? 0) > sheet.level;
            const dup = taken.has(f.id) && !f.repeatable;
            return (
              <details key={f.id} className="option" open={on} style={on ? { borderColor: 'var(--accent)' } : undefined}>
                <summary className="row">
                  <button type="button" className={on ? 'btn-primary btn-small' : 'btn-small'} disabled={!on && (tooLow || dup)} onClick={(e) => (e.preventDefault(), onPick(on ? [] : [f.id]))}>
                    {on ? 'Chosen' : 'Choose'}
                  </button>
                  <strong>{f.name}</strong>
                  {f.source === 'custom' && <span className="tag tag-custom">Custom</span>}
                  {f.unverified && <span className="tag tag-unverified">Unverified</span>}
                  <span className="small muted">
                    {tooLow ? `Requires level ${f.prerequisite?.minLevel}` : dup ? 'Already taken' : ''}
                  </span>
                </summary>
                <RichText text={f.description} />
              </details>
            );
          })}
        </div>
      );
    }
    case 'asi':
      return <AsiPicker choice={choice} values={values} sheet={sheet} onPick={onPick} />;
    case 'spell': {
      const lists = Array.isArray(choice.lists) ? choice.lists : resolveRef(choice.lists.fromChoice, inst.owner, sheet.collected.resolved);
      if (!lists.length) return <p className="small muted">Pick the spell list above first.</p>;
      const maxLevel = sheet.casters.find((k) => k.classId === inst.origin.classId)?.maxSpellLevel ?? 0;
      const fits = (level: number) =>
        choice.upToSlotLevel
          ? level <= Math.min(maxLevel, choice.maxSpellLevel ?? 9) && level >= (choice.minSpellLevel ?? 0)
          : level === choice.level;
      const spells = registry.data.spells
        .filter((s) => fits(s.level) && s.classes.some((c) => lists.includes(c)))
        .filter((s) => !choice.schools || choice.schools.includes(s.school))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
      return (
        <Chips
          options={spells.map((s) => ({ id: s.id, name: choice.upToSlotLevel ? `${s.name} (${s.level === 0 ? 'cantrip' : s.level})` : s.name }))}
          values={values}
          count={count}
          onPick={onPick}
        />
      );
    }
  }
}

function AsiPicker({
  choice,
  values,
  sheet,
  onPick,
}: {
  choice: Extract<Choice, { kind: 'asi' }>;
  values: string[];
  sheet: Sheet;
  onPick: (v: string[]) => void;
}) {
  const pool: Ability[] = choice.from === 'any' ? [...ABILITIES] : choice.from;
  const counts = (vals: string[]) => Object.fromEntries(pool.map((a) => [a, vals.filter((v) => v === a).length]));
  const cur = counts(values);
  const spent = values.length;

  const allowed = (next: string[]) => {
    const c = Object.values(counts(next)).filter((n) => n > 0).sort((a, b) => b - a);
    if (Object.values(counts(next)).some((n) => n > choice.maxPerAbility)) return false;
    if (!choice.patterns || next.length < choice.points) return true;
    return choice.patterns.some((p) => p.length === c.length && p.every((n, i) => n === c[i]));
  };
  // Partially-filled picks must still be completable into an allowed pattern.
  const canAdd = (a: Ability) => {
    if (spent >= choice.points) return false;
    const next = [...values, a];
    if (Object.values(counts(next)).some((n) => n > choice.maxPerAbility)) return false;
    if (sheet.abilities[a].score + 1 > choice.max) return false;
    if (choice.patterns && next.length === choice.points) return allowed(next);
    return true;
  };

  return (
    <div className="row" style={{ gap: '0.5rem 1.2rem' }}>
      {pool.map((a) => (
        <div key={a} className="row" style={{ gap: '0.3rem' }}>
          <span style={{ minWidth: '6.5em' }}>{ABILITY_NAMES[a]}</span>
          <button type="button" className="btn-small" aria-label={`Decrease ${ABILITY_NAMES[a]}`} disabled={!cur[a]} onClick={() => {
            const i = values.lastIndexOf(a);
            onPick(values.filter((_, j) => j !== i));
          }}>−</button>
          <strong style={{ minWidth: '1.6em', textAlign: 'center' }}>+{cur[a]}</strong>
          <button type="button" className="btn-small" aria-label={`Increase ${ABILITY_NAMES[a]}`} disabled={!canAdd(a)} onClick={() => onPick([...values, a])}>+</button>
        </div>
      ))}
      {choice.patterns && (
        <span className="small muted">Allowed: {choice.patterns.map((p) => p.map((n) => `+${n}`).join('/')).join(' or ')}</span>
      )}
    </div>
  );
}
