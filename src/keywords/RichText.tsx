import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { Fragment, useState, type ReactNode } from 'react';
import { useRules } from '../state/AppState';
import type { SpellDef } from '../types/rules';
import type { Segment } from './linker';

const ordinal = (n: number) => (n === 0 ? 'Cantrip' : `Level ${n}`);

export function spellMeta(s: SpellDef) {
  return [
    s.level === 0 ? `${s.school} cantrip` : `${ordinal(s.level)} ${s.school}`,
    `Casting time: ${s.castingTime}${s.ritual ? ' or Ritual' : ''}`,
    `Range: ${s.range}`,
    `Components: ${s.components.join(', ')}${s.material ? ` (${s.material})` : ''}`,
    `Duration: ${s.concentration ? 'Concentration, ' : ''}${s.duration}`,
  ];
}

/** Hoverable / focusable / tappable keyword with a definition popover. */
export function Keyword({ refId, children }: { refId: string; children: ReactNode }) {
  const { registry } = useRules();
  const known = refId.startsWith('spell:')
    ? registry.spells.has(refId.slice(6))
    : refId.startsWith('feat:')
      ? registry.feats.has(refId.slice(5))
      : registry.keywords.has(refId);
  // No definition in this edition: plain text rather than an empty popover.
  return known ? <KeywordPopover refId={refId}>{children}</KeywordPopover> : <>{children}</>;
}

function KeywordPopover({ refId, children }: { refId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(420, availableHeight)}px`;
        },
      }),
    ],
  });
  const hover = useHover(context, { delay: { open: 120, close: 80 }, handleClose: safePolygon() });
  const focus = useFocus(context);
  const click = useClick(context, { ignoreMouse: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  return (
    <>
      <span ref={refs.setReference} className="kw" tabIndex={0} {...getReferenceProps()}>
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className="kw-pop" {...getFloatingProps()}>
            <KeywordBody refId={refId} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function KeywordBody({ refId }: { refId: string }) {
  const { registry } = useRules();
  if (refId.startsWith('spell:')) {
    const s = registry.spells.get(refId.slice(6));
    if (!s) return null;
    return (
      <>
        <div className="kw-pop__title">{s.name}</div>
        <div className="kw-pop__meta">
          {spellMeta(s).map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
        <RichText text={s.description} plain />
        {s.higherLevel && <RichText text={`**Using a Higher-Level Spell Slot.** ${s.higherLevel}`} plain />}
      </>
    );
  }
  if (refId.startsWith('feat:')) {
    const f = registry.feats.get(refId.slice(5));
    if (!f) return null;
    return (
      <>
        <div className="kw-pop__title">
          {f.name} <span className="kw-pop__kind">{FEAT_LABEL[f.type]} feat</span>
        </div>
        {f.prerequisite?.minLevel && <div className="kw-pop__meta">Prerequisite: level {f.prerequisite.minLevel}+</div>}
        <RichText text={f.description} plain />
      </>
    );
  }
  const k = registry.keywords.get(refId);
  if (!k) return null;
  return (
    <>
      <div className="kw-pop__title">
        {k.term} <span className="kw-pop__kind">{KIND_LABEL[k.kind]}</span>
      </div>
      <RichText text={k.description} plain />
    </>
  );
}

const FEAT_LABEL: Record<string, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

const KIND_LABEL: Record<string, string> = {
  condition: 'Condition',
  rule: 'Rule',
  action: 'Action',
  damage: 'Damage type',
  'weapon-property': 'Weapon property',
  mastery: 'Weapon mastery',
  spell: 'Spell',
};

/** Linked inline text: keywords become <Keyword>s, **bold** becomes <strong>. */
function Inline({ text, plain, exclude }: { text: string; plain?: boolean; exclude?: string }) {
  const { linker } = useRules();
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (plain) return <Fragment key={i}>{p}</Fragment>;
        return <Fragment key={i}>{renderSegments(linker.link(p, exclude))}</Fragment>;
      })}
    </>
  );
}

function renderSegments(segs: Segment[]) {
  return segs.map((s, i) =>
    typeof s === 'string' ? (
      <Fragment key={i}>{s}</Fragment>
    ) : (
      <Keyword key={i} refId={s.ref}>
        {s.text}
      </Keyword>
    ),
  );
}

/**
 * Renders rules text: paragraphs, "- " bullets, " | " table rows, bold run-ins.
 * plain disables keyword links (used inside popovers to avoid nesting).
 */
export function RichText({ text, plain, exclude, className }: { text: string; plain?: boolean; exclude?: string; className?: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={i}>
          {items.map((t, j) => (
            <li key={j}>
              <Inline text={t} plain={plain} exclude={exclude} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.includes(' | ')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes(' | ')) rows.push(lines[i++].split(' | '));
      blocks.push(
        <table key={i} className="rt-table">
          <tbody>
            {rows.map((r, j) => (
              <tr key={j}>
                {r.map((cell, k) =>
                  j === 0 ? <th key={k}>{cell}</th> : <td key={k}><Inline text={cell} plain={plain} exclude={exclude} /></td>,
                )}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    blocks.push(
      <p key={i}>
        <Inline text={line} plain={plain} exclude={exclude} />
      </p>,
    );
    i++;
  }
  return <div className={`rt ${className ?? ''}`}>{blocks}</div>;
}

/** Single inline span of linked text (no paragraphs). */
export function LinkedText({ text }: { text: string }) {
  return <Inline text={text} />;
}
