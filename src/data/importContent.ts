import type { Edition } from '../types/rules';
import type { CustomContent, UserPack } from './registry';
import { customContentSchema } from './schema';

const SECTIONS = ['classes', 'subclasses', 'species', 'backgrounds', 'feats', 'spells', 'items', 'keywords', 'creatures'];
/** Present in "Export all custom content" files: the user's own pack list. */
const META_SECTIONS = ['packs'];

/**
 * Validates a user's JSON file for import. Entries get source "custom" and, when they don't say,
 * the edition being viewed. Errors name the section and entry so hand-written files are easy to fix.
 */
export type ImportResult = { content: CustomContent; pack?: UserPack } | { error: string };

/** A pack file (as exported or bundled): { id, name, description?, edition?, content: { feats: [...] } }. */
function isPackFile(raw: Record<string, unknown>) {
  return typeof raw.name === 'string' && raw.content !== null && typeof raw.content === 'object' && !Array.isArray(raw.content);
}

export function parseImport(data: unknown, viewedEdition: Edition): ImportResult {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { error: 'The file should be an object with sections like "feats": [ ... ].' };
  const outer = data as Record<string, unknown>;
  if (isPackFile(outer)) {
    const edition = outer.edition === '2014' || outer.edition === '2024' ? outer.edition : viewedEdition;
    const inner = parseSections(outer.content as Record<string, unknown>, edition);
    if ('error' in inner) return { error: `Pack "${outer.name}": ${inner.error}` };
    const pack: UserPack = {
      id: typeof outer.id === 'string' && outer.id ? outer.id : String(outer.name),
      name: String(outer.name),
      edition,
      ...(typeof outer.description === 'string' && outer.description ? { description: outer.description } : {}),
    };
    return { ...inner, pack };
  }
  return parseSections(outer, viewedEdition);
}

function parseSections(raw: Record<string, unknown>, viewedEdition: Edition): ImportResult {
  const known = Object.keys(raw).filter((k) => !k.startsWith('_'));
  const unknown = known.filter((k) => !SECTIONS.includes(k) && !META_SECTIONS.includes(k));
  if (unknown.length) return { error: `Unknown section "${unknown[0]}". Use: ${SECTIONS.join(', ')}.` };
  if (!known.length) return { error: `No content found. Add a section such as "feats": [ ... ].` };

  const tagged: Record<string, unknown> = {};
  for (const k of known) {
    const list = raw[k];
    if (!Array.isArray(list)) return { error: `"${k}" should be a list: "${k}": [ { ... } ].` };
    if (META_SECTIONS.includes(k)) {
      tagged[k] = list;
      continue;
    }
    tagged[k] = list.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const entry = e as { edition?: Edition };
      const ed = entry.edition ?? viewedEdition;
      return { ...entry, source: 'custom', ...(ed === '2024' ? { edition: undefined } : { edition: ed }) };
    });
  }
  const r = customContentSchema.safeParse(tagged);
  if (r.success) return { content: r.data as CustomContent };
  const issue = r.error.issues[0];
  const [section, index, ...rest] = issue.path;
  const entry = (tagged[String(section)] as { name?: string; term?: string; id?: string }[] | undefined)?.[Number(index)];
  const label = entry?.name ?? entry?.term ?? entry?.id ?? `entry ${Number(index) + 1}`;
  return { error: `${section} → ${label}: ${rest.length ? `${rest.join('.')}: ` : ''}${issue.message}` };
}

export type JsonCheck =
  | { state: 'empty' }
  | { state: 'syntax'; message: string; line: number; column: number; lineText: string }
  | { state: 'invalid'; message: string }
  | { state: 'ok'; summary: string; content: CustomContent; pack?: UserPack };

const LABELS: Record<string, [string, string]> = {
  classes: ['class', 'classes'],
  subclasses: ['subclass', 'subclasses'],
  species: ['species', 'species'],
  backgrounds: ['background', 'backgrounds'],
  feats: ['feat', 'feats'],
  spells: ['spell', 'spells'],
  items: ['item', 'items'],
  keywords: ['rules term', 'rules terms'],
  creatures: ['creature', 'creatures'],
};

/** Where a JSON.parse error happened, from either "line X column Y" or "position N" in the message. */
function errorLocation(message: string, text: string): { line: number; column: number } {
  const lc = message.match(/line (\d+) column (\d+)/i);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = message.match(/position (\d+)/i);
  const offset = pos ? Number(pos[1]) : text.length;
  const before = text.slice(0, offset).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

/** Live check for the paste box: JSON syntax first, then the same rules as importing. */
export function checkJson(text: string, viewedEdition: Edition): JsonCheck {
  if (!text.trim()) return { state: 'empty' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const message = (err instanceof Error ? err.message : 'parse error').replace(/\s*\(line \d+ column \d+\)/i, '').replace(/ in JSON at position \d+/i, '');
    const { line, column } = errorLocation(err instanceof Error ? err.message : '', text);
    return { state: 'syntax', message, line, column, lineText: text.split('\n')[line - 1] ?? '' };
  }
  const r = parseImport(data, viewedEdition);
  if ('error' in r) return { state: 'invalid', message: r.error };
  const parts = Object.entries(r.content)
    .filter(([k, v]) => k !== 'packs' && Array.isArray(v) && v.length)
    .map(([k, v]) => `${(v as unknown[]).length} ${LABELS[k]?.[(v as unknown[]).length === 1 ? 0 : 1] ?? k}`);
  const summary = parts.join(', ');
  return { state: 'ok', summary: r.pack ? `pack "${r.pack.name}" (${r.pack.edition} rules) with ${summary}` : summary, content: r.content, pack: r.pack };
}
