import { useState } from 'react';
import type { RollMode } from '../engine/dice';
import { useDice } from '../state/AppState';
import { D20Icon } from './Ornaments';

const MODES: { id: RollMode; label: string }[] = [
  { id: 'disadvantage', label: 'Disadv.' },
  { id: 'normal', label: 'Normal' },
  { id: 'advantage', label: 'Adv.' },
];

/** Floating roll result + history, with a one-shot advantage/disadvantage toggle. */
export function DiceDock() {
  const { rolls, mode, setMode, rollDice, clear } = useDice();
  const [expr, setExpr] = useState('');
  const [open, setOpen] = useState(false);
  const last = rolls[0];

  return (
    <aside className={`dice ${open ? 'open' : ''}`} aria-label="Dice">
      <div className="dice__title">
        <D20Icon /> Dice
      </div>
      <div className="dice__modes" role="radiogroup" aria-label="Next d20 roll">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`btn-small ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {last ? (
        <button type="button" className="dice__last" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-live="polite">
          <span className={`dice__total ${last.crit ? 'crit' : last.fumble ? 'fumble' : ''}`} key={last.at}>
            {last.total}
          </span>
          <span className="dice__desc">
            <strong>{last.label}</strong>
            <span className="small muted">
              {describe(last)}
              {last.crit ? ' · natural 20' : last.fumble ? ' · natural 1' : ''}
            </span>
          </span>
        </button>
      ) : (
        <p className="small muted dice__hint">Click any bonus on the sheet to roll it.</p>
      )}
      {open && (
        <div className="dice__history">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              rollDice(expr, expr, { d20: /^\s*1?d20/i.test(expr) });
            }}
          >
            <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="e.g. 2d6+3" aria-label="Dice expression" />
            <button type="submit" className="btn-small" disabled={!expr.trim()}>Roll</button>
            <button type="button" className="btn-small btn-quiet" onClick={clear}>Clear</button>
          </form>
          <ol>
            {rolls.slice(1).map((r) => (
              <li key={r.at + r.label}>
                <strong>{r.total}</strong> {r.label} <span className="small muted">{describe(r)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

function describe(r: ReturnType<typeof useDice>['rolls'][number]) {
  const dice = r.rolls
    .map((x) => (x.kept !== undefined ? `d20 [${x.values.join(', ')}]→${x.kept}` : `d${x.sides} [${x.values.join(', ')}]`))
    .join(' + ');
  const flat = r.flat ? ` ${r.flat > 0 ? '+' : '−'} ${Math.abs(r.flat)}` : '';
  return `${dice}${flat}${r.mode !== 'normal' ? ` (${r.mode})` : ''}`;
}
