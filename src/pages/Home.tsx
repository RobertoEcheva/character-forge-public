import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BlazonShield } from '../components/Blazon';
import { blazonOf } from '../data/blazon';
import { PackShelf } from '../components/PackShelf';
import { deriveSheet } from '../engine/derive';
import { uid } from '../engine/ops';
import { useApp } from '../state/AppState';
import { downloadJson, parseCharacterImport, readJsonFile } from '../storage/storage';
import { newCharacter, type Character } from '../types/character';

export default function Home() {
  const { characters, saveCharacter, deleteCharacter, rules } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const list = Object.values(characters).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const empty = list.length === 0;

  const create = () => {
    const c = newCharacter(uid());
    saveCharacter(c);
    navigate(`/c/${c.id}/build/ruleset`);
  };

  const actions = (
    <div className="row">
      <button type="button" className="btn-primary" onClick={create}>
        Create a character
      </button>
      <label className="btn">
        Import character
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const c = parseCharacterImport(await readJsonFile(f));
              if (typeof c === 'string') return setError(c);
              // Keep both copies when importing a character that already exists here.
              const imported = characters[c.id] ? { ...c, id: uid() } : c;
              saveCharacter(imported);
              setError('');
            } catch {
              setError('That file is not valid JSON.');
            }
          }}
        />
      </label>
    </div>
  );

  const crest = (c: Character) => {
    const { registry } = rules[c.ruleset];
    const s = deriveSheet(c, registry);
    const species = registry.species.get(c.speciesId)?.name;
    const unfinished = !c.levels.length || !c.speciesId || !c.backgroundId;
    return (
      <li key={c.id} className="crest">
        <Link className="crest__link" to={unfinished ? `/c/${c.id}/build/class` : `/c/${c.id}`}>
          <BlazonShield blazon={blazonOf(c)} size={88} className="crest__shield" />
          <span className="crest__name">{c.name || 'Unnamed hero'}</span>
        </Link>
        <span className="crest__sub">
          {c.levels.length ? `Level ${s.level} ${s.classSummary}` : 'No class yet'}
          {species && `, ${species}`}
        </span>
        <span className="crest__tags">
          <span className="tag">{c.ruleset} rules</span>
          {unfinished && <span className="tag tag-unverified">In progress</span>}
        </span>
        <div className="crest__actions">
          {confirmDelete === c.id ? (
            <>
              <span className="small">Delete {c.name || 'this character'}?</span>
              <button type="button" className="btn-small btn-danger" onClick={() => (deleteCharacter(c.id), setConfirmDelete(null))}>
                Delete
              </button>
              <button type="button" className="btn-small" onClick={() => setConfirmDelete(null)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-small" to={`/c/${c.id}/build/class`}>
                Edit
              </Link>
              <button type="button" className="btn-small" onClick={() => saveCharacter({ ...c, id: uid(), name: `${c.name || 'Unnamed hero'} (copy)` })}>
                Duplicate
              </button>
              <button
                type="button"
                className="btn-small"
                title="Save file for backup or import. For a printable PDF, open the sheet and use Export."
                onClick={() => downloadJson(`${c.name || 'character'}.json`, c)}
              >
                Export JSON
              </button>
              <button type="button" className="btn-small btn-quiet" onClick={() => setConfirmDelete(c.id)}>
                Delete
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="home">
      <section className="home-hero">
        <h1>{empty ? 'Forge your first hero' : 'Your characters'}</h1>
        <p className="muted">
          {empty
            ? 'Pick the rules you play with, then build a Dungeons & Dragons character step by step. You play from a one-page sheet that tracks hit points, spell slots and conditions and rolls your dice.'
            : 'Open a sheet to play, or keep building. Everything is saved in this browser.'}
        </p>
        {!empty && actions}
        {error && <p className="notice">{error}</p>}
      </section>

      {empty ? (
        <>
          <PackShelf />
          <section className="home-start">
            <h2>Start building</h2>
            <p className="muted small">You choose 2014 or 2024 rules as the first step. Packs can be added any time.</p>
            {actions}
          </section>
        </>
      ) : (
        <>
          <ul className="roster">{list.map(crest)}</ul>
          <PackShelf />
        </>
      )}
    </div>
  );
}
