import { RichText } from '../keywords/RichText';
import { useRules } from '../state/AppState';
import type { Character } from '../types/character';

/** Subclass options for one class; picking one sets character.subclasses[classId]. */
export function SubclassPicker({ character, classId, onChange }: { character: Character; classId: string; onChange: (c: Character) => void }) {
  const { registry } = useRules();
  const chosen = character.subclasses[classId];
  return (
    <div className="option-list">
      {registry.data.subclasses
        .filter((s) => s.classId === classId)
        .map((s) => (
          <button
            key={s.id}
            type="button"
            className="option"
            aria-pressed={chosen === s.id}
            onClick={() => onChange({ ...character, subclasses: { ...character.subclasses, [classId]: s.id } })}
          >
            <strong>{s.name}</strong> {s.source === 'custom' && <span className="tag tag-custom">Custom</span>}{' '}
            {s.unverified && <span className="tag tag-unverified">Unverified</span>}
            {s.summary && <span className="small muted"> — {s.summary}</span>}
            {s.description && <RichText text={s.description} />}
          </button>
        ))}
    </div>
  );
}
