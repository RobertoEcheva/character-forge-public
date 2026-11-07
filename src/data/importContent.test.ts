import { describe, expect, it } from 'vitest';
import { checkJson } from './importContent';

describe('live JSON check', () => {
  it('reports empty, syntax errors with line/column, rule errors, and a summary when ready', () => {
    expect(checkJson('  ', '2024')).toEqual({ state: 'empty' });

    const bad = checkJson('{\n  "feats": [\n    { "id": "x", }\n  ]\n}', '2024');
    expect(bad.state).toBe('syntax');
    if (bad.state === 'syntax') {
      expect(bad.line).toBe(3);
      expect(bad.lineText).toContain('"id": "x"');
    }

    const invalid = checkJson('{ "feats": [ { "id": "x", "name": "X", "type": "general", "repeatable": false } ] }', '2024');
    expect(invalid).toEqual({ state: 'invalid', message: 'feats → X: description: Required' });

    const ok = checkJson(
      '{ "feats": [ { "id": "x", "name": "X", "type": "general", "repeatable": false, "description": "d" } ], "spells": [] }',
      '2024',
    );
    expect(ok.state === 'ok' && ok.summary).toBe('1 feat');
  });
});
