import { useEffect, useRef, useState } from 'react';
import type { Registry } from '../data/registry';
import type { Sheet } from '../engine/derive';
import { downloadJson } from '../storage/storage';
import type { Character } from '../types/character';

/** One Export button with a choice of format: a printable PDF sheet or the JSON save file. */
export function ExportMenu({ character, sheet, registry }: { character: Character; sheet: Sheet; registry: Registry }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exportPdf = async () => {
    setBusy(true);
    setError('');
    try {
      // The PDF code (and pdf-lib) only loads when someone exports.
      const [{ buildPdfModel }, { downloadCharacterPdf }] = await Promise.all([import('../export/sheetModel'), import('../export/pdfSheet')]);
      await downloadCharacterPdf(buildPdfModel(character, sheet, registry));
      setOpen(false);
    } catch (e) {
      console.error(e);
      setError("Couldn't create the PDF. Try again, or export JSON instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-menu" ref={root}>
      <button ref={button} type="button" className="btn-quiet" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Export ▾
      </button>
      {open && (
        <div className="export-menu__list" role="menu">
          <button type="button" role="menuitem" onClick={exportPdf} disabled={busy}>
            <strong>{busy ? 'Creating PDF…' : 'PDF character sheet'}</strong>
            <span className="small muted">To print or share. Paper-style layout.</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              downloadJson(`${character.name || 'character'}.json`, character);
              setOpen(false);
            }}
          >
            <strong>JSON file</strong>
            <span className="small muted">Backup, or import on another device.</span>
          </button>
          {error && (
            <p className="small export-menu__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
