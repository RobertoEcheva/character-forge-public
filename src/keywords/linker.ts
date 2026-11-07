import type { Registry } from '../data/registry';
import type { KeywordDef, KeywordKind } from '../types/rules';

export interface KeywordEntry {
  id: string;
  term: string;
  kind: KeywordKind;
  /** Keyword id, or "spell:<id>" for spells. */
  ref: string;
}

export type Segment = string | { text: string; ref: string };

/** Glossary terms too generic to highlight everywhere. */
const BLOCKLIST = new Set(
  [
    'Action', 'Adventure', 'Ally', 'Attack', 'Campaign', 'Character Sheet', 'Creature', 'Damage', 'Encounter', 'Enemy',
    'Heavy', 'Light', 'Line', 'Magic', 'Monster', 'Object', 'Player Character', 'Range', 'Size', 'Skill', 'Speed',
    'Spell', 'Target', 'Weapon', 'Help', 'Hide', 'Search', 'Study', 'Utilize', 'Ready', 'Influence', 'Save', 'Possession',
    'Per Day', 'Round Down', 'Healing', 'Hazard', 'Condition', 'Proficiency', 'Damage Types', 'Friendly', 'Hostile',
    'Indifferent', 'Attitude', 'Dead', 'Stable', 'Surprise', 'Reach', 'Cube', 'Sphere', 'Cylinder', 'Cone',
    'Emanation', 'Curses', 'Illusions', 'Monk', 'Special',
  ],
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Linker {
  entries: Map<string, KeywordEntry>;
  link(text: string, excludeRef?: string): Segment[];
}

export function createLinker(reg: Registry): Linker {
  const entries = new Map<string, KeywordEntry>();
  // pattern source -> ref
  const patterns: { src: string; ref: string; len: number }[] = [];
  const add = (src: string, ref: string, len: number) => patterns.push({ src, ref, len });

  const addKeyword = (k: KeywordDef) => {
    if (BLOCKLIST.has(k.term)) return;
    entries.set(k.id, { id: k.id, term: k.term, kind: k.kind, ref: k.id });
    const terms = [k.term, ...(k.aliases ?? [])].filter((t) => t.length > 2 && !BLOCKLIST.has(t));
    for (const t of terms) {
      if (k.kind === 'condition') {
        // Conditions often appear lowercase in prose ("falls prone").
        add(`[${escape(t[0].toUpperCase())}${escape(t[0].toLowerCase())}]${escape(t.slice(1))}`, k.id, t.length);
      } else if (k.kind === 'damage') {
        // "Fire damage" also written "fire damage".
        add(`[${escape(t[0].toUpperCase())}${escape(t[0].toLowerCase())}]${escape(t.slice(1))}`, k.id, t.length);
      } else {
        add(escape(t), k.id, t.length);
      }
    }
  };
  for (const k of reg.data.keywords) addKeyword(k);

  // Feat names, so "Ability Score Improvement" isn't split into a glossary hit.
  for (const f of reg.data.feats) {
    const ref = `feat:${f.id}`;
    entries.set(ref, { id: f.id, term: f.name, kind: 'rule', ref });
    if (/\s/.test(f.name)) add(escape(f.name), ref, f.name.length);
  }

  const keywordTerms = new Set(reg.data.keywords.map((k) => k.term));
  for (const s of reg.data.spells) {
    if (keywordTerms.has(s.name)) continue;
    const ref = `spell:${s.id}`;
    entries.set(ref, { id: s.id, term: s.name, kind: 'spell', ref });
    // Single-word spell names are common words; link only when followed by "spell"/"cantrip".
    if (/\s/.test(s.name)) add(escape(s.name), ref, s.name.length);
    else add(`${escape(s.name)}(?= (?:spell|cantrip))`, ref, s.name.length);
  }

  // Longest first so "Bonus Action" wins over "Action".
  patterns.sort((a, b) => b.len - a.len);
  const refs = patterns.map((p) => p.ref);
  const re = patterns.length
    ? new RegExp(patterns.map((p) => `(?<![\\w’'-])(${p.src})(?![\\w-])`).join('|'), 'g')
    : null;

  return {
    entries,
    link(text: string, excludeRef?: string): Segment[] {
      if (!re || !text) return [text];
      const out: Segment[] = [];
      let last = 0;
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const groupIndex = m.slice(1).findIndex((g) => g !== undefined);
        const ref = refs[groupIndex];
        if (ref === excludeRef) continue;
        if (m.index > last) out.push(text.slice(last, m.index));
        out.push({ text: m[0], ref });
        last = m.index + m[0].length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    },
  };
}
