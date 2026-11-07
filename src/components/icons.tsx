/**
 * Icon set in a heraldic "charge" style: flat, single colour (currentColor), 24px grid.
 * Icons are decorative next to a text label (aria-hidden); pass `title` when an icon stands alone.
 */
import type { ReactNode } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const DAMAGE: Record<string, ReactNode> = {
  // Three claw strokes.
  slashing: (
    <g {...S}>
      <path d="M5 19 15 5M9 20 19 7M4 13l7-9" />
    </g>
  ),
  // Arrowhead pointing up and right.
  piercing: (
    <>
      <path d="M20 4 9 8l3 1-8 8 3 3 8-8 1 3z" fill="currentColor" />
    </>
  ),
  // Maul: a heavy head on a straight haft.
  bludgeoning: (
    <>
      <path d="M3 3h18v7H3z" fill="currentColor" />
      <path d="M10.5 10h3v12h-3z" fill="currentColor" />
    </>
  ),
  fire: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="currentColor" />,
  cold: (
    <g {...S}>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" />
    </g>
  ),
  lightning: <path d="M14 2 5 13h6l-2 9 10-12h-6l2-8z" fill="currentColor" />,
  thunder: (
    <g {...S}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <path d="M10 7a7 7 0 0 1 0 10M14 4a11 11 0 0 1 0 16M18 2a14 14 0 0 1 0 20" />
    </g>
  ),
  acid: (
    <>
      <path d="M10 3c2 4 6 7 6 11a6 6 0 0 1-12 0c0-4 4-7 6-11z" fill="currentColor" />
      <circle cx="19" cy="6" r="2" fill="currentColor" />
      <circle cx="20" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  poison: (
    <>
      <path d="M9 2h6v2h-1v4.5l5 8.5a3 3 0 0 1-2.6 4.5H7.6A3 3 0 0 1 5 17l5-8.5V4H9z" fill="currentColor" />
    </>
  ),
  necrotic: <Skull />,
  radiant: (
    <g {...S}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </g>
  ),
  force: (
    <g {...S}>
      <path d="M12 2 22 12 12 22 2 12z" />
      <path d="M12 7l5 5-5 5-5-5z" fill="currentColor" />
    </g>
  ),
  psychic: (
    <g {...S}>
      <path d="M12 12a1 1 0 0 1 2 0 3 3 0 0 1-6 0 5 5 0 0 1 10 0 7 7 0 0 1-14 0 9 9 0 0 1 18 0" />
    </g>
  ),
};

function Skull() {
  return (
    <>
      <path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8z" fill="currentColor" />
      <circle cx="9" cy="11" r="2" fill="var(--surface, #fff)" />
      <circle cx="15" cy="11" r="2" fill="var(--surface, #fff)" />
      <path d="M10 17v3M14 17v3" stroke="var(--surface, #fff)" strokeWidth="1.5" />
    </>
  );
}

const SCHOOL: Record<string, ReactNode> = {
  abjuration: <path d="M4 4q8-2 16 0v7q0 7-8 11-8-4-8-11z" fill="currentColor" />,
  conjuration: (
    <g {...S}>
      <path d="M6 21V10a6 6 0 0 1 12 0v11z" />
      <path d="M12 9l1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z" fill="currentColor" strokeWidth="1" />
    </g>
  ),
  divination: (
    <g {...S}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </g>
  ),
  enchantment: <path d="M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6z" fill="currentColor" />,
  evocation: <path d="M12 2l2.5 6.5L21 6l-3.5 6 3.5 6-6.5-2.5L12 22l-2.5-6.5L3 18l3.5-6L3 6l6.5 2.5z" fill="currentColor" />,
  illusion: <path d="M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z" fill="currentColor" />,
  necromancy: <Skull />,
  transmutation: (
    <g {...S}>
      <path d="M20 9A8 8 0 0 0 5.5 6.5M4 15a8 8 0 0 0 14.5 2.5" />
      <path d="M5 2v5h5M19 22v-5h-5" />
    </g>
  ),
};

function Svg({ children, size, title, className }: { children: ReactNode; size: number; title?: string; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`icon ${className}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const DAMAGE_TYPES = Object.keys(DAMAGE);
export const SCHOOLS = Object.keys(SCHOOL);

/** Damage type icon (tinted gules by CSS). Unknown types render nothing. */
export function DamageIcon({ type, size = 16, title }: { type?: string; size?: number; title?: string }) {
  const art = type && DAMAGE[type.toLowerCase()];
  return art ? <Svg size={size} title={title} className={`icon--damage icon--${type!.toLowerCase()}`}>{art}</Svg> : null;
}

/** Spell school icon (tinted purpure by CSS). */
export function SchoolIcon({ school, size = 16, title }: { school?: string; size?: number; title?: string }) {
  const art = school && SCHOOL[school.toLowerCase()];
  return art ? <Svg size={size} title={title} className="icon--school">{art}</Svg> : null;
}

/** Coin: a disc in the coin's metal with its abbreviation struck in. */
export function CoinIcon({ coin, size = 18 }: { coin: 'cp' | 'sp' | 'ep' | 'gp' | 'pp'; size?: number }) {
  return (
    <Svg size={size} className={`icon--coin icon--${coin}`}>
      <circle cx="12" cy="12" r="10" className="coin__face" />
      <circle cx="12" cy="12" r="7.5" fill="none" className="coin__rim" strokeWidth="1" />
      <text x="12" y="15.5" textAnchor="middle" className="coin__text">
        {coin}
      </text>
    </Svg>
  );
}
