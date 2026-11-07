import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ChoicesPanel, useStickyPending } from '../components/Choices';
import { FeatureList } from '../components/Features';
import { SpellPicker } from '../components/SpellPicker';
import { SubclassPicker } from '../components/SubclassPicker';
import { deriveSheet } from '../engine/derive';
import { addLevel, fixedHp, multiclassBlockers, recordLevelSpells, removeLastLevel } from '../engine/ops';
import { RulesProvider, useRules, useCharacter } from '../state/AppState';

export default function LevelUp() {
  const { id } = useParams();
  const [character] = useCharacter(id);
  if (!character) return <Navigate to="/" replace />;
  return (
    <RulesProvider edition={character.ruleset}>
      <LevelUpView />
    </RulesProvider>
  );
}

function LevelUpView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [character, update] = useCharacter(id);
  const { registry } = useRules();
  const sheet = useMemo(() => (character ? deriveSheet(character, registry) : null), [character, registry]);
  const [classId, setClassId] = useState(character?.levels.at(-1)?.classId ?? character?.levels[0]?.classId ?? '');
  const [hpMode, setHpMode] = useState<'fixed' | 'roll'>('fixed');
  const sticky = useStickyPending(sheet);
  if (!character || !sheet) return <Navigate to="/" replace />;
  if (!character.levels.length) return <Navigate to={`/c/${character.id}/build/class`} replace />;

  const afterLevel = params.get('step') === 'choices';
  const owned = sheet.collected.classOrder;

  if (afterLevel) {
    const last = character.levels.at(-1)!;
    const cls = registry.classes.get(last.classId)!;
    const classLevel = sheet.collected.classLevels.get(last.classId) ?? 1;
    const newFeatures = cls.features.filter((f) => f.level === classLevel && !f.hidden);
    const subId = character.subclasses[last.classId];
    const sub = subId ? registry.subclasses.get(subId) : undefined;
    const subFeatures = sub?.features.filter((f) => f.level === classLevel && !f.hidden) ?? [];
    return (
      <div className="levelup">
        <header className="step-head">
          <h1>
            Level {sheet.level}: {cls.name} {classLevel}
          </h1>
          <p>
            Hit points +{last.hpGain + sheet.abilities.con.mod} (now {sheet.maxHp}). Make any choices this level opened, then return to your sheet.
          </p>
        </header>

        {sheet.collected.needsSubclass.includes(last.classId) || (classLevel === cls.subclassLevel && sub) ? (
          <section className="detail">
            <h2>Subclass</h2>
            <SubclassPicker character={character} classId={last.classId} onChange={(c) => update(() => c)} />
          </section>
        ) : null}

        {(newFeatures.length > 0 || subFeatures.length > 0) && (
          <section className="detail">
            <h2>New features</h2>
            <FeatureList features={[...newFeatures, ...subFeatures]} open />
          </section>
        )}

        <section className="detail">
          <h2>Choices</h2>
          <ChoicesPanel
            character={character}
            sheet={sheet}
            filter={sticky}
            onChange={(c) => update(() => c)}
            emptyText="No open choices."
          />
        </section>

        {sheet.casters.map((k) => (
          <section key={k.classId} className="detail">
            <h2>{k.name} spells</h2>
            <SpellPicker character={character} caster={k} sheet={sheet} onChange={(c) => update((prev) => recordLevelSpells(prev, c))} />
          </section>
        ))}

        <div className="step-nav">
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              update(removeLastLevel);
              setParams({});
            }}
          >
            Undo this level
          </button>
          <Link className="btn btn-primary" to={`/c/${character.id}`}>Back to sheet</Link>
        </div>
      </div>
    );
  }

  const target = registry.classes.get(classId);
  const blockers = target ? multiclassBlockers(character, classId, sheet, registry) : [];
  const canLevel = Boolean(target) && blockers.length === 0 && sheet.level < 20;

  return (
    <div className="levelup">
      <header className="step-head">
        <h1>Level up to {sheet.level + 1}</h1>
        <p>Choose which class gains the level. Taking a new class is multiclassing and requires 13 in the primary abilities of both classes.</p>
      </header>
      <div className="picker">
        {registry.data.classes.map((c) => (
          <button key={c.id} type="button" className="pick" aria-pressed={c.id === classId} onClick={() => setClassId(c.id)}>
            <strong>{c.name}</strong>
            <small>{owned.includes(c.id) ? `Level ${(sheet.collected.classLevels.get(c.id) ?? 0) + 1}` : 'New class'}</small>
          </button>
        ))}
      </div>
      {blockers.length > 0 && <p className="notice">Multiclass requirements not met: {blockers.join('; ')}.</p>}
      {target && (
        <section className="detail">
          <h2>Hit points</h2>
          <div className="row">
            <label className="row">
              <input type="radio" name="hp" checked={hpMode === 'fixed'} onChange={() => setHpMode('fixed')} />
              Take {fixedHp(target.hitDie)} + Con
            </label>
            <label className="row">
              <input type="radio" name="hp" checked={hpMode === 'roll'} onChange={() => setHpMode('roll')} />
              Roll 1d{target.hitDie} + Con
            </label>
          </div>
        </section>
      )}
      <div className="step-nav">
        <Link className="btn" to={`/c/${character.id}`}>Cancel</Link>
        <button
          type="button"
          className="btn-primary"
          disabled={!canLevel}
          onClick={() => {
            update((c) => addLevel(c, classId, registry, hpMode));
            setParams({ step: 'choices' });
          }}
        >
          Gain level in {target?.name ?? '…'}
        </button>
      </div>
    </div>
  );
}
