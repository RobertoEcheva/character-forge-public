import { useEffect, useState } from 'react';
import { canWildShape, loadCreatures, mergeCreatures, wildShapeLimits } from '../data/creatures';
import { fmtMod, mod } from '../engine/derive';
import { d20 } from '../engine/dice';
import { changeHp, uid } from '../engine/ops';
import { RichText } from '../keywords/RichText';
import { useApp, useRules } from '../state/AppState';
import type { Companion } from '../types/character';
import type { CreatureDef } from '../types/creature';
import { ABILITIES } from '../types/rules';
import { RollButton, useSheet } from './common';
import { HpControl } from './HpControl';

const crLabel = (cr: number) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

/** Familiars, animal companions and summons, plus the Druid's Wild Shape. */
export function Companions() {
  const { character, sheet, update } = useSheet();
  const { edition } = useRules();
  const [srdCreatures, setSrdCreatures] = useState<CreatureDef[]>([]);
  const { custom } = useApp();
  const [adding, setAdding] = useState('');
  const [kind, setKind] = useState<Companion['kind']>('familiar');
  const [shape, setShape] = useState('');
  useEffect(() => {
    loadCreatures(edition).then(setSrdCreatures);
  }, [edition]);
  const creatures = mergeCreatures(srdCreatures, custom.creatures, edition);

  const byId = new Map(creatures.map((c) => [c.id, c]));
  const companions = character.companions ?? [];
  const setCompanions = (list: Companion[]) => update((c) => ({ ...c, companions: list }));
  const druidLevel = sheet.collected.classLevels.get('druid') ?? 0;
  const moon = /moon/.test(character.subclasses.druid ?? '');
  const limits = wildShapeLimits(edition, druidLevel, moon);
  const forms = creatures.filter((c) => canWildShape(c, limits));
  const ws = character.play.wildShape;
  const wsCreature = ws ? byId.get(ws.creatureId) : undefined;
  const wsCounter = sheet.counters.find((k) => k.id.endsWith(':wild_shape_uses'));

  const add = () => {
    const c = creatures.find((x) => x.name.toLowerCase() === adding.trim().toLowerCase());
    if (!c) return;
    setCompanions([...companions, { uid: uid(), creatureId: c.id, name: c.name, kind, hp: null }]);
    setAdding('');
  };

  const transform = () => {
    const c = byId.get(shape);
    if (!c) return;
    const used = wsCounter ? (character.play.counters[wsCounter.id] ?? 0) : 0;
    update((ch) => ({
      ...ch,
      play: {
        ...ch.play,
        // 2024: you keep your own HP and gain Temporary Hit Points equal to your Druid level.
        wildShape: { creatureId: c.id, hp: edition === '2024' ? 0 : c.hp, tempHp: edition === '2024' ? druidLevel : 0 },
        tempHp: edition === '2024' ? Math.max(ch.play.tempHp, druidLevel) : ch.play.tempHp,
        counters: wsCounter ? { ...ch.play.counters, [wsCounter.id]: used + 1 } : ch.play.counters,
      },
    }));
  };

  if (!companions.length && !druidLevel && !creatures.length) return null;
  return (
    <section className="block">
      <h2>Companions</h2>

      {druidLevel >= 2 && (
        <div className="wildshape">
          <h3>Wild Shape</h3>
          {wsCreature ? (
            <>
              <StatBlock
                creature={wsCreature}
                title={`${wsCreature.name} (Wild Shape)`}
                hp={edition === '2014' ? ws!.hp : undefined}
                onHp={edition === '2014' ? (hp) => update((ch) => ({ ...ch, play: { ...ch.play, wildShape: { ...ch.play.wildShape!, hp } } })) : undefined}
                keepMind
              />
              <button type="button" className="btn-small" onClick={() => update((ch) => ({ ...ch, play: { ...ch.play, wildShape: null } }))}>
                Revert to normal form
              </button>
            </>
          ) : (
            <div className="row">
              <select value={shape} onChange={(e) => setShape(e.target.value)} aria-label="Beast form">
                <option value="">Choose a beast (CR {crLabel(limits.cr)} or lower{limits.fly ? '' : ', no fly'}{limits.swim ? '' : ', no swim'})</option>
                {forms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (CR {crLabel(c.cr)}){c.source === 'custom' ? ' · custom' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-small btn-primary" disabled={!shape} onClick={transform}>
                Transform
              </button>
              {wsCounter && (
                <span className="small muted">
                  {wsCounter.max - (character.play.counters[wsCounter.id] ?? 0)} of {wsCounter.max} uses left
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {companions.map((comp) => {
        const c = byId.get(comp.creatureId);
        if (!c)
          return creatures.length ? (
            <div key={comp.uid} className="row small companion-missing">
              <span>
                {comp.name}: creature no longer available (deleted from Rules packs?).
              </span>
              <button type="button" className="btn-small btn-quiet" onClick={() => setCompanions(companions.filter((x) => x.uid !== comp.uid))}>
                Remove
              </button>
            </div>
          ) : null;
        return (
          <div key={comp.uid} className="companion">
            <StatBlock
              creature={c}
              title={comp.name}
              tag={comp.kind}
              hp={comp.hp ?? c.hp}
              onHp={(hp) => setCompanions(companions.map((x) => (x.uid === comp.uid ? { ...x, hp } : x)))}
              onRename={(name) => setCompanions(companions.map((x) => (x.uid === comp.uid ? { ...x, name } : x)))}
            />
            <button type="button" className="btn-small btn-quiet" onClick={() => setCompanions(companions.filter((x) => x.uid !== comp.uid))}>
              Remove {comp.name}
            </button>
          </div>
        );
      })}

      <form className="row" onSubmit={(e) => (e.preventDefault(), add())}>
        <select value={kind} onChange={(e) => setKind(e.target.value as Companion['kind'])} aria-label="Companion kind">
          <option value="familiar">Familiar</option>
          <option value="companion">Companion</option>
          <option value="summon">Summon</option>
        </select>
        <input list="creature-names" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a creature (e.g. Owl)" aria-label="Creature" style={{ flex: 1 }} />
        <datalist id="creature-names">
          {creatures.map((c) => (
            <option key={c.id} value={c.name}>{`CR ${crLabel(c.cr)} ${c.type}${c.source === 'custom' ? ' · custom' : ''}`}</option>
          ))}
        </datalist>
        <button type="submit" disabled={!adding.trim()}>Add</button>
      </form>
    </section>
  );
}

function StatBlock({
  creature: c,
  title,
  tag,
  hp,
  onHp,
  onRename,
  keepMind,
}: {
  creature: CreatureDef;
  title: string;
  tag?: string;
  hp?: number;
  onHp?: (hp: number) => void;
  onRename?: (name: string) => void;
  keepMind?: boolean;
}) {
  return (
    <div className="statblock">
      <div className="statblock__head">
        {onRename ? (
          <input className="statblock__name" value={title} onChange={(e) => onRename(e.target.value)} aria-label="Companion name" />
        ) : (
          <strong className="statblock__name">{title}</strong>
        )}
        <span className="small muted">
          {c.size} {c.type}, CR {crLabel(c.cr)} {tag && <span className="tag">{tag}</span>}{' '}
          {c.source === 'custom' && <span className="tag tag-custom">Custom</span>}
        </span>
      </div>
      <div className="statblock__stats small">
        <span>AC {c.ac}</span>
        {!(hp !== undefined && onHp) && <span>HP {keepMind ? 'yours (plus Temporary HP)' : c.hp}</span>}
        <span>Speed {Object.entries(c.speed).map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', ')}</span>
      </div>
      {hp !== undefined && onHp && (
        <HpControl
          compact
          name={title}
          hp={hp}
          max={c.hp}
          onDamage={(n) => onHp(changeHp({ hp, temp: 0 }, c.hp, 'damage', n).hp)}
          onHeal={(n) => onHp(changeHp({ hp, temp: 0 }, c.hp, 'heal', n).hp)}
        />
      )}
      <div className="statblock__abilities small">
        {ABILITIES.map((a) => (
          <span key={a}>
            {a.toUpperCase()} {c.abilities[a]} ({fmtMod(mod(c.abilities[a]))})
          </span>
        ))}
      </div>
      {c.senses && <p className="small muted">{c.senses}</p>}
      {c.actions.map((a) => (
        <div key={a.name} className="statblock__action small">
          <strong>{a.name}.</strong>{' '}
          {a.attack !== undefined && (
            <RollButton label={`${title}: ${a.name} attack`} expr={d20(a.attack)} d20>
              {fmtMod(a.attack)} to hit
            </RollButton>
          )}{' '}
          {a.damage && (
            <RollButton label={`${title}: ${a.name} damage`} expr={a.damage}>
              {a.damage} {a.damageType}
            </RollButton>
          )}
          <RichText text={a.description} className="statblock__desc" />
        </div>
      ))}
      {c.traits.length > 0 && (
        <details>
          <summary className="small">Traits</summary>
          {c.traits.map((t) => (
            <div key={t.name} className="small">
              <strong>{t.name}.</strong> <RichText text={t.description} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
