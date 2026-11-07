# Import templates

Ready-made example files you can copy, edit and import on the **Custom content** page
(**Import file**, or paste the text into the box and press **Import pasted JSON**).

| File | Shows |
|---|---|
| `feats.json` | a plain feat; a feat that gives spells (always prepared + pick a cantrip) and +1 to an ability; skill and Expertise picks; an on/off feat with extra damage and limited uses |
| `background-2024.json` | a 2024 background (abilities, Origin feat, skills, tool, equipment A/B) |
| `background-2014.json` | a 2014 background (skills, language pick, background feature, equipment) |
| `species.json` | a species with size choice, swim speed, darkvision, a resistance, a spell trait, a skill pick and two lineages |
| `subclass.json` | a subclass with an always-prepared spell list, a pick-one option and a limited-use feature |
| `class.json` | a whole homebrew class (20 levels) with its own subclass |
| `spells.json` | a damage spell that upcasts, a cantrip that grows with level, a healing spell, a concentration spell |
| `items.json` | a weapon, an armor, a +1 magic weapon, a magic weapon with its own stats, worn magic items with attunement, charges and granted effects (resistance, a spell) |
| `rules-terms.json` | words that get a hover definition |
| `creatures.json` | a beast companion and a flying summon with rollable attacks |
| `all-in-one.json` | several kinds in one file: a new cantrip and a feat that grants it |

## Writing JSON

JSON is plain text with a few strict rules:

```json
{
  "feats": [
    {
      "id": "my-feat",
      "name": "My Feat",
      "type": "general",
      "repeatable": false,
      "description": "What it does."
    }
  ]
}
```

- Text goes in **double quotes**: `"name": "My Feat"`. Numbers and `true` / `false` have no quotes.
- Every entry is a `"key": value` pair. Separate pairs and list items with **commas**, but put **no comma after the last one**.
- `{ }` holds one thing with named parts; `[ ]` holds a list of things.
- JSON has no comments. In these templates, any key starting with `_help` is a note for you; the app ignores it, so you can keep or delete it.
- A new paragraph inside text is written `\n`. `**Bold.**` makes a bold run-in heading.
- If an import fails, the message names the section and entry, e.g. `feats → My Feat: description: Required`.
  If it says the file isn't valid JSON, look for a missing comma or quote, or an extra comma at the end of a list.
  An editor such as VS Code highlights these mistakes.

## The basics

- **Sections:** a file can have any of `feats`, `backgrounds`, `species`, `subclasses`, `classes`,
  `spells`, `items`, `keywords` (rules terms) and `creatures`, each holding a list.
- **id:** a short unique name in lowercase letters, digits and dashes (`"wayfinder-adept"`). Other entries
  refer to it by this id. Importing an entry with an id you already have replaces the old one.
- **Edition:** entries are for the rule set tab you import on. To be explicit, add `"edition": "2014"` or
  `"edition": "2024"` to an entry.
- **Referring to existing things:** use ids in lowercase with dashes.
  - Spells: `"Misty Step"` → `"misty-step"`, `"Hunter's Mark"` → `"hunters-mark"`.
  - Abilities: `str`, `dex`, `con`, `int`, `wis`, `cha`.
  - Skills: `acrobatics`, `animal-handling`, `arcana`, `athletics`, `deception`, `history`, `insight`,
    `intimidation`, `investigation`, `medicine`, `nature`, `perception`, `performance`, `persuasion`,
    `religion`, `sleight-of-hand`, `stealth`, `survival`.
  - Classes: `barbarian`, `bard`, `cleric`, `druid`, `fighter`, `monk`, `paladin`, `ranger`, `rogue`,
    `sorcerer`, `warlock`, `wizard` (or your own class ids).
  - Damage types: `acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`,
    `poison`, `psychic`, `radiant`, `slashing`, `thunder`.

## Effects: what an entry gives

Put these in an `"effects": [ ... ]` list on a feat, trait, feature, background or option.

| You want | Write |
|---|---|
| a skill / Expertise | `{ "type": "skill", "skill": "stealth" }` / add `"expertise": true` |
| a saving throw | `{ "type": "save", "ability": "wis" }` |
| armor / weapons / tool / language | `{ "type": "armor", "armor": "medium" }`, `{ "type": "weapon", "weapon": "martial" }`, `{ "type": "tool", "tool": "herbalism-kit" }`, `{ "type": "language", "language": "elvish" }` |
| a spell always prepared | `{ "type": "spell", "spell": "misty-step", "ability": "wis" }` (add `"minLevel": 3` to unlock later) |
| +1 to an ability (fixed) | `{ "type": "abilityBonus", "ability": "con", "value": 1, "max": 20 }` |
| speed | `{ "type": "speedBonus", "value": 10 }`, or `{ "type": "speedMode", "mode": "fly", "value": "walk" }` |
| darkvision / blindsight | `{ "type": "darkvision", "range": 60 }`, `{ "type": "sense", "sense": "blindsight", "range": 10 }` |
| resistance | `{ "type": "resistance", "damage": "fire" }` |
| AC | `{ "type": "acBonus", "value": 1 }`, or a formula: `{ "type": "acFormula", "name": "Natural Armor", "base": 13, "abilities": ["dex"], "allowShield": true }` |
| Hit Points | `{ "type": "hpPerLevel", "value": 1 }` or `{ "type": "hpBonus", "value": 5 }` |
| initiative | `{ "type": "initiativeBonus", "value": 2 }` (or `"ability": "wis"`) |
| limited uses | `{ "type": "resource", "id": "my-uses", "label": "My Feature", "max": "pb", "reset": "long" }` (`max`: a number, `"pb"` or `{ "ability": "cha" }`) |
| extra damage on attacks | `{ "type": "damageRider", "id": "my-strike", "label": "My Strike", "dice": "1d6", "when": "any" }` |
| an on/off state | `{ "type": "toggle", "id": "my-stance", "label": "My Stance", "effects": [ ...effects while on... ] }` |

## Choices: what the player picks

Put these in a `"choices": [ ... ]` list. Every choice needs an `id` (unique within the entry) and a `label`.

| Pick | Write |
|---|---|
| skills | `{ "kind": "skill", "id": "skills", "label": "Two skills", "count": 2, "from": "any" }` (or a list of skill ids) |
| Expertise | same as skills plus `"expertise": true` |
| ability increase | `{ "kind": "asi", "id": "asi", "label": "+1 STR or DEX", "points": 1, "from": ["str", "dex"], "maxPerAbility": 1, "max": 20 }` |
| spells | `{ "kind": "spell", "id": "cantrip", "label": "One cantrip", "count": 1, "level": 0, "lists": ["wizard"], "ability": "int" }` |
| tools / languages | `{ "kind": "tool", "id": "tool", "label": "One tool", "count": 1, "from": "any" }`, `{ "kind": "language", ... }` |
| a feat | `{ "kind": "feat", "id": "feat", "label": "A feat", "featTypes": ["general"] }` |
| one of several options | `{ "kind": "option", "id": "style", "label": "Style", "count": 1, "options": [ { "id": "a", "name": "Option A", "effects": [ ... ] } ] }` |

Add `"minLevel": 6` to a choice to open it only from that level.

## Packs

When importing, **Add imported entries to** puts everything from the file into a pack: one you made,
an installed built-in pack, or a **New pack…** you name on the spot. Your packs appear under Content packs
with **Export**, **Rename** and **Delete** (you can keep the entries when deleting). Each entry in the list
also has a small pack menu to move it in or out of a pack.

**Export** saves a pack file you can share. Importing it creates the pack again, with all its entries:

```json
{
  "id": "homebrew-feats",
  "name": "Homebrew Feats",
  "description": "Feats from our table.",
  "edition": "2024",
  "content": {
    "feats": [ { "id": "lucky-break", "name": "Lucky Break", "type": "origin", "repeatable": false, "description": "…" } ]
  }
}
```

For the full format, see `src/types/rules.ts` and `data/packs/AUTHORING.md`.

