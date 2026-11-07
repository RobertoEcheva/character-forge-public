import type { FeatureRow } from '../engine/featureRows';
import { RichText } from '../keywords/RichText';
import type { Feature } from '../types/rules';

/**
 * A granted feature with its pick merged in: "Fighting Style: Defense".
 * The pick's text comes first; the feature's general rules sit behind "About …".
 */
export function FeatureRowView({ row, showLevel = true }: { row: FeatureRow; showLevel?: boolean }) {
  return (
    <details className="feature">
      <summary>
        <span className="feature__name">
          <span>
            {row.name}
            {row.pickLabel && <span className="feature__pick">: {row.pickLabel}</span>}
          </span>
          {showLevel && row.level > 0 && <span className="feature__lvl">Lvl {row.level}</span>}
          {row.pending && <span className="feature__lvl feature__lvl--pending">Not chosen</span>}
        </span>
      </summary>
      {row.picks.length > 0 ? (
        <>
          {row.picks.map((p) => (
            <div key={p.id} className="chosen-option">
              {row.picks.length > 1 && <strong>{p.name}. </strong>}
              <RichText text={p.description} />
            </div>
          ))}
          <details className="feature-about">
            <summary>About {row.name}</summary>
            <RichText text={row.description} />
          </details>
        </>
      ) : (
        <RichText text={row.description} />
      )}
    </details>
  );
}

/** Collapsible rules features (class features, species traits, feats). */
export function FeatureList({
  features,
  levelLabel = 'Level',
  open = false,
}: {
  features: Pick<Feature, 'id' | 'name' | 'level' | 'description'>[];
  levelLabel?: string;
  open?: boolean;
}) {
  return (
    <div>
      {features.map((f) => (
        <details key={f.id} className="feature" open={open}>
          <summary>
            <span className="feature__name">
              {f.name}
              {f.level > 0 && (
                <span className="feature__lvl">
                  {levelLabel} {f.level}
                </span>
              )}
            </span>
          </summary>
          <RichText text={f.description} />
        </details>
      ))}
    </div>
  );
}
