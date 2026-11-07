import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChoicesPanel, useStickyPending } from '../components/Choices';
import { DiceDock } from '../components/DiceDock';
import { BlazonShield } from '../components/Blazon';
import { blazonOf, describeBlazon } from '../data/blazon';
import { Shield } from '../components/Ornaments';
import { SubclassPicker } from '../components/SubclassPicker';
import { pendingChoices } from '../engine/collect';
import { featureRows, groupRows } from '../engine/featureRows';
import { FeatureRowView } from '../components/Features';
import { deriveSheet, fmtMod, type Sheet as SheetData } from '../engine/derive';
import { d20, defaultRng } from '../engine/dice';
import { applyDamage, applyDeathSave, currentHp, heal, longRest, shortRest, spendHitDie, applyBuildEdit } from '../engine/ops';
import { ActiveEffects } from '../sheet/ActiveEffects';
import { Attacks } from '../sheet/Attacks';
import { DeathSaves, Pips, RollButton, SheetProvider, withRollBonuses, type Update } from '../sheet/common';
import { Companions } from '../sheet/Companions';
import { Inventory } from '../sheet/Inventory';
import { ExportMenu } from '../sheet/ExportMenu';
import { Spells } from '../sheet/Spells';
import { Keyword } from '../keywords/RichText';
import { HpControl } from '../sheet/HpControl';
import { RulesProvider, useRules, useCharacter, useDice } from '../state/AppState';
import type { Character } from '../types/character';
import { ABILITIES, ABILITY_NAMES } from '../types/rules';
import '../sheet.css';


export default function Sheet() {
  const { id } = useParams();
  const [character] = useCharacter(id);
  if (!character) return <Navigate to="/" replace />;
  return (
    <RulesProvider edition={character.ruleset}>
      <SheetView />
    </RulesProvider>
  );
}

function SheetView() {
  const { id } = useParams();
  const [character, update] = useCharacter(id);
  const { registry } = useRules();
  const sheet = useMemo(() => (character ? deriveSheet(character, registry) : null), [character, registry]);
  const [showChoices, setShowChoices] = useState(false);
  const sticky = useStickyPending(sheet);
  if (!character || !sheet) return <Navigate to="/" replace />;
  const pending = pendingChoices(sheet.collected);
  const choicesOpen = pending.length > 0 || sheet.collected.needsSubclass.length > 0;
  const spellGaps = sheet.casters.filter((k) => {
    const p = character.spells[k.classId];
    return (p?.cantrips.length ?? 0) < k.cantrips || (p?.prepared.length ?? 0) < k.prepared;
  });
  const species = registry.species.get(character.speciesId);
  const lineage = species?.lineages?.find((l) => l.id === character.lineageId);

  return (
    <SheetProvider value={{ character, sheet, update }}>
    <div className="sheet">
      <header className="sheet-head">
        <div className="sheet-head__id">
          <BlazonShield blazon={blazonOf(character)} size={72} label={`Coat of arms: ${describeBlazon(blazonOf(character))}`} />
          <div>
            <h1>{character.name || 'Unnamed hero'}</h1>
            <p className="sheet-head__sub">
              Level {sheet.level} {sheet.classSummary || 'no class'} —{' '}
              {speciesLabel(species?.name, lineage?.name)}, {registry.backgrounds.get(character.backgroundId)?.name ?? 'no background'}
              {character.details.alignment && `, ${character.details.alignment}`}
              <span className="tag" style={{ marginLeft: '0.6em' }}>{character.ruleset} rules</span>
            </p>
          </div>
        </div>
        <div className="row sheet-head__actions">
          <span className="row">
            <button type="button" onClick={() => update((c) => shortRest(c, sheet))}>Short rest</button>
            <button type="button" onClick={() => update((c) => longRest(c, sheet))}>Long rest</button>
          </span>
          <span className="row">
            <Link className="btn" to={`/c/${character.id}/level-up`}>Level up</Link>
            <Link className="btn" to={`/c/${character.id}/history`}>History</Link>
            <Link className="btn" to={`/c/${character.id}/build/class`}>Edit</Link>
            <ExportMenu character={character} sheet={sheet} registry={registry} />
          </span>
        </div>
      </header>

      {(choicesOpen || showChoices || spellGaps.length > 0) && (
        <div className={`sheet-alert ${choicesOpen || spellGaps.length > 0 ? '' : 'is-done'}`} role="status">
          <span>
            {sheet.collected.needsSubclass.length > 0 && 'Choose your subclass. '}
            {pending.length > 0 && `${pending.length} choice${pending.length > 1 ? 's' : ''} still open. `}
            {!choicesOpen && showChoices && '✓ All choices made. '}
            {spellGaps.length > 0 && `You can pick more ${spellGaps.map((k) => k.name).join(' and ')} spells.`}
          </span>
          {(choicesOpen || showChoices) && (
            <button
              type="button"
              className={`btn-small ${!choicesOpen && showChoices ? 'btn-primary' : ''}`}
              onClick={() => setShowChoices((v) => !v)}
            >
              {!choicesOpen ? 'Done' : showChoices ? 'Hide choices' : 'Make choices'}
            </button>
          )}
        </div>
      )}
      {showChoices && (
        <section className="panel">
          {sheet.collected.needsSubclass.map((classId) => (
            <div key={classId} style={{ marginBottom: '1rem' }}>
              <h3>{registry.classes.get(classId)?.name} subclass</h3>
              <SubclassPicker character={character} classId={classId} onChange={(c) => update((prev) => applyBuildEdit(prev, c, registry))} />
            </div>
          ))}
          <ChoicesPanel character={character} sheet={sheet} filter={sticky} onChange={(c) => update((prev) => applyBuildEdit(prev, c, registry))} />
        </section>
      )}
      {sheet.warnings.map((w) => (
        <p key={w} className="notice">{w}</p>
      ))}

      <div className="sheet-grid">
        <div className="col">
          <Abilities sheet={sheet} />
          <Skills sheet={sheet} />
          <Proficiencies sheet={sheet} />
        </div>
        <div className="col">
          <Combat character={character} sheet={sheet} update={update} />
          <ActiveEffects />
          <Attacks />
          <Spells />
        </div>
        <div className="col">
          <Resources character={character} sheet={sheet} update={update} />
          <FeaturesBlock sheet={sheet} />
          <Inventory />
          <Companions />
          <Notes character={character} update={update} />
        </div>
      </div>
      <DiceDock />
    </div>
    </SheetProvider>
  );
}

/** "Hill Dwarf", "Dark Elf (Drow)", "Drow Elf": avoids repeating the base race name. */
function speciesLabel(species?: string, lineage?: string) {
  if (!species) return 'no species';
  if (!lineage) return species;
  const base = species.replace(/\s*\(.*\)$/, '');
  return new RegExp(`\\b${base}\\b`).test(lineage) ? lineage : `${lineage} ${base}`;
}

function Abilities({ sheet }: { sheet: SheetData }) {
  return (
    <section className="block">
      <div className="block__head">
        <h2>Abilities</h2>
        <span className="muted small">Proficiency {fmtMod(sheet.profBonus)}</span>
      </div>
      <div className="abilities">
        {ABILITIES.map((a) => {
          const x = sheet.abilities[a];
          return (
            <div key={a} className="ability">
              <span className="ability__name">{ABILITY_NAMES[a]}</span>
              <Shield>
                <RollButton label={`${ABILITY_NAMES[a]} check`} expr={d20(x.mod)} d20 kind="check" className="ability__mod">
                  {fmtMod(x.mod)}
                </RollButton>
              </Shield>
              <span className="ability__score" title="Score">{x.score}</span>
              <RollButton label={`${ABILITY_NAMES[a]} save`} expr={d20(x.save)} d20 kind="save" className={`ability__save ${x.saveProf ? 'is-prof' : ''}`}>
                Save {fmtMod(x.save)}
              </RollButton>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Skills({ sheet }: { sheet: SheetData }) {
  return (
    <section className="block">
      <div className="block__head">
        <h2>Skills</h2>
      </div>
      <dl className="passives">
        <span className="field-label">Passive</span>
        {([['Perception', sheet.passives.perception], ['Investigation', sheet.passives.investigation], ['Insight', sheet.passives.insight]] as const).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="skills">
        {sheet.skills.map((s) => (
          <li key={s.id}>
            <span className={`prof-dot ${s.expertise ? 'exp' : s.proficient ? 'prof' : ''}`} aria-label={s.expertise ? 'Expertise' : s.proficient ? 'Proficient' : 'Not proficient'} />
            <RollButton label={s.name} expr={d20(s.bonus)} d20 kind="check" className="skill-roll">
              <span>{s.name}</span>
              <span className="muted small">{s.ability.toUpperCase()}</span>
              <strong>{fmtMod(s.bonus)}</strong>
            </RollButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Proficiencies({ sheet }: { sheet: SheetData }) {
  const { registry } = useRules();
  const p = sheet.proficiencies;
  const armor = p.armor.map((a) => (a === 'shield' ? 'Shields' : `${a[0].toUpperCase()}${a.slice(1)} armor`));
  const weapons = p.weapons.map((w) => (w === 'simple' ? 'Simple weapons' : w === 'martial' ? 'Martial weapons' : registry.items.get(w)?.name ?? w));
  const rows: [string, string[]][] = [
    ['Armor', armor],
    ['Weapons', weapons],
    ['Tools', p.tools.map((t) => registry.tools.get(t)?.name ?? t)],
    ['Languages', p.languages.map((l) => registry.languages.get(l)?.name ?? l)],
  ];
  return (
    <section className="block">
      <h2>Training</h2>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v.length ? v.join(', ') : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Combat({ character, sheet, update }: { character: Character; sheet: SheetData; update: Update }) {
  const { registry } = useRules();
  const { rollDice } = useDice();
  const play = character.play;
  const hp = currentHp(character, sheet);
  const conditions = registry.data.keywords.filter((k) => k.kind === 'condition' && k.id !== 'exhaustion');
  const setPlay = (patch: Partial<Character['play']>) => update((c) => ({ ...c, play: { ...c.play, ...patch } }));

  return (
    <section className="block">
      <div className="stats">
        <div className="stat">
          <span className="stat__label">Armor Class</span>
          <span className="stat__value">{sheet.ac}</span>
          <span className="stat__note">{sheet.acNote}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Initiative</span>
          <RollButton label="Initiative" expr={d20(sheet.initiative)} d20 kind="check" className="stat__value">
            {fmtMod(sheet.initiative)}
          </RollButton>
        </div>
        <div className="stat">
          <span className="stat__label">Speed</span>
          <span className="stat__value">{sheet.speed}</span>
          <span className="stat__note">feet</span>
        </div>
        <div className="stat">
          <span className="stat__label">Size</span>
          <span className="stat__value stat__value--word">{sheet.size}</span>
        </div>
      </div>

      {(sheet.speeds.length > 0 || sheet.senses.length > 0) && (
        <p className="small senses">
          {sheet.speeds.map((sp) => (
            <span key={sp.mode}>
              {sp.mode[0].toUpperCase() + sp.mode.slice(1)} {sp.value} ft.{sp.hover ? ' (hover)' : ''}
            </span>
          ))}
          {sheet.senses.map((se) => (
            <span key={se.sense}>
              <Keyword refId={se.sense}>{se.sense[0].toUpperCase() + se.sense.slice(1)}</Keyword> {se.range} ft.
            </span>
          ))}
        </p>
      )}

      <HpControl
        name={character.name || 'Character'}
        title="Hit Points"
        hp={hp}
        max={sheet.maxHp}
        temp={play.tempHp}
        onDamage={(n) => update((c) => applyDamage(c, sheet, n))}
        onHeal={(n) => update((c) => heal(c, sheet, n))}
        // Temporary HP don't stack: keep the higher amount. Setting 0 clears them.
        onTemp={(n) => update((c) => ({ ...c, play: { ...c.play, tempHp: n === 0 ? 0 : Math.max(c.play.tempHp, n) } }))}
      >
        {sheet.resistances.length > 0 && (
          <p className="small">
            <Keyword refId="resistance">Resistance</Keyword>: {sheet.resistances.join(', ')}
          </p>
        )}
      </HpControl>

      {hp === 0 && sheet.maxHp > 0 && (
        <DeathSaves
          saves={play.deathSaves}
          onSet={(deathSaves) => setPlay({ deathSaves })}
          onRoll={() => {
            const r = rollDice('Death saving throw', withRollBonuses('1d20', sheet, 'save'), { d20: true });
            const d = r?.rolls.find((x) => x.sides === 20);
            if (!r || !d) return;
            const face = d.kept ?? d.values[0];
            update((c) => applyDeathSave(c, face, r.total - face));
          }}
        />
      )}

      <div className="hitdice">
        <span className="field-label">Hit dice</span>
        {sheet.hitDice.map((h) => {
          const used = play.hitDiceUsed[h.die] ?? 0;
          return (
            <button key={h.die} type="button" className="btn-small" disabled={used >= h.total} title="Spend one to heal (short rest)" onClick={() => {
              const face = defaultRng(Number(h.die.slice(1)));
              update((c) => spendHitDie(c, sheet, h.die, () => face).char);
            }}>
              {h.total - used}/{h.total} {h.die}
            </button>
          );
        })}
        <label className="row small" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={play.heroicInspiration} onChange={(e) => setPlay({ heroicInspiration: e.target.checked })} />
          <Keyword refId="heroic-inspiration">Heroic Inspiration</Keyword>
        </label>
      </div>

      <div className="conditions">
        <span className="field-label">Conditions</span>
        <div className="chips">
          {conditions.map((k) => {
            const on = play.conditions.includes(k.id);
            return (
              <span key={k.id} className={`cond ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  id={`cond-${k.id}`}
                  checked={on}
                  onChange={() => setPlay({ conditions: on ? play.conditions.filter((x) => x !== k.id) : [...play.conditions, k.id] })}
                />
                <label htmlFor={`cond-${k.id}`}>
                  <Keyword refId={k.id}>{k.term}</Keyword>
                </label>
              </span>
            );
          })}
          <span className="cond">
            <Keyword refId="exhaustion">Exhaustion</Keyword>
            <select value={play.exhaustion} onChange={(e) => setPlay({ exhaustion: Number(e.target.value) })} aria-label="Exhaustion level">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </span>
        </div>
      </div>
    </section>
  );
}

function Resources({ character, sheet, update }: { character: Character; sheet: SheetData; update: Update }) {
  if (!sheet.counters.length) return null;
  const counters = character.play.counters;
  const set = (id: string, v: number) => update((c) => ({ ...c, play: { ...c.play, counters: { ...c.play.counters, [id]: v } } }));
  return (
    <section className="block block--resources">
      <h2>Resources</h2>
      {sheet.counters.map((k) => {
        const used = counters[k.id] ?? 0;
        return (
          <div key={k.id} className="resource">
            <span>
              {k.label} <span className="small muted">({k.reset === 'short' ? 'short' : 'long'} rest)</span>
            </span>
            {k.max <= 10 ? (
              <Pips label={k.label} total={k.max} used={used} onSet={(v) => set(k.id, v)} />
            ) : (
              <span className="row">
                <button type="button" className="btn-small" aria-label={`Spend ${k.label}`} disabled={used >= k.max} onClick={() => set(k.id, used + 1)}>−</button>
                <strong>{k.max - used}</strong>/{k.max}
                <button type="button" className="btn-small" aria-label={`Restore ${k.label}`} disabled={used <= 0} onClick={() => set(k.id, used - 1)}>+</button>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FeaturesBlock({ sheet }: { sheet: SheetData }) {
  const { registry } = useRules();
  const groups = groupRows(featureRows(sheet, registry));
  return (
    <section className="block">
      <h2>Features & traits</h2>
      {groups.map(([g, list]) => (
        <div key={g} className="feature-group">
          <h3>{g}</h3>
          {list.map((row) => (
            <FeatureRowView key={row.key} row={row} />
          ))}
        </div>
      ))}
    </section>
  );
}

function Notes({ character, update }: { character: Character; update: Update }) {
  return (
    <section className="block">
      <h2>Notes</h2>
      <textarea
        aria-label="Notes"
        value={character.details.notes}
        onChange={(e) => update((c) => ({ ...c, details: { ...c.details, notes: e.target.value } }))}
      />
    </section>
  );
}
