import { useState } from 'react';
import { d20 } from '../engine/dice';
import type { ToggleDef } from '../engine/toggles';
import { Keyword, RichText } from '../keywords/RichText';
import { RollButton, useSheet } from './common';

/** Switches for Rage, Bless, Shield... Effects apply to the sheet while on. */
export function ActiveEffects() {
  const { sheet, character, update } = useSheet();
  const [notice, setNotice] = useState('');
  const [damage, setDamage] = useState('');
  const active = new Set(character.play.active ?? []);
  const fromFeatures = sheet.toggles.filter((t) => t.source);
  const common = sheet.toggles.filter((t) => !t.source);

  const toggle = (t: ToggleDef) => {
    if (active.has(t.id)) {
      update((c) => ({ ...c, play: { ...c.play, active: c.play.active.filter((x) => x !== t.id) } }));
      setNotice('');
      return;
    }
    // Features with limited uses (Rage) spend one when switched on.
    const counter = t.resource ? sheet.counters.find((k) => k.id.endsWith(`:${t.resource}`)) : undefined;
    const used = counter ? (character.play.counters[counter.id] ?? 0) : 0;
    if (counter && used >= counter.max) {
      setNotice(`No ${counter.label} uses left. They come back after a rest.`);
      return;
    }
    const replaced = t.concentration ? sheet.concentration : null;
    update((c) => ({
      ...c,
      play: {
        ...c.play,
        active: [...c.play.active.filter((x) => x !== replaced?.id), t.id],
        counters: counter ? { ...c.play.counters, [counter.id]: used + 1 } : c.play.counters,
      },
    }));
    setNotice(replaced ? `${replaced.label} ended: you can concentrate on only one effect at a time.` : '');
  };

  const dmg = Math.max(0, Math.floor(Number(damage) || 0));
  const dc = Math.min(30, Math.max(10, Math.floor(dmg / 2)));

  const list = (items: ToggleDef[]) => (
    <div className="toggles">
      {items.map((t) => (
        <label key={t.id} className={`toggle ${active.has(t.id) ? 'on' : ''}`} title={t.description}>
          <input type="checkbox" checked={active.has(t.id)} onChange={() => toggle(t)} />
          <span>
            {t.label}
            {t.concentration && <span className="small muted"> · C</span>}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <section className="block block--effects">
      <h2>Active effects</h2>
      {fromFeatures.length > 0 && list(fromFeatures)}
      <details className="feature">
        <summary>
          <span className="feature__name">Spells and effects on you</span>
        </summary>
        {list(common)}
      </details>
      {notice && <p className="small notice">{notice}</p>}
      {[...active].map((id) => {
        const t = sheet.toggles.find((x) => x.id === id);
        return t?.description ? (
          <div key={id} className="small active-desc">
            <strong>{t.label}.</strong> <RichText text={t.description} />
          </div>
        ) : null;
      })}
      {sheet.concentration && (
        <div className="concentration row small">
          <span>
            <Keyword refId="concentration">Concentrating</Keyword> on <strong>{sheet.concentration.label}</strong>.
          </span>
          <input type="number" min={0} placeholder="Damage taken" aria-label="Damage taken" value={damage} onChange={(e) => setDamage(e.target.value)} />
          <RollButton label={`Concentration save (DC ${dc})`} expr={d20(sheet.abilities.con.save)} d20 kind="save">
            CON save vs DC {dc}
          </RollButton>
        </div>
      )}
      {sheet.conditionNotes.map((n) => (
        <p key={n} className="small warn">{n}</p>
      ))}
    </section>
  );
}
