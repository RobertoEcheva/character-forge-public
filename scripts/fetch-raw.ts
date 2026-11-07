/**
 * Downloads the 5e-bits SRD dataset into data/raw (2024) or data/raw-2014.
 * Run: npm run fetch:data            (both editions)
 *      npm run fetch:data -- 2014    (one edition)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES: Record<string, string[]> = {
  '2024': [
    'Ability-Scores', 'Alignments', 'Backgrounds', 'Classes', 'Conditions', 'Damage-Types', 'Equipment',
    'Equipment-Categories', 'Feats', 'Features', 'Languages', 'Levels', 'Magic-Schools', 'Proficiencies', 'Skills',
    'Species', 'Spells', 'Subclasses', 'Subspecies', 'Traits', 'Weapon-Mastery-Properties', 'Weapon-Properties',
    'Magic-Items', 'Monsters',
  ],
  '2014': [
    'Ability-Scores', 'Alignments', 'Backgrounds', 'Classes', 'Conditions', 'Damage-Types', 'Equipment',
    'Equipment-Categories', 'Feats', 'Features', 'Languages', 'Levels', 'Magic-Schools', 'Proficiencies', 'Races',
    'Rule-Sections', 'Rules', 'Skills', 'Spells', 'Subclasses', 'Subraces', 'Traits', 'Weapon-Properties',
    'Magic-Items', 'Monsters',
  ],
};

const editions = process.argv[2] ? [process.argv[2]] : Object.keys(FILES);
for (const edition of editions) {
  const out = join(ROOT, edition === '2024' ? 'data/raw' : `data/raw-${edition}`);
  mkdirSync(out, { recursive: true });
  for (const f of FILES[edition]) {
    const res = await fetch(`https://raw.githubusercontent.com/5e-bits/5e-database/main/src/${edition}/en/5e-SRD-${f}.json`);
    if (!res.ok) throw new Error(`${edition}/${f}: HTTP ${res.status}`);
    const json = await res.json(); // parse to make sure it is JSON before saving
    writeFileSync(join(out, `${f}.json`), JSON.stringify(json, null, 2));
  }
  console.log(`fetched ${FILES[edition].length} files for ${edition}`);
}
