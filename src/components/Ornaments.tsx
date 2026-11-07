import type { ReactNode } from 'react';

/** Heraldic shield frame; children render centred on the field. */
export function Shield({ children }: { children: ReactNode }) {
  return (
    <span className="shield">
      <svg viewBox="0 0 88 100" aria-hidden="true" className="shield__frame">
        <path d="M6 8 Q44 0 82 8 L82 46 Q82 80 44 95 Q6 80 6 46 Z" className="shield__field" />
        <path d="M12 13 Q44 6 76 13 L76 46 Q76 75 44 88 Q12 75 12 46 Z" className="shield__inner" />
      </svg>
      <span className="shield__content">{children}</span>
    </span>
  );
}

/** Small d20 glyph for the dice tray. */
export function D20Icon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="d20-icon">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2 7.5 9.5h9zM3 7l4.5 2.5L12 17l4.5-7.5L21 7M7.5 9.5 3 17m13.5-7.5L21 17M12 17v5M3 17l9 0 9 0" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}

/** Brand mark: a gilt d20 in a lapis lozenge. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="brand-mark">
      <path d="M16 1 31 16 16 31 1 16z" className="brand-mark__lozenge" />
      <path d="M16 7 23 11v10l-7 4-7-4V11z" fill="none" className="brand-mark__die" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M16 7 12.5 13h7zM9 11l3.5 2L16 21l3.5-8L23 11M16 21v4" fill="none" className="brand-mark__die" strokeWidth="0.9" />
    </svg>
  );
}
