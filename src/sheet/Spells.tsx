import { useState } from 'react';
import { DamageIcon, SchoolIcon } from '../components/icons';
import { SpellPicker } from '../components/SpellPicker';
import { fmtMod, type KnownSpell } from '../engine/derive';
import { d20 } from '../engine/dice';
import { spellRolls } from '../engine/spells';
import { Keyword } from '../keywords/RichText';
import { useDice } from '../state/AppState';
import { ABILITY_NAMES } from '../types/rules';
import { Pips, RollButton, useSheet, withRollBonuses } from './common';

export function Spells() {
  const { sheet, character, update } = useSheet();
  const [manage, setManage] = useState<string | null>(null);
  const [casting, setCasting] = useState<string | null>(null);
  if (!sheet.spells.length && !sheet.casters.length) return null;
  const play = character.play;
  const byLevel = new Map<number, KnownSpell[]>();
  for (const s of sheet.spells) byLevel.set(s.spell.level, [...(byLevel.get(s.spell.level) ?? []), s]);
  const setPlay = (patch: Partial<typeof play>) => update((c) => ({ ...c, play: { ...c.play, ...patch } }));

  return (
    <section className="block block--spells">
      <div className="block__head">
        <h2>Spells</h2>
        <div className="row">
          {sheet.casters.map((k) => (
            <button key={k.classId} type="button" className="btn-small" onClick={() => setManage(manage === k.classId ? null : k.classId)}>
              {manage === k.classId ? 'Done' : `Change ${k.name} spells`}
            </button>
          ))}
        </div>
      </div>
      <div className="spell-menu">
        {sheet.casters.map((k) => (
          <p key={k.classId} className="small casting">
            {k.name}: {ABILITY_NAMES[k.ability]} · <Keyword refId="difficulty-class">Save DC</Keyword> <strong>{k.saveDc}</strong> ·{' '}
            <Keyword refId="spell-attack">Spell attack</Keyword>{' '}
            <RollButton label={`${k.name} spell attack`} expr={d20(k.attack)} d20 kind="attack">
              {fmtMod(k.attack)}
            </RollButton>
          </p>
        ))}
        {manage &&
          sheet.casters
            .filter((k) => k.classId === manage)
            .map((k) => <SpellPicker key={k.classId} character={character} caster={k} sheet={sheet} onChange={(c) => update(() => c)} />)}
  
        <div className="slots">
          {sheet.slots.map((n, i) =>
            n > 0 ? (
              <div key={i} className="slot">
                <span className="field-label">Level {i + 1}</span>
                <Pips label={`Level ${i + 1} slots`} total={n} used={play.slotsUsed[i] ?? 0} onSet={(v) => setPlay({ slotsUsed: play.slotsUsed.map((x, j) => (j === i ? v : x)) })} />
              </div>
            ) : null,
          )}
          {sheet.pactSlots && sheet.pactSlots.count > 0 && (
            <div className="slot">
              <span className="field-label">Pact (level {sheet.pactSlots.level})</span>
              <Pips label="Pact slots" total={sheet.pactSlots.count} used={play.pactSlotsUsed} onSet={(v) => setPlay({ pactSlotsUsed: v })} />
            </div>
          )}
        </div>
      </div>

      {[...byLevel.entries()].map(([lvl, list]) => (
        <div key={lvl} className="spell-group">
          <h3>{lvl === 0 ? 'Cantrips' : `Level ${lvl}`}</h3>
          <ul className="spell-rows">
            {list.map((s) => {
              const key = `${s.via}:${s.spell.id}`;
              return (
                <li key={key}>
                  <div className="spell-row">
                    <SchoolIcon school={s.spell.school} title={s.spell.school} />
                    <Keyword refId={`spell:${s.spell.id}`}>{s.spell.name}</Keyword>
                    {(() => {
                      const meta = [s.spell.castingTime, s.spell.concentration && 'C', s.spell.ritual && 'R', s.alwaysPrepared && s.viaName, s.note].filter(Boolean).join(' · ');
                      return (
                        <span className="small muted" title={meta}>
                          {meta}
                        </span>
                      );
                    })()}
                    <button type="button" className="btn-small cast-btn" aria-expanded={casting === key} onClick={() => setCasting(casting === key ? null : key)}>
                      Cast
                    </button>
                  </div>
                  {casting === key && <CastPanel known={s} onDone={() => setCasting(null)} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

type SlotChoice = { kind: 'slot' | 'pact'; level: number } | { kind: 'free'; level: number };

function CastPanel({ known, onDone }: { known: KnownSpell; onDone: () => void }) {
  const { sheet, character, update } = useSheet();
  const { rollDice } = useDice();
  const sp = known.spell;
  const ability = known.ability ?? sheet.casters[0]?.ability ?? 'int';
  const mod = sheet.abilities[ability].mod;
  const attack = sheet.profBonus + mod;
  const dc = 8 + sheet.profBonus + mod;

  const options: (SlotChoice & { label: string })[] = [];
  if (sp.level === 0) options.push({ kind: 'free', level: 0, label: 'Cantrip' });
  else {
    sheet.slots.forEach((n, i) => {
      const left = n - (character.play.slotsUsed[i] ?? 0);
      if (i + 1 >= sp.level && left > 0) options.push({ kind: 'slot', level: i + 1, label: `Level ${i + 1} slot (${left} left)` });
    });
    const pact = sheet.pactSlots;
    if (pact && pact.level >= sp.level && character.play.pactSlotsUsed < pact.count)
      options.push({ kind: 'pact', level: pact.level, label: `Pact slot, level ${pact.level} (${pact.count - character.play.pactSlotsUsed} left)` });
    if (sp.ritual) options.push({ kind: 'free', level: sp.level, label: 'As a Ritual (no slot)' });
    options.push({ kind: 'free', level: sp.level, label: 'Without a slot (free use from a feature or item)' });
  }
  const [choice, setChoice] = useState(0);
  const picked = options[choice] ?? options[0];
  const rolls = spellRolls(sp, picked.level || sp.level, sheet.level, mod);

  const cast = () => {
    update((c) => {
      let play = { ...c.play };
      if (picked.kind === 'slot') play.slotsUsed = play.slotsUsed.map((u, i) => (i === picked.level - 1 ? u + 1 : u));
      if (picked.kind === 'pact') play.pactSlotsUsed += 1;
      if (sp.concentration) {
        // Built-in effect when there is one (Bless, Hunter's Mark...), otherwise track the spell itself.
        const id = sheet.toggles.some((t) => t.id === sp.id && !t.source) ? sp.id : `spell:${sp.id}`;
        const old = sheet.concentration?.id;
        play = { ...play, active: [...play.active.filter((x) => x !== old && x !== id), id] };
      }
      return { ...c, play };
    });
    if (sp.attackType) rollDice(`${sp.name} spell attack`, withRollBonuses(d20(attack), sheet, 'attack'), { d20: true });
    if (rolls.damage) rollDice(`${sp.name} damage${picked.level > sp.level ? ` (level ${picked.level})` : ''}`, rolls.damage);
    if (rolls.heal) rollDice(`${sp.name} healing${picked.level > sp.level ? ` (level ${picked.level})` : ''}`, rolls.heal);
    onDone();
  };

  return (
    <div className="cast-panel">
      {options.length > 1 && (
        <label className="row small">
          Cast using
          <select value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
            {options.map((o, i) => (
              <option key={i} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {sp.level > 0 && options.every((o) => o.kind === 'free') && <p className="small warn">No spell slots of level {sp.level}+ left.</p>}
      <p className="small">
        {sp.attackType && <>Spell attack {fmtMod(attack)} · </>}
        {sp.save && <>{ABILITY_NAMES[sp.save]} save DC {dc} · </>}
        {rolls.damage && (
          <>
            Damage {rolls.damage} <DamageIcon type={rolls.damageType} /> {rolls.damageType ?? ''} ·{' '}
          </>
        )}
        {rolls.heal && <>Healing {rolls.heal} · </>}
        {sp.concentration && 'Concentration'}
      </p>
      <div className="row">
        <button type="button" className="btn-primary btn-small" onClick={cast}>
          Cast {sp.name}
        </button>
        <button type="button" className="btn-small btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
