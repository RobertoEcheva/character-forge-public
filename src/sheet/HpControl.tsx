import { useState, type ReactNode } from 'react';

/**
 * Hit points box shared by the character and their companions: current / max, a bar
 * (green, red at half or below), and one amount field with Damage, Heal and optional Temp buttons.
 */
export function HpControl({
  name,
  hp,
  max,
  temp = 0,
  onDamage,
  onHeal,
  onTemp,
  title,
  compact = false,
  children,
}: {
  /** Who this is for, used in labels ("Wolf"). */
  name: string;
  hp: number;
  max: number;
  temp?: number;
  onDamage: (n: number) => void;
  onHeal: (n: number) => void;
  /** Set Temporary HP; leave out where they aren't tracked. */
  onTemp?: (n: number) => void;
  /** Heading shown above the numbers (the character's box uses "Hit Points"). */
  title?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [amount, setAmount] = useState('');
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  // Set temp also takes an explicit 0, to clear Temporary HP.
  const typed = amount.trim() !== '';
  const pct = max > 0 ? Math.round((hp / max) * 100) : 0;
  const low = hp <= max / 2;
  const act = (fn: (n: number) => void) => () => (fn(n), setAmount(''));
  return (
    <div className={`hp ${low ? 'is-low' : ''} ${compact ? 'hp--compact' : ''}`}>
      <div className="hp__top">
        {title ? <span className="hp__label">{title}</span> : <span className="hp__label hp__label--small">HP</span>}
        <span className="hp__value">
          <strong>{hp}</strong> / {max}
          {temp > 0 && <span className="hp__temp"> +{temp} temp</span>}
        </span>
      </div>
      <div className="hp__bar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label={`${name} hit points`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="row hp__controls">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={`${name}: amount of damage or healing`}
          placeholder="0"
        />
        <button type="button" className={`btn-danger ${compact ? 'btn-small' : ''}`} disabled={!n} onClick={act(onDamage)}>
          Damage
        </button>
        <button type="button" className={`btn-heal ${compact ? 'btn-small' : ''}`} disabled={!n} onClick={act(onHeal)}>
          Heal
        </button>
        {onTemp && (
          <button type="button" className={compact ? 'btn-small' : ''} disabled={!typed} onClick={act(onTemp)}>
            Set temp
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
