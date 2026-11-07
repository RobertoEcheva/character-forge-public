/**
 * Coats of arms: each character carries a blazon (field, division, charge) shown on the roster and
 * the sheet header. Until the player picks one, arms are derived from the id
 * so every character still looks distinct.
 */
import { useId } from 'react';
import { CHARGES, DIVISIONS, TINCTURES, TINCTURE_HEX as HEX, describeBlazon, isMetal } from '../data/blazon';
import type { Blazon, Charge, Division, Tincture } from '../types/character';

const SHIELD = 'M6 8 Q44 0 82 8 L82 46 Q82 80 44 95 Q6 80 6 46 Z';

function DivisionShape({ division, fill }: { division: Division; fill: string }) {
  switch (division) {
    case 'per-pale':
      return <rect x="44" y="0" width="44" height="100" fill={fill} />;
    case 'per-fess':
      return <rect x="0" y="50" width="88" height="50" fill={fill} />;
    case 'per-bend':
      return <path d="M0 0 L88 100 L0 100 Z" fill={fill} />;
    case 'quarterly':
      return <path d="M44 0 H88 V48 H44 Z M0 48 H44 V100 H0 Z" fill={fill} />;
    case 'chevron':
      return <path d="M0 78 L44 36 L88 78" fill="none" stroke={fill} strokeWidth="15" />;
    case 'chief':
      return <rect x="0" y="0" width="88" height="27" fill={fill} />;
    default:
      return null;
  }
}

function ChargeShape({ charge, fill, cy, scale }: { charge: Charge; fill: string; cy: number; scale: number }) {
  const t = `translate(44 ${cy}) scale(${scale})`;
  switch (charge) {
    case 'mullet':
      return <path transform={t} d="M0-15 4.4-4.9 15.3-4.9 6.5 1.9 9.8 12.4 0 6.1-9.8 12.4-6.5 1.9-15.3-4.9-4.4-4.9Z" fill={fill} />;
    case 'lozenge':
      return <path transform={t} d="M0-15 10 0 0 15-10 0Z" fill={fill} />;
    case 'roundel':
      return <circle cx="44" cy={cy} r={11 * scale} fill={fill} />;
    case 'cross':
      return <path transform={t} d="M-4-14H4V-4H14V4H4V14H-4V4H-14V-4H-4Z" fill={fill} />;
    case 'crescent':
      return <path transform={t} d="M-12-4A12 12 0 0 0 12-4 9 9 0 0 1-12-4Z" fill={fill} />;
    default:
      return null;
  }
}

/** Draws the arms on an escutcheon. Pass `label` when the shield stands alone. */
export function BlazonShield({ blazon, size = 64, label, className = '' }: { blazon: Blazon; size?: number; label?: string; className?: string }) {
  const clip = useId();
  // Charges sit lower under a chief, and inside the V of a chevron, so they stay on the field.
  const cy = blazon.division === 'chief' ? 58 : blazon.division === 'chevron' ? 70 : 48;
  const scale = blazon.division === 'chevron' ? 0.7 : 1;
  return (
    <svg
      viewBox="0 0 88 100"
      width={size}
      height={(size * 100) / 88}
      className={`blazon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <clipPath id={clip}>
        <path d={SHIELD} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="88" height="100" fill={HEX[blazon.field]} />
        {blazon.division !== 'plain' && <DivisionShape division={blazon.division} fill={HEX[blazon.second]} />}
        <ChargeShape charge={blazon.charge} fill={HEX[blazon.chargeTincture]} cy={cy} scale={scale} />
      </g>
      <path d={SHIELD} fill="none" className="blazon__edge" strokeWidth="2.5" />
    </svg>
  );
}

function Swatches({ label, value, onPick }: { label: string; value: Tincture; onPick: (t: Tincture) => void }) {
  return (
    <div className="blazon-row" role="radiogroup" aria-label={label}>
      <span className="blazon-row__label">{label}</span>
      <div className="swatches">
        {TINCTURES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className="swatch"
            style={{ background: t.hex }}
            title={`${t.name} (${t.plain})`}
            aria-label={`${t.name} (${t.plain})`}
            onClick={() => onPick(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Builder for the Details step: preview on the left, options on the right. */
export function BlazonPicker({ value, onChange }: { value: Blazon; onChange: (b: Blazon) => void }) {
  const set = (patch: Partial<Blazon>) => onChange({ ...value, ...patch });
  // Rule of tincture: the charge sits on the field, so metal on metal or colour on colour is hard to read.
  const clash = value.charge !== 'none' && isMetal(value.chargeTincture) === isMetal(value.field);
  return (
    <div className="blazon-picker">
      <div className="blazon-picker__preview">
        <BlazonShield blazon={value} size={120} label={`Coat of arms: ${describeBlazon(value)}`} />
        <p className="small muted">{describeBlazon(value)}</p>
      </div>
      <div className="blazon-picker__options">
        <Swatches label="Field" value={value.field} onPick={(field) => set({ field })} />
        <div className="blazon-row" role="radiogroup" aria-label="Division">
          <span className="blazon-row__label">Division</span>
          <div className="mini-shields">
            {DIVISIONS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={value.division === d.id} className="mini-shield" title={d.name} onClick={() => set({ division: d.id })}>
                <BlazonShield blazon={{ ...value, division: d.id, charge: 'none' }} size={30} />
                <span>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
        {value.division !== 'plain' && <Swatches label="Second color" value={value.second} onPick={(second) => set({ second })} />}
        <div className="blazon-row" role="radiogroup" aria-label="Charge">
          <span className="blazon-row__label">Charge</span>
          <div className="mini-shields">
            {CHARGES.map((ch) => (
              <button key={ch.id} type="button" role="radio" aria-checked={value.charge === ch.id} className="mini-shield" title={ch.name} onClick={() => set({ charge: ch.id })}>
                <BlazonShield blazon={{ ...value, charge: ch.id }} size={30} />
                <span>{ch.name}</span>
              </button>
            ))}
          </div>
        </div>
        {value.charge !== 'none' && <Swatches label="Charge color" value={value.chargeTincture} onPick={(chargeTincture) => set({ chargeTincture })} />}
        {clash && <p className="small muted">Tip: heralds put a metal (gold or silver) on a color, or a color on a metal, so the charge stands out.</p>}
      </div>
    </div>
  );
}
