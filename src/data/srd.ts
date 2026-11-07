import type { Edition, RulesData } from '../types/rules';

// Glob import keeps TypeScript from inferring types for megabytes of JSON.
const files = import.meta.glob(['../../data/srd/*.json', '../../data/srd-2014/*.json'], { eager: true, import: 'default' });
const DIRS: Record<Edition, string> = { '2024': 'srd', '2014': 'srd-2014' };

function load(edition: Edition): RulesData {
  const file = <K extends keyof RulesData>(name: K): RulesData[K] => {
    const data = files[`../../data/${DIRS[edition]}/${name}.json`];
    if (!data) throw new Error(`Missing ${edition} rules data: ${name}.json (run npm run build:data)`);
    return data as RulesData[K];
  };
  return {
    edition,
    classes: file('classes'),
    subclasses: file('subclasses'),
    species: file('species'),
    backgrounds: file('backgrounds'),
    feats: file('feats'),
    spells: file('spells'),
    items: file('items'),
    keywords: file('keywords'),
    languages: file('languages'),
    tools: file('tools'),
  };
}

export const RULES: Record<Edition, RulesData> = { '2024': load('2024'), '2014': load('2014') };
/** 2024 rules (SRD 5.2). */
export const SRD = RULES['2024'];
