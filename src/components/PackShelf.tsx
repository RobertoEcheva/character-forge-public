import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { installPack, listPacks, packSize, packStats, removePack, type PackFile } from '../data/packs';
import { useApp } from '../state/AppState';
import type { Edition } from '../types/rules';

/** Pack names end in "— mechanics"; the shelf shows just the book. */
const bookName = (p: PackFile) => p.name.replace(/ — mechanics$/, '');

const EDITIONS: { id: Edition; label: string; base: string }[] = [
  { id: '2024', label: '2024 rules', base: 'SRD 5.2.1, built in' },
  { id: '2014', label: '2014 rules', base: 'SRD 5.1, built in' },
];

/**
 * Compact list of the bundled rules packs, per rule set, with one-click install and remove.
 * Shown on the landing page so players can add book content before they build a character.
 */
export function PackShelf() {
  const { custom, setCustom } = useApp();
  const [packs, setPacks] = useState<PackFile[] | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let live = true;
    listPacks()
      .then((p) => live && setPacks(p))
      .catch(() => live && setPacks([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="shelf" aria-labelledby="shelf-title">
      <div className="shelf__head">
        <h2 id="shelf-title">Rules packs</h2>
        <Link to="/packs" className="small">
          Manage packs and your own content
        </Link>
      </div>
      <p className="muted small shelf__intro">
        The free rules are always here. To add subclasses, species, backgrounds, feats and spells from books you own, import them as
        JSON on the <Link to="/packs">Rules packs</Link> page.
      </p>
      {status && (
        <p className="ok-note small" role="status">
          {status}
        </p>
      )}
      <div className="shelf__cols">
        {EDITIONS.map((ed) => (
          <div key={ed.id} className="shelf__col">
            <h3>{ed.label}</h3>
            <ul className="shelf__list">
              <li className="shelf__item is-base">
                <span className="shelf__name">Core rules</span>
                <span className="shelf__meta">{ed.base}</span>
                <span className="shelf__state">✓ Included</span>
              </li>
              {packs === null && <li className="muted small">Loading packs…</li>}
              {(packs ?? [])
                .filter((p) => (p.edition ?? '2024') === ed.id)
                .map((p) => {
                  const installed = packStats(custom, p.id).installed > 0;
                  return (
                    <li key={p.id} className={`shelf__item ${installed ? 'is-on' : ''}`}>
                      <span className="shelf__name">{bookName(p)}</span>
                      <span className="shelf__meta">
                        {packSize(p)} {packSize(p) === 1 ? 'entry' : 'entries'}
                      </span>
                      {installed ? (
                        <button
                          type="button"
                          className="btn-small btn-quiet"
                          aria-label={`Remove ${bookName(p)}`}
                          onClick={() => {
                            setCustom(removePack(custom, p.id));
                            setStatus(`Removed ${bookName(p)}.`);
                          }}
                        >
                          <span className="shelf__state">✓ Installed</span> Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-small btn-primary"
                          onClick={() => {
                            setCustom(installPack(custom, p));
                            setStatus(`Installed ${bookName(p)}. Its options now appear in the builder.`);
                          }}
                        >
                          Install
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
