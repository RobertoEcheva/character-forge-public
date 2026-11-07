import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { checkJson, parseImport } from '../data/importContent';
import {
  applyImport,
  deleteUserPack,
  exportPack,
  installPack,
  listPacks,
  packSize,
  packStats,
  removePack,
  renameUserPack,
  setEntryPack,
  type PackFile,
  type PackTarget,
} from '../data/packs';
import type { UserPack } from '../data/registry';
import { customContentSchema } from '../data/schema';
import { RulesProvider, useApp, useRules } from '../state/AppState';
import { ABILITIES, ABILITY_NAMES, EDITIONS, SKILLS, SKILL_IDS, type Edition, type Effect } from '../types/rules';
import { downloadJson, readJsonFile } from '../storage/storage';
import { CONTENT_TYPES, type ActionDraft, type ContentType, type Draft, type FeatureDraft, type Field, type NamedText, type SpellRow } from './customForms';

type Entity = {
  id: string;
  name?: string;
  term?: string;
  source?: string;
  pack?: string;
  unverified?: boolean;
  edited?: boolean;
  edition?: Edition;
};

const editionOf = (e: { edition?: Edition }) => e.edition ?? '2024';

/** Parser detail plus the usual culprits, for people new to JSON. */
const jsonHint = (err: unknown) =>
  ` (${err instanceof Error ? err.message : 'parse error'}). Look for a missing comma or quote, or an extra comma before } or ]. See templates/README.md.`;

export default function CustomContentPage() {
  const { custom, setCustom, rules } = useApp();
  const [edition, setEdition] = useState<Edition>('2024');
  const { registry } = rules[edition];
  const [typeKey, setTypeKey] = useState(CONTENT_TYPES[0].key);
  const [editing, setEditing] = useState<{ draft: Draft; originalId?: string } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [json, setJson] = useState('');
  // Result of the last import, shown next to the import controls rather than at the top of the page.
  const [importMessage, setImportMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const deferredJson = useDeferredValue(json);
  const check = useMemo(() => checkJson(deferredJson, edition), [deferredJson, edition]);
  const [packs, setPacks] = useState<PackFile[] | null>(null);
  /** Import target: "" = not in a pack, "pack:<id>", "new", or "file" (the imported pack file's own pack). */
  const [packChoice, setPackChoice] = useState('');
  const [newPackName, setNewPackName] = useState('');
  const [textEditing, setTextEditing] = useState<Entity | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    listPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);
  const type = CONTENT_TYPES.find((t) => t.key === typeKey)!;
  const builtinIds = (packs ?? []).map((p) => p.id);
  const builtinHere = (packs ?? []).filter((p) => (p.edition ?? '2024') === edition);
  const userPacks = (custom.packs ?? []).filter((p) => p.edition === edition);
  /** Packs entries can be put in: installed built-in packs and the user's own, for this edition. */
  const packOptions = [
    ...builtinHere.filter((p) => packStats(custom, p.id).installed > 0).map((p) => ({ id: p.id, name: p.name })),
    ...userPacks.map((p) => ({ id: p.id, name: p.name })),
  ];
  const packName = (id?: string) => packOptions.find((p) => p.id === id)?.name ?? (packs ?? []).find((p) => p.id === id)?.name ?? id;
  /** Entries that came from a built-in pack file keep the text-only editor. */
  const fromBuiltin = (e: Entity) => Boolean(e.pack && builtinIds.includes(e.pack) && e.unverified !== undefined);
  const all = (custom[type.key] ?? []) as Entity[];
  const entries = all.filter((e) => editionOf(e) === edition);
  /** Replace this edition's entries of the current type, leaving the other edition's alone. */
  const saveEntries = (list: Entity[]) =>
    setCustom({ ...custom, [type.key]: [...all.filter((e) => editionOf(e) !== edition), ...list] });
  const q = query.trim().toLowerCase();
  const shown = q ? entries.filter((e) => (e.name ?? e.term ?? '').toLowerCase().includes(q)) : entries;
  // Creatures aren't in the rules registry (SRD stat blocks load lazily), so there's nothing to collide with here.
  const srdList = type.key === 'creatures' ? [] : (registry.data[type.key] as Entity[]);
  const srdIds = new Set(srdList.filter((e) => e.source !== 'custom').map((e) => e.id));

  const saveEntity = () => {
    if (!editing) return;
    const entity = { ...type.toEntity(editing.draft), ...(edition === '2024' ? {} : { edition }) };
    if (!entity.id) return setMessage({ kind: 'error', text: 'Give it a name first.' });
    const schema = customContentSchema.shape[type.key];
    const result = schema.safeParse([entity]);
    if (!result.success) {
      const issue = result.error.issues[0];
      return setMessage({ kind: 'error', text: `${issue.path.slice(1).join('.') || 'Entry'}: ${issue.message}` });
    }
    const others = entries.filter((e) => e.id !== editing.originalId && e.id !== entity.id);
    saveEntries([...others, entity]);
    setEditing(null);
    setMessage({ kind: 'ok', text: `Saved ${type.label.toLowerCase()} “${entity.name ?? entity.term}”.${srdIds.has(entity.id) ? ' It replaces the SRD entry with the same name.' : ''}` });
  };

  const remove = (id: string) => {
    saveEntries(entries.filter((e) => e.id !== id));
    setMessage({ kind: 'ok', text: 'Deleted.' });
  };

  /** Returns true when the content was imported. */
  const importContent = (data: unknown): boolean => {
    const result = parseImport(data, edition);
    if ('error' in result) {
      setImportMessage({ kind: 'error', text: `Import failed: ${result.error}` });
      return false;
    }
    if (packChoice === 'new' && !newPackName.trim()) {
      setImportMessage({ kind: 'error', text: 'Give the new pack a name first.' });
      return false;
    }
    // A pack file goes into its own pack unless another target was picked.
    const target: PackTarget =
      packChoice === 'new'
        ? { kind: 'new', name: newPackName }
        : packChoice.startsWith('pack:')
          ? { kind: 'existing', id: packChoice.slice(5) }
          : result.pack && (packChoice === 'file' || packChoice === '')
            ? { kind: 'file' }
            : { kind: 'none' };
    const targetEdition = target.kind === 'file' && result.pack ? result.pack.edition : edition;
    const r = applyImport(custom, result, target, targetEdition, builtinIds);
    setCustom(r.custom);
    setImportMessage({
      kind: 'ok',
      text: `Imported ${r.count} entr${r.count === 1 ? 'y' : 'ies'}${r.pack ? ` into the pack “${r.pack.name}”` : ''} (${targetEdition} rules).`,
    });
    if (packChoice === 'new') {
      setNewPackName('');
      setPackChoice(r.pack ? `pack:${r.pack.id}` : '');
    }
    return true;
  };

  return (
    <RulesProvider edition={edition}>
    <div className="custom">
      <header className="step-head">
        <h1>Rules packs</h1>
        <p>
          Import packs you've made or been given, or add your own homebrew. Everything stays in this browser, shows up in the builder with a
          Custom tag, and is included in exports you make here.
        </p>
      </header>
      {/* Form errors show next to the Save button instead. */}
      {message && !(editing && message.kind === 'error') && <p className={message.kind === 'error' ? 'notice' : 'ok-note'}>{message.text}</p>}

      <div className="row edition-switch" role="radiogroup" aria-label="Rule set">
        {EDITIONS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={edition === e}
            className={edition === e ? 'btn-primary' : ''}
            onClick={() => (setEdition(e), setEditing(null), setTextEditing(null), setQuery(''), setMessage(null))}
          >
            {e} rules
          </button>
        ))}
      </div>

      {(builtinHere.length > 0 || userPacks.length > 0) && (
        <section className="packs" aria-label="Content packs">
          <h2>Packs</h2>
          {builtinHere.map((p) => {
            const stats = packStats(custom, p.id);
            const added = ((Object.values(custom) as unknown[]).filter(Array.isArray).flat() as Entity[]).filter(
              (e) => e.pack === p.id && e.unverified === undefined,
            ).length;
            return (
              <div key={p.id} className="pack">
                <div>
                  <strong>{p.name}</strong>
                  <p className="small muted">{p.description}</p>
                  <p className="small">
                    {stats.installed
                      ? `Installed: ${stats.installed} entries, ${stats.unverified} not yet checked against your book${added ? `, ${added} added by you` : ''}.`
                      : `${packSize(p)} entries, not installed.`}
                  </p>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className={stats.installed ? '' : 'btn-primary'}
                    onClick={() => {
                      setCustom(installPack(custom, p));
                      setMessage({
                        kind: 'ok',
                        text: stats.installed
                          ? `Updated ${p.name}. Entries you checked or edited were kept as they are.`
                          : `Installed ${p.name}. Its options now appear in the builder with an Unverified tag.`,
                      });
                    }}
                  >
                    {stats.installed ? 'Update' : 'Install'}
                  </button>
                  {stats.installed > 0 && (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        setCustom(removePack(custom, p.id));
                        setMessage({ kind: 'ok', text: `Removed ${p.name}. Characters using its options keep their choices but lose those features until you reinstall it.` });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {userPacks.map((p) => (
            <UserPackCard
              key={p.id}
              pack={p}
              count={packStats(custom, p.id).installed}
              onExport={() => downloadJson(`${p.id}.json`, exportPack(custom, p))}
              onRename={(name, description) => setCustom(renameUserPack(custom, p.id, name, description))}
              onDelete={(keepEntries) => {
                setCustom(deleteUserPack(custom, p.id, keepEntries));
                if (packChoice === `pack:${p.id}`) setPackChoice('');
                setMessage({ kind: 'ok', text: keepEntries ? `Deleted the pack “${p.name}”; its entries are kept.` : `Deleted the pack “${p.name}” and its entries.` });
              }}
            />
          ))}
        </section>
      )}

      <div className="custom-layout">
        <nav className="steps" aria-label="Content types">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={t.key === typeKey ? 'step' : undefined}
              onClick={() => (setTypeKey(t.key), setEditing(null), setTextEditing(null), setQuery(''), setMessage(null))}
              className="no-count"
            >
              {t.plural} <span className="muted small">&nbsp;{((custom[t.key] ?? []) as Entity[]).filter((e) => editionOf(e) === edition).length || ''}</span>
            </button>
          ))}
        </nav>

        <main>
          {textEditing ? (
            <TextEditor
              entity={textEditing}
              onCancel={() => setTextEditing(null)}
              onSave={(updated) => {
                saveEntries(entries.map((e) => (e.id === updated.id ? updated : e)));
                setTextEditing(null);
                setMessage({ kind: 'ok', text: `Saved “${updated.name ?? updated.term}”.` });
              }}
            />
          ) : editing ? (
            <EntityForm
              type={type}
              draft={editing.draft}
              error={message?.kind === 'error' ? message.text : undefined}
              onChange={(draft) => setEditing({ ...editing, draft })}
              onSave={saveEntity}
              onCancel={() => (setEditing(null), setMessage(null))}
            />
          ) : (
            <>
              <div className="row" style={{ marginBottom: '1rem' }}>
                <h2 style={{ marginRight: 'auto' }}>{type.plural}</h2>
                <button type="button" className="btn-primary" onClick={() => (setEditing({ draft: type.empty() }), setMessage(null))}>
                  New {type.label.toLowerCase()}
                </button>
              </div>
              {entries.length > 8 && (
                <input
                  type="search"
                  placeholder={`Filter ${type.plural.toLowerCase()}`}
                  aria-label={`Filter ${type.plural.toLowerCase()}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.8rem' }}
                />
              )}
              {entries.length === 0 ? (
                <p className="empty">No custom {type.plural.toLowerCase()} yet.</p>
              ) : (
                <ul className="roster">
                  {shown.map((e) => (
                    <li key={e.id} className="roster__item">
                      <span>
                        <strong>{e.name ?? e.term}</strong>{' '}

                        {e.unverified && <span className="tag tag-unverified">Unverified</span>}
                        {e.edited && <span className="tag"> Your text</span>}
                      </span>
                      <span className="row">
                        <select
                          className="row-pack"
                          aria-label={`Pack for ${e.name ?? e.term}`}
                          value={e.pack ?? ''}
                          disabled={fromBuiltin(e)}
                          title={fromBuiltin(e) ? 'Part of the installed pack' : 'Move to a pack'}
                          onChange={(ev) => setCustom(setEntryPack(custom, type.key, e.id, edition, ev.target.value || undefined))}
                        >
                          <option value="">No pack</option>
                          {packOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                          {e.pack && !packOptions.some((o) => o.id === e.pack) && <option value={e.pack}>{packName(e.pack)}</option>}
                        </select>
                        {fromBuiltin(e) ? (
                          <button type="button" className="btn-small" onClick={() => setTextEditing(e)}>Edit text</button>
                        ) : (
                          <button type="button" className="btn-small" onClick={() => setEditing({ draft: type.fromEntity(e as never), originalId: e.id })}>Edit</button>
                        )}
                        <button type="button" className="btn-small btn-danger" onClick={() => remove(e.id)}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <section className="detail" style={{ marginTop: '2.5rem' }}>
            <h2>Import and export</h2>
            <p className="muted">
              Share content as a JSON file. Imports use the same format as the bundled SRD data, so advanced entries can include choices and
              effects (see <code>src/types/rules.ts</code>).
            </p>
            <div className="row">
              <button type="button" onClick={() => downloadJson('custom-content.json', custom)}>Export all custom content</button>
              <label className="btn">
                Import file
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try {
                      importContent(await readJsonFile(f));
                    } catch (err) {
                      setImportMessage({ kind: 'error', text: `${f.name} is not valid JSON${jsonHint(err)}` });
                    }
                  }}
                />
              </label>
            </div>
            <div className="row import-target">
              <label htmlFor="import-pack" className="small">
                Add imported entries to
              </label>
              <select id="import-pack" value={packChoice} onChange={(e) => setPackChoice(e.target.value)}>
                <option value="">{check.state === 'ok' && check.pack ? `Its own pack: ${check.pack.name}` : 'No pack'}</option>
                {packOptions.map((o) => (
                  <option key={o.id} value={`pack:${o.id}`}>
                    {o.name}
                  </option>
                ))}
                <option value="new">New pack…</option>
              </select>
              {packChoice === 'new' && (
                <input aria-label="New pack name" placeholder="Pack name, e.g. Homebrew Feats" value={newPackName} onChange={(e) => setNewPackName(e.target.value)} />
              )}
            </div>
            {importMessage && (
              <p className={`import-result ${importMessage.kind === 'error' ? 'notice' : 'ok-note'}`} role="status">
                {importMessage.text}
              </p>
            )}
            <div className="field" style={{ marginTop: '1rem' }}>
              <label htmlFor="json-paste">Or paste JSON, e.g. {'{ "feats": [ … ] }'}</label>
              <textarea
                id="json-paste"
                className={`json-paste json-paste--${check.state}`}
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setImportMessage(null);
                }}
                spellCheck={false}
                aria-describedby="json-check"
              />
              <JsonStatus check={check} />
            </div>
            <button
              type="button"
              className={check.state === 'ok' ? 'btn-primary' : ''}
              disabled={check.state !== 'ok'}
              onClick={() => {
                if (check.state === 'ok' && importContent(JSON.parse(json))) setJson('');
              }}
            >
              Import pasted JSON
            </button>
          </section>
        </main>
      </div>
    </div>
    </RulesProvider>
  );
}

function EntityForm({
  type,
  draft,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: ContentType<any>;
  draft: Draft;
  error?: string;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { registry } = useRules();
  const set = (key: string, v: Draft[string]) => onChange({ ...draft, [key]: v });
  const visible = (f: Field) => !f.when || f.when(draft);

  return (
    <form onSubmit={(e) => (e.preventDefault(), onSave())}>
      <h2 style={{ marginBottom: '1rem' }}>{type.label}</h2>
      {groupFields(type.fields.filter(visible)).map((g) =>
        g.group ? (
          <fieldset key={g.group} className="field field-grid">
            <legend>{g.group}</legend>
            {g.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} options={[]} />
            ))}
          </fieldset>
        ) : (
          g.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} options={'options' in f ? f.options(registry) : []} />
          ))
        ),
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="step-nav">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Save {type.label.toLowerCase()}</button>
      </div>
    </form>
  );
}

/** Consecutive fields with the same group become one row; others stay as they are. */
function groupFields(fields: Field[]): { group?: string; fields: Field[] }[] {
  const out: { group?: string; fields: Field[] }[] = [];
  for (const f of fields) {
    const group = f.type === 'number' ? f.group : undefined;
    const last = out[out.length - 1];
    if (group && last?.group === group) last.fields.push(f);
    else out.push({ group, fields: [f] });
  }
  return out;
}

function FieldInput({
  field,
  value,
  onChange,
  options,
}: {
  field: Field;
  value: Draft[string];
  onChange: (v: Draft[string]) => void;
  options: { id: string; name: string }[];
}) {
  const id = `f-${field.key}`;
  switch (field.type) {
    case 'text':
    case 'textarea':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          {field.type === 'text' ? (
            <input id={id} value={String(value ?? '')} required={field.required} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <textarea id={id} value={String(value ?? '')} required={field.required} onChange={(e) => onChange(e.target.value)} />
          )}
          {field.hint && <span className="small muted">{field.hint}</span>}
        </div>
      );
    case 'number':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <input id={id} type="number" min={field.min} max={field.max} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '8em' }} />
        </div>
      );
    case 'checkbox':
      return (
        <label className="row field">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {field.label}
        </label>
      );
    case 'select':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      );
    case 'multi': {
      const vals = (value as string[]) ?? [];
      return (
        <div className="field">
          <span className="label">{field.label}</span>
          <div className="chips">
            {options.map((o) => {
              const on = vals.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  disabled={!on && field.max !== undefined && vals.length >= field.max}
                  onClick={() => onChange(on ? vals.filter((v) => v !== o.id) : [...vals, o.id])}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'namedText':
      return <NamedTextInput label={field.label} itemLabel={field.itemLabel} rows={(value as NamedText[]) ?? []} onChange={onChange} />;
    case 'actions':
      return <ActionsInput label={field.label} rows={(value as ActionDraft[]) ?? []} onChange={onChange} />;
    case 'effects':
      return <EffectRowsInput label={field.label} hint={field.hint} rows={(value as Effect[]) ?? []} onChange={onChange} />;
    case 'spellsByLevel':
      return <SpellTableInput label={field.label} hint={field.hint} rows={(value as SpellRow[]) ?? []} onChange={onChange} />;
    case 'features': {
      const list = (value as FeatureDraft[]) ?? [];
      const setAt = (i: number, patch: Partial<FeatureDraft>) => onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
      return (
        <fieldset className="field features-edit">
          <legend>{field.label}</legend>
          {list.map((f, i) => (
            <div key={i} className="feature-edit">
              <div className="row">
                <input aria-label="Feature name" placeholder="Name" value={f.name} onChange={(e) => setAt(i, { name: e.target.value })} style={{ flex: 1 }} />
                <label className="row small">
                  {field.levelLabel}
                  <input type="number" min={1} max={20} value={f.level} onChange={(e) => setAt(i, { level: Number(e.target.value) })} style={{ width: '4.5em' }} />
                </label>
                <button type="button" className="btn-small btn-danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <textarea aria-label="Feature description" placeholder="Description" value={f.description} onChange={(e) => setAt(i, { description: e.target.value })} />
            </div>
          ))}
          <button type="button" className="btn-small" onClick={() => onChange([...list, { name: '', level: list.at(-1)?.level ?? 1, description: '' }])}>
            Add feature
          </button>
        </fieldset>
      );
    }
  }
}

/** Rows of "from class level N, always prepare these spells". */
function SpellTableInput({
  label,
  hint,
  rows,
  onChange,
}: {
  label: string;
  hint?: string;
  rows: SpellRow[];
  onChange: (rows: SpellRow[]) => void;
}) {
  const { registry } = useRules();
  const [pending, setPending] = useState<Record<number, string>>({});
  const setRow = (i: number, patch: Partial<SpellRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addSpell = (i: number) => {
    const name = (pending[i] ?? '').trim().toLowerCase();
    const spell = registry.data.spells.find((s) => s.name.toLowerCase() === name);
    if (!spell || rows[i].spells.includes(spell.id)) return;
    setRow(i, { spells: [...rows[i].spells, spell.id] });
    setPending({ ...pending, [i]: '' });
  };
  return (
    <fieldset className="field features-edit">
      <legend>{label}</legend>
      {hint && <p className="small muted">{hint}</p>}
      <datalist id="all-spells">
        {registry.data.spells.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <label className="row small">
              Class level
              <input type="number" min={1} max={20} value={r.level} onChange={(e) => setRow(i, { level: Number(e.target.value) })} style={{ width: '4.5em' }} />
            </label>
            <input
              list="all-spells"
              placeholder="Spell name"
              aria-label="Spell name"
              value={pending[i] ?? ''}
              onChange={(e) => setPending({ ...pending, [i]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSpell(i);
                }
              }}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-small" onClick={() => addSpell(i)}>Add spell</button>
            <button type="button" className="btn-small btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove row</button>
          </div>
          <div className="chips">
            {r.spells.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed="true" title="Remove" onClick={() => setRow(i, { spells: r.spells.filter((x) => x !== id) })}>
                {registry.spells.get(id)?.name ?? id} ✕
              </button>
            ))}
            {r.spells.length === 0 && <span className="small muted">No spells yet.</span>}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-small"
        onClick={() => onChange([...rows, { level: rows.length ? Math.min(20, rows[rows.length - 1].level + 2) : 3, spells: [] }])}
      >
        Add level row
      </button>
    </fieldset>
  );
}

type Json = Record<string, unknown>;
interface TextSlot {
  path: (string | number)[];
  label: string;
  value: string;
}

/** Every user-facing text field of a pack entry, with its path for writing back. */
function textSlots(e: Json): TextSlot[] {
  const out: TextSlot[] = [];
  const add = (path: (string | number)[], label: string, value: unknown) => {
    if (typeof value === 'string') out.push({ path, label, value });
  };
  if ('summary' in e) add(['summary'], 'Summary', e.summary);
  add(['description'], 'Description', e.description ?? '');
  if ('higherLevel' in e) add(['higherLevel'], 'Using a higher-level spell slot', e.higherLevel);
  const features = (e.features ?? e.traits) as Json[] | undefined;
  const fkey = e.features ? 'features' : 'traits';
  features?.forEach((f, i) => {
    if (!f.hidden) add([fkey, i, 'description'], `${f.name}${f.level ? ` (level ${f.level})` : ''}`, f.description);
  });
  ((e.lineages ?? []) as Json[]).forEach((l, li) =>
    ((l.traits ?? []) as Json[]).forEach((t, ti) => add(['lineages', li, 'traits', ti, 'description'], `${l.name}: ${t.name}`, t.description)),
  );
  return out;
}

function setPath(obj: Json, path: (string | number)[], value: string) {
  let cur: Record<string | number, unknown> = obj;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string | number, unknown>;
  cur[path[path.length - 1]] = value;
}

/** Edits only the wording of a pack entry, so its mechanics stay intact. */
function TextEditor({ entity, onSave, onCancel }: { entity: Entity; onSave: (e: Entity) => void; onCancel: () => void }) {
  const slots = textSlots(entity as Json);
  const [values, setValues] = useState(slots.map((s) => s.value));
  const [checked, setChecked] = useState(entity.unverified === false);
  const changed = values.some((v, i) => v !== slots[i].value);
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const copy = structuredClone(entity) as Json;
        slots.forEach((s, i) => setPath(copy, s.path, values[i]));
        onSave({ ...(copy as Entity), unverified: !checked, edited: entity.edited || changed });
      }}
    >
      <h2 style={{ marginBottom: '0.4rem' }}>{entity.name ?? entity.term}</h2>
      <p className="muted small">
        Paste or type the wording from your own book. Only the text changes — choices, spells and other rules the app calculates stay
        as they are. Rules terms you type are highlighted automatically.
      </p>
      {slots.map((s, i) => (
        <div key={s.path.join('.')} className="field">
          <label htmlFor={`t-${i}`}>{s.label}</label>
          <textarea id={`t-${i}`} value={values[i]} onChange={(ev) => setValues(values.map((v, j) => (j === i ? ev.target.value : v)))} />
        </div>
      ))}
      <label className="row field">
        <input type="checkbox" checked={checked} onChange={(ev) => setChecked(ev.target.checked)} /> I've checked this against my book
      </label>
      <div className="step-nav">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Save</button>
      </div>
    </form>
  );
}

/** List of { name, description } rows (creature traits). */
function NamedTextInput({ label, itemLabel, rows, onChange }: { label: string; itemLabel: string; rows: NamedText[]; onChange: (rows: NamedText[]) => void }) {
  const setAt = (i: number, patch: Partial<NamedText>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="field features-edit">
      <legend>{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <input aria-label={`${itemLabel} name`} placeholder="Name" value={r.name} onChange={(e) => setAt(i, { name: e.target.value })} style={{ flex: 1 }} />
            <button type="button" className="btn-small btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <textarea aria-label={`${itemLabel} description`} placeholder="Description" value={r.description} onChange={(e) => setAt(i, { description: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn-small" onClick={() => onChange([...rows, { name: '', description: '' }])}>
        Add {itemLabel}
      </button>
    </fieldset>
  );
}

/** The effects the item form offers, with a starting value for each. */
const EFFECT_KINDS: { type: Effect['type']; name: string; make: () => Effect }[] = [
  { type: 'resistance', name: 'Damage resistance', make: () => ({ type: 'resistance', damage: 'fire' }) },
  { type: 'speedBonus', name: 'Speed increase', make: () => ({ type: 'speedBonus', value: 10 }) },
  { type: 'speedMode', name: 'Fly / swim / climb speed', make: () => ({ type: 'speedMode', mode: 'fly', value: 'walk' }) },
  { type: 'darkvision', name: 'Darkvision', make: () => ({ type: 'darkvision', range: 60 }) },
  { type: 'skill', name: 'Skill proficiency', make: () => ({ type: 'skill', skill: 'perception' }) },
  { type: 'save', name: 'Saving throw proficiency', make: () => ({ type: 'save', ability: 'dex' }) },
  { type: 'language', name: 'Language', make: () => ({ type: 'language', language: '' }) },
  { type: 'abilityBonus', name: 'Ability score increase', make: () => ({ type: 'abilityBonus', ability: 'str', value: 2 }) },
  { type: 'hpBonus', name: 'Hit Point maximum increase', make: () => ({ type: 'hpBonus', value: 5 }) },
  { type: 'initiativeBonus', name: 'Initiative bonus', make: () => ({ type: 'initiativeBonus', value: 1 }) },
  { type: 'spell', name: 'Spell', make: () => ({ type: 'spell', spell: '', note: '' }) },
];

/** Effects granted by a magic item: pick a kind, then fill in its value. */
function EffectRowsInput({ label, hint, rows, onChange }: { label: string; hint?: string; rows: Effect[]; onChange: (rows: Effect[]) => void }) {
  const { registry } = useRules();
  const damageTypes = registry.data.keywords.filter((k) => k.kind === 'damage').map((k) => k.id.replace('damage-', ''));
  const spells = [...registry.data.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const setAt = (i: number, e: Effect) => onChange(rows.map((r, j) => (j === i ? e : r)));
  const num = (v: string) => Number(v) || 0;

  const valueInputs = (e: Effect, i: number) => {
    switch (e.type) {
      case 'resistance':
        return (
          <select aria-label="Damage type" value={e.damage} onChange={(ev) => setAt(i, { ...e, damage: ev.target.value })}>
            {damageTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        );
      case 'speedBonus':
        return (
          <label className="row small">
            + <input aria-label="Feet" type="number" min={5} step={5} value={e.value} onChange={(ev) => setAt(i, { ...e, value: num(ev.target.value) })} style={{ width: '5em' }} /> ft.
          </label>
        );
      case 'speedMode':
        return (
          <>
            <select aria-label="Movement" value={e.mode} onChange={(ev) => setAt(i, { ...e, mode: ev.target.value as typeof e.mode })}>
              {(['fly', 'swim', 'climb', 'burrow'] as const).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              aria-label="Speed"
              value={e.value === 'walk' ? 'walk' : 'feet'}
              onChange={(ev) => setAt(i, { ...e, value: ev.target.value === 'walk' ? 'walk' : 30 })}
            >
              <option value="walk">equal to walking speed</option>
              <option value="feet">a set speed</option>
            </select>
            {e.value !== 'walk' && (
              <label className="row small">
                <input aria-label="Feet" type="number" min={5} step={5} value={e.value} onChange={(ev) => setAt(i, { ...e, value: num(ev.target.value) })} style={{ width: '5em' }} /> ft.
              </label>
            )}
          </>
        );
      case 'darkvision':
        return (
          <label className="row small">
            <input aria-label="Range" type="number" min={5} step={5} value={e.range} onChange={(ev) => setAt(i, { ...e, range: num(ev.target.value) })} style={{ width: '5em' }} /> ft.
          </label>
        );
      case 'skill':
        return (
          <select aria-label="Skill" value={e.skill} onChange={(ev) => setAt(i, { ...e, skill: ev.target.value as typeof e.skill })}>
            {SKILL_IDS.map((id) => (
              <option key={id} value={id}>{SKILLS[id].name}</option>
            ))}
          </select>
        );
      case 'save':
      case 'abilityBonus':
        return (
          <>
            <select aria-label="Ability" value={e.ability} onChange={(ev) => setAt(i, { ...e, ability: ev.target.value as typeof e.ability })}>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>{ABILITY_NAMES[a]}</option>
              ))}
            </select>
            {e.type === 'abilityBonus' && (
              <label className="row small">
                +<input aria-label="Increase" type="number" min={1} max={10} value={e.value} onChange={(ev) => setAt(i, { ...e, value: num(ev.target.value) })} style={{ width: '4em' }} />
              </label>
            )}
          </>
        );
      case 'language':
        return <input aria-label="Language" placeholder="e.g. Sylvan" value={e.language} onChange={(ev) => setAt(i, { ...e, language: ev.target.value })} />;
      case 'hpBonus':
      case 'initiativeBonus':
        return (
          <label className="row small">
            +<input aria-label="Amount" type="number" min={1} value={e.value ?? 0} onChange={(ev) => setAt(i, { ...e, value: num(ev.target.value) })} style={{ width: '4em' }} />
          </label>
        );
      case 'spell':
        return (
          <>
            <select aria-label="Spell" value={e.spell} onChange={(ev) => setAt(i, { ...e, spell: ev.target.value })}>
              <option value="">Choose a spell</option>
              {spells.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.level ? `${sp.level} · ${sp.name}` : `Cantrip · ${sp.name}`}</option>
              ))}
            </select>
            <input aria-label="Spell note" placeholder="Note, e.g. 1 charge, DC 15" value={e.note ?? ''} onChange={(ev) => setAt(i, { ...e, note: ev.target.value })} style={{ width: '12em' }} />
          </>
        );
      default:
        return <span className="small muted">Set in the imported file ({e.type})</span>;
    }
  };

  return (
    <fieldset className="field features-edit">
      <legend>{label}</legend>
      {hint && <span className="small muted">{hint}</span>}
      {rows.map((e, i) => (
        <div key={i} className="row effect-edit">
          <select
            aria-label="Effect"
            value={EFFECT_KINDS.some((k) => k.type === e.type) ? e.type : ''}
            onChange={(ev) => setAt(i, EFFECT_KINDS.find((k) => k.type === ev.target.value)!.make())}
          >
            {!EFFECT_KINDS.some((k) => k.type === e.type) && <option value="">Other</option>}
            {EFFECT_KINDS.map((k) => (
              <option key={k.type} value={k.type}>{k.name}</option>
            ))}
          </select>
          {valueInputs(e, i)}
          <button type="button" className="btn-small btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn-small" onClick={() => onChange([...rows, EFFECT_KINDS[0].make()])}>
        Add effect
      </button>
    </fieldset>
  );
}

/** Creature actions: optional attack bonus and damage dice make them rollable on the sheet. */
function ActionsInput({ label, rows, onChange }: { label: string; rows: ActionDraft[]; onChange: (rows: ActionDraft[]) => void }) {
  const { registry } = useRules();
  const damageTypes = registry.data.keywords.filter((k) => k.kind === 'damage').map((k) => k.id.replace('damage-', ''));
  const setAt = (i: number, patch: Partial<ActionDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="field features-edit">
      <legend>{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <input aria-label="Action name" placeholder="Name (e.g. Bite)" value={r.name} onChange={(e) => setAt(i, { name: e.target.value })} style={{ flex: 1 }} />
            <label className="row small">
              Attack bonus
              <input aria-label="Attack bonus" placeholder="+5" value={r.attack} onChange={(e) => setAt(i, { attack: e.target.value.replace(/^\+/, '') })} style={{ width: '4.5em' }} />
            </label>
            <label className="row small">
              Damage
              <input aria-label="Damage dice" placeholder="1d8+2" value={r.damage} onChange={(e) => setAt(i, { damage: e.target.value })} style={{ width: '6em' }} />
            </label>
            <select aria-label="Damage type" value={r.damageType} onChange={(e) => setAt(i, { damageType: e.target.value })}>
              <option value="">type</option>
              {damageTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button type="button" className="btn-small btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <textarea aria-label="Action description" placeholder="What it does (reach, targets, extra effects)" value={r.description} onChange={(e) => setAt(i, { description: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn-small" onClick={() => onChange([...rows, { name: '', description: '', attack: '', damage: '', damageType: '' }])}>
        Add action
      </button>
    </fieldset>
  );
}

/** Live feedback under the paste box. */
function JsonStatus({ check }: { check: ReturnType<typeof checkJson> }) {
  if (check.state === 'empty')
    return (
      <p id="json-check" className="json-check small muted">
        Paste or type JSON here; it is checked as you type.
      </p>
    );
  if (check.state === 'syntax')
    return (
      <div id="json-check" className="json-check json-check--error small" aria-live="polite">
        <strong>Not valid JSON yet</strong>, line {check.line}, column {check.column}: {check.message}.
        <pre>
          {check.lineText}
          {'\n'}
          {' '.repeat(Math.max(0, check.column - 1))}^
        </pre>
        Look for a missing comma or quote, or an extra comma before {'}'} or ].
      </div>
    );
  if (check.state === 'invalid')
    return (
      <p id="json-check" className="json-check json-check--warn small" aria-live="polite">
        <strong>Valid JSON, but it can't be imported yet:</strong> {check.message}
      </p>
    );
  return (
    <p id="json-check" className="json-check json-check--ok small" aria-live="polite">
      <strong>Looks good.</strong> Ready to import: {check.summary}.
    </p>
  );
}

/** A pack the user made: export, rename, delete. */
function UserPackCard({
  pack,
  count,
  onExport,
  onRename,
  onDelete,
}: {
  pack: UserPack;
  count: number;
  onExport: () => void;
  onRename: (name: string, description?: string) => void;
  onDelete: (keepEntries: boolean) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? '');
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="pack pack--user">
      {renaming ? (
        <form
          className="pack-rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onRename(name, description);
            setRenaming(false);
          }}
        >
          <input aria-label="Pack name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input aria-label="Pack description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="row">
            <button type="submit" className="btn-small btn-primary">Save</button>
            <button type="button" className="btn-small btn-quiet" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div>
          <strong>{pack.name}</strong> <span className="tag">your pack</span>
          {pack.description && <p className="small muted">{pack.description}</p>}
          <p className="small">{count} entr{count === 1 ? 'y' : 'ies'}.</p>
        </div>
      )}
      {!renaming &&
        (confirming ? (
          <div className="row">
            <span className="small">Delete “{pack.name}”?</span>
            <button type="button" className="btn-small" onClick={() => onDelete(true)}>Keep entries (ungroup)</button>
            <button type="button" className="btn-small btn-danger" onClick={() => onDelete(false)}>
              Delete pack and its {count} entr{count === 1 ? 'y' : 'ies'}
            </button>
            <button type="button" className="btn-small btn-quiet" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <div className="row">
            <button type="button" onClick={onExport} disabled={!count}>Export</button>
            <button type="button" onClick={() => setRenaming(true)}>Rename</button>
            <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>Delete</button>
          </div>
        ))}
    </div>
  );
}
