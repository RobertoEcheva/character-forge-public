# Writing a content pack part

A part file is JSON in the custom-content format: an object with any of
`subclasses`, `feats`, `backgrounds`, `species`, `spells` arrays. Types are in
`src/types/rules.ts` (SubclassDef, FeatDef, BackgroundDef, SpeciesDef, SpellDef,
Feature, Choice, Effect). Validate a part with:

    npm run build:packs -- data/packs/<id>/<file>.json

## Text rules (important)

- Descriptions are **short summaries in your own words** (1–3 sentences, rarely more).
  Never reproduce book text. State the mechanic plainly: action type, range, dice,
  uses and recharge, scaling levels.
- Use the game's capitalised rules terms (Bonus Action, Reaction, Advantage,
  Temporary Hit Points, Frightened condition, Short Rest…) — the app turns them
  into hover definitions.
- Use spell names as written (e.g. "Hunter's Mark") so they link too.

## Mechanics to encode (the app calculates these)

- Always-prepared spells: `{ "type": "spell", "spell": "<id>", "minLevel": <class level> }`
  on the feature. Spell ids are kebab-case of the name without apostrophes
  (`hunters-mark`, `hideous-laughter`). If a spell is not in
  `data/srd/spells.json`, add it to the part's `spells` array (mechanics + short
  own-words description).
- Proficiencies: `skill`, `save`, `armor` (light/medium/heavy/shield), `weapon`
  (simple/martial/item id), `tool` (ids from `data/srd/tools.json`), `language`.
- Player choices: `Choice` objects on the feature (skill, tool, option, spell, feat, asi…).
  Option choices hold named options (maneuvers, land types…) with short descriptions.
  Use several choices with `minLevel` for picks that grow with level.
- AC formulas (`acFormula`), speed (`speedBonus`), darkvision (`darkvision`, use
  `extend` for "or increase by"), resistances, `hpPerLevel` (with classId for
  per-class), `hpBonus`, `initiativeProf`, `abilityBonus`.
- Uses to track: `{ "type": "resource", "id": "superiority-dice", "label": "Superiority Dice (d8)",
  "max": 4, "reset": "short" }`; repeat with the same id and a higher `minLevel` when the
  number grows; `max` may be `"pb"` or `{ "ability": "wis" }`.
- Subclass spellcasting (third casters): `spellcasting: { ability, list, levels }`
  with exactly 20 rows of `{ cantrips, prepared, slots: [9 numbers] }` (zeros before level 3).
- Feature `level` is the class level (subclass) or character level (species traits).
- Feature ids: `<subclass-id>-<feature-slug>`, unique within the subclass.
- Don't set `source`, `pack` or `unverified`; the build adds them.

## 2014 packs

A pack whose `pack.json` has `"edition": "2014"` is validated against `data/srd-2014`
(the SRD 5.1 data) instead of `data/srd`. Use 2014 rules throughout:
- Subclass features at the 2014 levels (e.g. Cleric domains from level 1, Wizard traditions from 2).
- Races are `species` with ability bonuses as `abilityBonus` effects (max 20) on a trait, subraces as `lineages`.
- 2014 backgrounds have no ability scores or feat: use `effects` (skills/tools), `choices` (languages/tools),
  a `feature` ({ id, name, level: 0, description }) and `equipment: []` plus `equipmentGroups`.
- 2014 feats have no `type` distinction: use `"type": "general"`, prerequisites in `prerequisite.text`.
- Spell ids must exist in `data/srd-2014/spells.json` or be added to the part's `spells`.

## Creatures

Parts may include `creatures` (companions, familiars, summons, Wild Shape forms). Each one needs:
`id`, `name`, `size` (Tiny…Gargantuan), `type` (e.g. "beast"), `cr` (0, 0.125, 0.25, 0.5, 1…), `ac`, `hp`,
`hitDice`, `speed` (e.g. `{ "walk": "40 ft.", "climb": "40 ft." }`), `abilities` (six scores), `senses`,
`traits` [{ name, description }] and `actions` [{ name, description, attack?, damage?, damageType? }].
`attack` (to-hit bonus) and `damage` (dice like "1d8+2") make the action rollable on the sheet.
Beasts are offered for Wild Shape within the Druid's CR limits.
