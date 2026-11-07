import type { Registry } from '../data/registry';
import type { GrantedFeature, Origin } from './collect';
import type { Sheet } from './derive';

/** A feature as shown on the sheet: the feature plus what was picked for it. */
export interface FeatureRow {
  key: string;
  name: string;
  level: number;
  origin: Origin;
  /** Heading the row is listed under (class, subclass, species, background, "Feats"). */
  group: string;
  /** The feature's own rules text. */
  description: string;
  /** Chosen feat or options, with their rules text. */
  picks: { id: string; name: string; description: string }[];
  /** Short label of the picks: "Defense", "+1 Str, +1 Con", "Alert". */
  pickLabel?: string;
  /** The feature owns a choice that is still empty. */
  pending?: boolean;
}

export const ORIGIN_ORDER: Origin['kind'][] = ['class', 'subclass', 'species', 'background', 'feat', 'core'];

const abbr = (a: string) => a.charAt(0).toUpperCase() + a.slice(1, 3);

/** "+2 Str" or "+1 Str, +1 Con" from ASI picks like ['str', 'str']. */
export function asiLabel(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([a, n]) => `+${n} ${abbr(a)}`).join(', ');
}

/** Feat features that were granted by a class/species/subclass feature's feat choice. */
const parentOf = (featKey: string, features: GrantedFeature[]) => {
  const inner = featKey.slice('feat@'.length);
  return features.find((f) => f.origin.kind !== 'feat' && inner.startsWith(`${f.key}:`));
};

export function featureRows(sheet: Pick<Sheet, 'features' | 'collected'>, reg: Registry): FeatureRow[] {
  const { features, collected } = sheet;
  const rows: FeatureRow[] = [];
  for (const f of features) {
    // A feat picked for a feature is shown on that feature's row, not again under Feats.
    if (f.origin.kind === 'feat' && f.key.startsWith('feat@') && parentOf(f.key, features)) continue;

    const own = collected.choices.filter((c) => c.key.startsWith(`${f.key}:`));
    const picks: FeatureRow['picks'] = [];
    const labels: string[] = [];

    for (const inst of own) {
      // Direct choices only; nested ones ("options>id:sub") belong to the picked option.
      if (inst.key.slice(f.key.length + 1).includes('>')) continue;
      const choice = inst.choice;
      if (choice.kind === 'option') {
        // Only direct option picks of this feature (not nested sub-choices of another option).
        for (const v of inst.values) {
          const o = choice.options.find((x) => x.id === v);
          if (!o) continue;
          picks.push({ id: o.id, name: o.name, description: o.description ?? '' });
          labels.push(o.name);
        }
      } else if (choice.kind === 'feat' && inst.values[0]) {
        const feat = reg.feats.get(inst.values[0]);
        if (!feat) continue;
        const asi = collected.choices.find((c) => c.key === `feat@${inst.key}:asi`);
        const label = feat.id === 'ability-score-improvement' && asi?.values.length ? asiLabel(asi.values) : feat.name;
        picks.push({ id: feat.id, name: label === feat.name ? feat.name : `${feat.name} (${label})`, description: feat.description });
        labels.push(label);
      }
    }

    const pending = own.some((c) => !c.locked && c.values.length < c.count && (c.choice.kind === 'feat' || c.choice.kind === 'option'));
    rows.push({
      key: f.key,
      name: f.name,
      level: f.level,
      origin: f.origin,
      group: f.origin.kind === 'feat' ? 'Feats' : f.origin.name,
      description: f.description,
      picks,
      ...(labels.length ? { pickLabel: labels.join(', ') } : {}),
      ...(pending && !labels.length ? { pending: true } : {}),
    });
  }
  return rows.sort((a, b) => ORIGIN_ORDER.indexOf(a.origin.kind) - ORIGIN_ORDER.indexOf(b.origin.kind) || a.level - b.level);
}

/** Rows grouped by heading, in display order. */
export function groupRows(rows: FeatureRow[]): [string, FeatureRow[]][] {
  const groups = new Map<string, FeatureRow[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return [...groups.entries()];
}
