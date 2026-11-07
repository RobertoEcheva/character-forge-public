import { createContext, useContext, type ReactNode } from 'react';
import type { Sheet } from '../engine/derive';
import { useDice } from '../state/AppState';
import type { Character } from '../types/character';

export type Update = (fn: (c: Character) => Character) => void;

interface SheetState {
  character: Character;
  sheet: Sheet;
  update: Update;
}

const SheetCtx = createContext<SheetState | null>(null);
export const SheetProvider = SheetCtx.Provider;

export function useSheet(): SheetState {
  const v = useContext(SheetCtx);
  if (!v) throw new Error('useSheet outside SheetProvider');
  return v;
}

export type RollKind = 'attack' | 'save' | 'check';

/** Adds active roll bonuses (Bless, Guidance...) and exhaustion penalties to a d20 expression. */
export function withRollBonuses(expr: string, sheet: Sheet, kind?: RollKind): string {
  if (!kind) return expr;
  const extra = sheet.rollBonuses[kind].map((d) => (d.startsWith('-') ? d : `+${d}`)).join('');
  return `${expr}${extra}${sheet.d20Penalty ? `-${sheet.d20Penalty}` : ''}`;
}

export function RollButton({
  label,
  expr,
  d20: isD20 = false,
  kind,
  children,
  className,
}: {
  label: string;
  expr: string;
  d20?: boolean;
  kind?: RollKind;
  children: ReactNode;
  className?: string;
}) {
  const { rollDice } = useDice();
  const ctx = useContext(SheetCtx);
  const full = ctx ? withRollBonuses(expr, ctx.sheet, kind) : expr;
  return (
    <button type="button" className={`roll ${className ?? ''}`} title={`Roll ${label}: ${full}`} onClick={() => rollDice(label, full, { d20: isD20 })}>
      {children}
    </button>
  );
}

/**
 * Death saves: two rows of marks that start empty and fill as saves are made.
 * Click a mark to correct the count by hand; the Roll button applies the result automatically.
 */
export function DeathSaves({
  saves,
  onSet,
  onRoll,
}: {
  saves: { successes: number; failures: number };
  onSet: (s: { successes: number; failures: number }) => void;
  onRoll: () => void;
}) {
  const state = saves.failures >= 3 ? 'dead' : saves.successes >= 3 ? 'stable' : 'dying';
  const row = (key: 'successes' | 'failures', label: string, mark: string) => (
    <span className={`marks marks--${key}`} role="group" aria-label={label}>
      <span className="marks__label">{label}</span>
      {[0, 1, 2].map((i) => {
        const on = i < saves[key];
        return (
          <button
            key={i}
            type="button"
            className={`mark ${on ? 'on' : ''}`}
            aria-pressed={on}
            aria-label={`${label} ${i + 1}`}
            onClick={() => onSet({ ...saves, [key]: on ? i : i + 1 })}
          >
            {on ? mark : ''}
          </button>
        );
      })}
    </span>
  );
  return (
    <div className="death" data-state={state}>
      <span className="death__title">Death saves</span>
      {row('successes', 'Successes', '✓')}
      {row('failures', 'Failures', '✗')}
      {state === 'dying' ? (
        <button type="button" className="btn-small btn-primary" onClick={onRoll}>Roll death save</button>
      ) : (
        <span className="death__status" role="status">{state === 'dead' ? 'Dead' : 'Stable at 0 HP'}</span>
      )}
    </div>
  );
}

export function Pips({ label, total, used, onSet, danger }: { label: string; total: number; used: number; onSet: (n: number) => void; danger?: boolean }) {
  return (
    <span className="pips" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`pip ${i < used ? 'used' : ''} ${danger ? 'danger' : ''}`}
          aria-label={`${label} ${i + 1}${i < used ? ' (used)' : ''}`}
          onClick={() => onSet(i < used ? i : i + 1)}
        />
      ))}
    </span>
  );
}
