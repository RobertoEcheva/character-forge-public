import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChoicesPanel } from '../components/Choices';
import { FeatureRowView } from '../components/Features';
import { SubclassPicker } from '../components/SubclassPicker';
import { deriveSheet, fmtMod } from '../engine/derive';
import { levelHistory, type LevelStep } from '../engine/history';
import { applyBuildEdit } from '../engine/ops';
import { RulesProvider, useCharacter, useRules } from '../state/AppState';
import type { Character } from '../types/character';

export default function History() {
  const { id } = useParams();
  const [character] = useCharacter(id);
  if (!character) return <Navigate to="/" replace />;
  return (
    <RulesProvider edition={character.ruleset}>
      <HistoryView />
    </RulesProvider>
  );
}

function HistoryView() {
  const { id } = useParams();
  const [character, update] = useCharacter(id);
  const { registry } = useRules();
  const sheet = useMemo(() => (character ? deriveSheet(character, registry) : null), [character, registry]);
  const [editing, setEditing] = useState<number | null>(null);
  if (!character || !sheet) return <Navigate to="/" replace />;
  if (!character.levels.length) return <Navigate to={`/c/${character.id}/build/class`} replace />;

  const steps = levelHistory(character, sheet, registry).reverse();
  // Picks here can change max HP (a Con increase, a feat); current HP moves with it.
  const onChange = (c: Character) => update((prev) => applyBuildEdit(prev, c, registry));

  return (
    <div className="levelup history">
      <header className="step-head">
        <h1>Level history</h1>
        <p>What {character.name || 'your character'} gained and picked at each level. Use Change to revisit a level’s choices.</p>
      </header>

      <ol className="history__list">
        {steps.map((step) => (
          <li key={step.level} className="history__step">
            <div className="history__head">
              <span className="history__level">{step.level}</span>
              <div>
                <h2>
                  {step.className} {step.classLevel}
                </h2>
                <p className="small muted">
                  HP {fmtMod(step.hp.gain)}
                  {step.level === 1 ? ' (max die)' : step.hp.rolled ? ' (rolled)' : ' (fixed)'}
                  {step.subclass && ` · Subclass: ${step.subclass.name ?? 'not chosen'}`}
                </p>
              </div>
              {(step.choiceKeys.length > 0 || step.subclass) && (
                <button
                  type="button"
                  className="btn-small"
                  aria-expanded={editing === step.level}
                  onClick={() => setEditing(editing === step.level ? null : step.level)}
                >
                  {editing === step.level ? 'Done' : 'Change'}
                </button>
              )}
            </div>

            {editing === step.level ? (
              <div className="history__edit">
                <p className="small muted">
                  Changes apply right away. Later picks that depended on this one (feat prerequisites, spells) may need another look.
                </p>
                {step.subclass && <SubclassPicker character={character} classId={step.subclass.classId} onChange={onChange} />}
                <ChoicesPanel
                  character={character}
                  sheet={sheet}
                  filter={(c) => step.choiceKeys.includes(c.key)}
                  onChange={onChange}
                  emptyText="No choices at this level."
                />
              </div>
            ) : (
              <>
                {step.features.length > 0 ? (
                  step.features.map((row) => <FeatureRowView key={row.key} row={row} showLevel={false} />)
                ) : (
                  <p className="small muted">No new features.</p>
                )}
                <SpellLine step={step} />
              </>
            )}
          </li>
        ))}
      </ol>

      <div className="step-nav">
        <Link className="btn btn-primary" to={`/c/${character.id}`}>Back to sheet</Link>
      </div>
    </div>
  );
}

function SpellLine({ step }: { step: LevelStep }) {
  const { registry } = useRules();
  if (step.level === 1) return null;
  if (step.spells === 'not-recorded') return <p className="small muted history__spells">Spells not recorded for this level.</p>;
  const name = (id: string) => registry.spells.get(id)?.name ?? id;
  const { added, removed } = step.spells;
  if (!added.length && !removed.length) return null;
  return (
    <p className="small history__spells">
      {added.length > 0 && (
        <>
          <span className="field-label">Learned</span> {added.map(name).join(', ')}
        </>
      )}
      {added.length > 0 && removed.length > 0 && ' · '}
      {removed.length > 0 && (
        <>
          <span className="field-label">Replaced</span> {removed.map(name).join(', ')}
        </>
      )}
    </p>
  );
}
