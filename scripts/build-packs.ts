/**
 * Validates and merges content packs.
 *
 * Each pack lives in data/packs/<id>/: a pack.json ({ id, name, description }) plus any number of
 * part files in the custom-content format ({ subclasses?, feats?, backgrounds?, species?, spells?, items? }).
 * Output: data/packs/<id>.json, loaded by the Rules packs page.
 *
 * Run: npm run build:packs            (all packs)
 *      npm run build:packs -- <file>  (validate one part file only, no output)
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { customContentSchema } from '../src/data/schema';
import type { CustomContent } from '../src/data/registry';
import type { Choice, Effect, Feature, RulesData } from '../src/types/rules';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'data/packs');
type Edition = '2014' | '2024';
const srdDir = (e: Edition) => join(ROOT, e === '2024' ? 'data/srd' : `data/srd-${e}`);
let edition: Edition = '2024';
const srd = <K extends keyof RulesData>(k: K): RulesData[K] => JSON.parse(readFileSync(join(srdDir(edition), `${k}.json`), 'utf8'));
const packMeta = (dir: string) =>
  JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')) as { id: string; name: string; description: string; edition?: Edition };
const LISTS = ['subclasses', 'feats', 'backgrounds', 'species', 'spells', 'items', 'keywords', 'creatures'] as const;
type ListKey = (typeof LISTS)[number];

interface Problem {
  where: string;
  message: string;
}

function walkEffects(features: Feature[] | undefined, extra: Effect[] = [], choices: Choice[] = []) {
  const effects: Effect[] = [...extra];
  const allChoices: Choice[] = [...choices];
  for (const f of features ?? []) {
    effects.push(...(f.effects ?? []));
    allChoices.push(...(f.choices ?? []));
  }
  const stack = [...allChoices];
  while (stack.length) {
    const c = stack.pop()!;
    if (c.kind === 'option')
      for (const o of c.options) {
        effects.push(...(o.effects ?? []));
        stack.push(...(o.choices ?? []));
      }
  }
  return { effects, choices: allChoices };
}

/** Validates a merged pack against the schema and against SRD + its own content. */
export function validatePack(content: CustomContent, label: string): Problem[] {
  const problems: Problem[] = [];
  const parsed = customContentSchema.safeParse(content);
  if (!parsed.success)
    for (const i of parsed.error.issues.slice(0, 30)) problems.push({ where: `${label}:${i.path.join('.')}`, message: i.message });

  const spellIds = new Set([...srd('spells').map((s) => s.id), ...(content.spells ?? []).map((s) => s.id)]);
  const featIds = new Set([...srd('feats').map((s) => s.id), ...(content.feats ?? []).map((s) => s.id)]);
  const classIds = new Set(srd('classes').map((c) => c.id));
  const toolIds = new Set(srd('tools').map((t) => t.id));
  const itemIds = new Set(srd('items').map((t) => t.id));
  const srdIds: Record<string, Set<string>> = {
    subclasses: new Set(srd('subclasses').map((x) => x.id)),
    feats: new Set(srd('feats').map((x) => x.id)),
    backgrounds: new Set(srd('backgrounds').map((x) => x.id)),
    species: new Set(srd('species').map((x) => x.id)),
    spells: new Set(srd('spells').map((x) => x.id)),
  };

  for (const k of LISTS) {
    const seen = new Set<string>();
    for (const e of (content[k] ?? []) as { id: string }[]) {
      if (seen.has(e.id)) problems.push({ where: `${k}/${e.id}`, message: 'duplicate id' });
      seen.add(e.id);
      if (srdIds[k]?.has(e.id)) problems.push({ where: `${k}/${e.id}`, message: 'collides with an SRD id (would replace SRD content)' });
    }
  }

  const checkRefs = (where: string, effects: Effect[], choices: Choice[]) => {
    for (const e of effects) {
      if (e.type === 'spell' && !spellIds.has(e.spell)) problems.push({ where, message: `unknown spell "${e.spell}" (add it to the pack's spells)` });
      if (e.type === 'tool' && !toolIds.has(e.tool)) problems.push({ where, message: `unknown tool "${e.tool}"` });
      if (e.type === 'weapon' && e.weapon !== 'simple' && e.weapon !== 'martial' && !itemIds.has(e.weapon))
        problems.push({ where, message: `unknown weapon "${e.weapon}"` });
    }
    for (const c of choices) {
      if (c.kind === 'spell' && Array.isArray(c.lists))
        for (const l of c.lists) if (!classIds.has(l)) problems.push({ where, message: `unknown spell list "${l}"` });
      if (c.kind === 'tool' && Array.isArray(c.from))
        for (const t of c.from) if (!toolIds.has(t)) problems.push({ where, message: `unknown tool "${t}" in choice ${c.id}` });
    }
  };

  for (const s of content.subclasses ?? []) {
    if (!classIds.has(s.classId)) problems.push({ where: `subclasses/${s.id}`, message: `unknown class "${s.classId}"` });
    if (s.spellcasting && !classIds.has(s.spellcasting.list))
      problems.push({ where: `subclasses/${s.id}`, message: `unknown spell list "${s.spellcasting.list}"` });
    const { effects, choices } = walkEffects(s.features);
    checkRefs(`subclasses/${s.id}`, effects, choices);
    const fids = new Set<string>();
    for (const f of s.features) {
      if (fids.has(f.id)) problems.push({ where: `subclasses/${s.id}/${f.id}`, message: 'duplicate feature id' });
      fids.add(f.id);
    }
  }
  for (const f of content.feats ?? []) {
    const { effects, choices } = walkEffects([], f.effects ?? [], f.choices ?? []);
    checkRefs(`feats/${f.id}`, effects, choices);
  }
  for (const b of content.backgrounds ?? []) {
    if (b.feat && !featIds.has(b.feat)) problems.push({ where: `backgrounds/${b.id}`, message: `unknown feat "${b.feat}"` });
    const { effects, choices } = walkEffects([], b.effects, b.choices ?? []);
    checkRefs(`backgrounds/${b.id}`, effects, choices);
  }
  for (const sp of content.species ?? []) {
    const { effects, choices } = walkEffects([...sp.traits, ...(sp.lineages ?? []).flatMap((l) => l.traits)], [], sp.choices ?? []);
    checkRefs(`species/${sp.id}`, effects, choices);
  }
  for (const s of content.spells ?? [])
    for (const c of s.classes) if (!classIds.has(c)) problems.push({ where: `spells/${s.id}`, message: `unknown class "${c}"` });
  return problems;
}

function readPart(file: string): CustomContent {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function buildPack(dir: string) {
  const meta = packMeta(dir);
  edition = meta.edition ?? '2024';
  const merged: Record<ListKey, unknown[]> = { subclasses: [], feats: [], backgrounds: [], species: [], spells: [], items: [], keywords: [], creatures: [] };
  const parts = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'pack.json').sort();
  const problems: Problem[] = [];
  for (const f of parts) {
    let part: CustomContent;
    try {
      part = readPart(join(dir, f));
    } catch (e) {
      problems.push({ where: f, message: `invalid JSON: ${(e as Error).message}` });
      continue;
    }
    for (const k of LISTS)
      for (const e of (part[k] ?? []) as { id: string }[]) {
        // Shared spells may appear in several parts; keep the first.
        if (k === 'spells' && merged.spells.some((x) => (x as { id: string }).id === e.id)) continue;
        merged[k].push({
          ...e,
          source: 'custom',
          pack: meta.id,
          unverified: (e as { unverified?: boolean }).unverified ?? true,
          ...(edition !== '2024' ? { edition } : {}),
        });
      }
  }
  const content = Object.fromEntries(Object.entries(merged).filter(([, v]) => v.length)) as CustomContent;
  problems.push(...validatePack(content, meta.id));
  const counts = Object.entries(content).map(([k, v]) => `${k}: ${(v as unknown[]).length}`).join(', ');
  console.log(`${meta.id} [${edition}] (${parts.length} parts) — ${counts}`);
  if (problems.length) {
    console.log(`  ${problems.length} problem(s):\n` + problems.map((p) => `  - ${p.where}: ${p.message}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  writeFileSync(join(PACKS, `${meta.id}.json`), JSON.stringify({ ...meta, content }, null, 1) + '\n');
}

const single = process.argv[2];
if (single) {
  // Same tagging as a full build, so parts needn't set source/pack themselves.
  if (existsSync(join(dirname(single), 'pack.json'))) edition = packMeta(dirname(single)).edition ?? '2024';
  const raw = readPart(single);
  const part = Object.fromEntries(
    Object.entries(raw).map(([k, list]) => [k, (list as object[]).map((e) => ({ ...e, source: 'custom' }))]),
  ) as CustomContent;
  const problems = validatePack(part, basename(single));
  console.log(problems.length ? problems.map((p) => `- ${p.where}: ${p.message}`).join('\n') : `${basename(single)}: OK`);
  if (problems.length) process.exitCode = 1;
} else if (existsSync(PACKS)) {
  for (const d of readdirSync(PACKS)) {
    const dir = join(PACKS, d);
    if (statSync(dir).isDirectory() && existsSync(join(dir, 'pack.json'))) buildPack(dir);
  }
}
