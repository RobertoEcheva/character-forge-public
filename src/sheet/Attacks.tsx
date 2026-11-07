import { useState } from 'react';
import { fmtMod, type Attack, type Rider } from '../engine/derive';
import { critExpression, d20 } from '../engine/dice';
import { DamageIcon } from '../components/icons';
import { Keyword } from '../keywords/RichText';
import { useDice } from '../state/AppState';
import { useSheet, withRollBonuses } from './common';

const applies = (r: Rider, a: Attack) =>
  r.when === 'any' ||
  (r.when === 'finesseOrRanged' && a.finesseOrRanged) ||
  (r.when === 'melee' && a.kind === 'melee') ||
  (r.when === 'strMelee' && a.kind === 'melee' && a.strBased);

/** "2" -> "+2", "3d6" -> "+3d6". */
const plus = (x: string) => (x.startsWith('-') || x.startsWith('+') ? x : `+${x}`);

export function Attacks() {
  const { sheet, character, update } = useSheet();
  const { rollDice } = useDice();
  const [crit, setCrit] = useState(false);
  /** Weapon whose to-hit roll was a natural 20; its crit applies to the next damage roll. */
  const [critFrom, setCritFrom] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [smiteSlot, setSmiteSlot] = useState(1);
  const freeSlots = sheet.slots.map((n, i) => n - (character.play.slotsUsed[i] ?? 0));

  const rollDamage = (a: Attack, thrown = false) => {
    const parts: string[] = [];
    const labels: string[] = [];
    let expr = a.damage + (thrown && a.thrownBonus ? plus(String(a.thrownBonus)) : '');
    for (const r of sheet.riders) {
      if (!applies(r, a) || !(r.auto || picked.includes(r.id))) continue;
      if (r.perSlot) {
        if (freeSlots[smiteSlot - 1] <= 0) continue;
        // 2014 Divine Smite: base + 1 die per slot level above 1st, at most 5 dice.
        const base = Number(r.perSlot.base.split('d')[0]);
        const die = r.perSlot.base.split('d')[1];
        parts.push(`${Math.min(5, base + smiteSlot - 1)}d${die}`);
        labels.push(`${r.label.replace(/ \(.*\)$/, '')} (level ${smiteSlot} slot)`);
        update((c) => ({ ...c, play: { ...c.play, slotsUsed: c.play.slotsUsed.map((u, i) => (i === smiteSlot - 1 ? u + 1 : u)) } }));
        continue;
      }
      parts.push(r.dice);
      labels.push(r.label);
    }
    expr += parts.map(plus).join('');
    rollDice(`${a.name} damage${crit ? ' (critical)' : ''}${labels.length ? ` + ${labels.join(' + ')}` : ''}`, crit ? critExpression(expr) : expr);
    setCrit(false);
    setCritFrom(null);
    setPicked([]);
  };

  /** Rolls to hit; a natural 20 ticks Critical for the next damage roll, any other roll clears it. */
  const rollToHit = (a: Attack) => {
    const r = rollDice(`${a.name} attack`, withRollBonuses(d20(a.bonus), sheet, 'attack'), { d20: true });
    if (!r) return;
    setCrit(Boolean(r.crit));
    setCritFrom(r.crit ? a.name : null);
  };

  const optional = sheet.riders.filter((r) => !r.auto);
  const automatic = sheet.riders.filter((r) => r.auto);

  return (
    <section className="block block--attacks">
      <h2>Weapons & attacks</h2>
      {crit && (
        <p className="crit-banner" role="status">
          <strong>Critical hit{critFrom ? ` with ${critFrom}` : ''}!</strong> The next damage roll doubles its dice.{' '}
          <button type="button" className="btn-small btn-quiet" onClick={() => (setCrit(false), setCritFrom(null))}>
            Cancel
          </button>
        </p>
      )}
      <table className="attacks">
        <thead>
          <tr>
            <th>Attack</th>
            <th>To hit</th>
            <th>Damage</th>
            <th>Range</th>
          </tr>
        </thead>
        <tbody>
          {sheet.attacks.map((a) => (
            <tr key={a.id}>
              <td>
                <strong>{a.name}</strong>
                <div className="small muted">
                  {a.properties.map((p, i) => (
                    <span key={p}>
                      {i > 0 && ', '}
                      <Keyword refId={`property-${p.split(' ')[0]}`}>{p}</Keyword>
                    </span>
                  ))}
                  {a.mastery && (
                    <>
                      {a.properties.length > 0 && ' · '}
                      Mastery: <Keyword refId={`mastery-${a.mastery}`}>{a.mastery[0].toUpperCase() + a.mastery.slice(1)}</Keyword>
                    </>
                  )}
                  {a.notes && <span className="warn"> {a.notes}</span>}
                </div>
              </td>
              <td>
                <button type="button" className="atk-btn atk-btn--hit" title={`Roll to hit: ${withRollBonuses(d20(a.bonus), sheet, 'attack')}`} onClick={() => rollToHit(a)}>
                  <span className="atk-btn__verb">Hit</span> {fmtMod(a.bonus)}
                </button>
              </td>
              <td className="attacks__dmg">
                <button
                  type="button"
                  className={`atk-btn atk-btn--dmg ${crit && (!critFrom || critFrom === a.name) ? 'is-crit' : ''}`}
                  title={crit ? 'Roll critical damage (dice doubled) with the options below' : 'Roll damage with the options below'}
                  onClick={() => rollDamage(a)}
                >
                  <span className="atk-btn__verb">Damage</span> {crit ? critExpression(a.damage) : a.damage}
                </button>{' '}
                <span className="dmg-type">
                  <DamageIcon type={a.damageType} />
                  <Keyword refId={`damage-${a.damageType}`}>{a.damageType}</Keyword>
                </span>
                {a.thrownBonus ? (
                  <button type="button" className="roll small" onClick={() => rollDamage(a, true)}>
                    thrown {plus(String(a.thrownBonus))}
                  </button>
                ) : null}
              </td>
              <td className="small">{a.range}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="damage-options">
        <label className="row small">
          <input type="checkbox" checked={crit} onChange={(e) => (setCrit(e.target.checked), setCritFrom(null))} />
          <Keyword refId="critical-hit">Critical hit</Keyword> (double the dice)
        </label>
        {optional.map((r) => (
          <label key={r.id} className="row small">
            <input
              type="checkbox"
              checked={picked.includes(r.id)}
              onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, r.id] : xs.filter((x) => x !== r.id)))}
            />
            {r.label}
            {r.dice && <span className="muted">({plus(r.dice)})</span>}
            {r.perSlot && (
              <select value={smiteSlot} onChange={(e) => setSmiteSlot(Number(e.target.value))} aria-label="Smite slot level">
                {freeSlots.map((n, i) =>
                  n > 0 ? (
                    <option key={i} value={i + 1}>
                      Level {i + 1} slot ({n} left)
                    </option>
                  ) : null,
                )}
              </select>
            )}
          </label>
        ))}
        {automatic.length > 0 && (
          <span className="small muted">Added automatically: {automatic.map((r) => `${r.label} ${plus(r.dice)}`).join(', ')}</span>
        )}
      </div>
      <p className="small muted">Equip weapons in Inventory to list them here. Damage options apply to the next damage roll.</p>
      {withRollBonuses('', sheet, 'attack') && (
        <p className="small">Attack rolls include {withRollBonuses('', sheet, 'attack').replace(/^\+/, '')}.</p>
      )}
    </section>
  );
}
