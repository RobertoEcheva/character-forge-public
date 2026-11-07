import { useMemo, useState } from 'react';
import type { CasterInfo, Sheet } from '../engine/derive';
import { Keyword } from '../keywords/RichText';
import { useRules } from '../state/AppState';
import type { Character } from '../types/character';

/** Cantrip + prepared spell selection for one spellcasting class. */
export function SpellPicker({
  character,
  caster,
  sheet,
  onChange,
}: {
  character: Character;
  caster: CasterInfo;
  sheet: Sheet;
  onChange: (c: Character) => void;
}) {
  const { registry } = useRules();
  const [query, setQuery] = useState('');
  const picks = character.spells[caster.classId] ?? { cantrips: [], prepared: [] };
  const always = new Set(sheet.spells.filter((s) => s.alwaysPrepared).map((s) => s.spell.id));

  const available = useMemo(
    () =>
      registry.data.spells
        .filter((s) => s.classes.includes(caster.list) && s.level <= Math.max(caster.maxSpellLevel, 0))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [registry, caster],
  );
  const q = query.trim().toLowerCase();
  const visible = q ? available.filter((s) => s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q)) : available;

  const set = (field: 'cantrips' | 'prepared', ids: string[]) =>
    onChange({ ...character, spells: { ...character.spells, [caster.classId]: { ...picks, [field]: ids } } });

  const toggle = (id: string, level: number) => {
    const field = level === 0 ? 'cantrips' : 'prepared';
    const list = picks[field];
    const max = level === 0 ? caster.cantrips : caster.prepared;
    if (list.includes(id)) set(field, list.filter((x) => x !== id));
    else if (list.length < max) set(field, [...list, id]);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <span>
          Cantrips <strong>{picks.cantrips.length}/{caster.cantrips}</strong>
        </span>
        <span>
          {caster.known ? 'Spells known' : 'Prepared spells'} <strong>{picks.prepared.length}/{caster.prepared}</strong>
        </span>
        <span className="muted small">
          Up to level {caster.maxSpellLevel} · {caster.ability.toUpperCase()} · save DC {caster.saveDc}
        </span>
        <span className="spacer" />
        <input type="search" placeholder="Filter by name or school" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter spells" />
      </div>
      <table className="spell-table">
        <thead>
          <tr>
            <th />
            <th>Spell</th>
            <th>Level</th>
            <th>School</th>
            <th>Casting time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => {
            const field = s.level === 0 ? 'cantrips' : 'prepared';
            const on = picks[field].includes(s.id);
            const full = !on && picks[field].length >= (s.level === 0 ? caster.cantrips : caster.prepared);
            const fixed = always.has(s.id);
            return (
              <tr key={s.id} aria-selected={on || fixed}>
                <td>
                  <input
                    type="checkbox"
                    checked={on || fixed}
                    disabled={fixed || full}
                    onChange={() => toggle(s.id, s.level)}
                    aria-label={`Select ${s.name}`}
                  />
                </td>
                <td>
                  <Keyword refId={`spell:${s.id}`}>{s.name}</Keyword>
                  {s.source === 'custom' && <span className="tag tag-custom"> Custom</span>}
                </td>
                <td>{s.level === 0 ? 'Cantrip' : s.level}</td>
                <td>{s.school}</td>
                <td>{s.castingTime}</td>
                <td className="small muted">
                  {[s.concentration && 'Concentration', s.ritual && 'Ritual', fixed && 'Always prepared'].filter(Boolean).join(', ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
