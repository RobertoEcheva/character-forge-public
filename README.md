# Character Forge

Browser-only D&D 5e character builder for the **2024 rules** and the **2014 rules** (picked per character). Create a character step by step, then play from a
one-page interactive sheet: HP, spell slots, resources and conditions tracking, click-to-roll dice, and
hoverable rules keywords (conditions, actions, spells, weapon properties, feats).

Bundled content is the SRD 5.2.1 and SRD 5.1 (CC-BY-4.0). Options from books you own go in **Rules packs**; they're
stored in your browser only. Characters are saved in `localStorage` and can be exported/imported as JSON.

## At the table

- **Cast:** each spell has a Cast button. It spends a slot (pick a higher level to upcast), rolls the attack or shows the save DC, and rolls damage or healing at the chosen level. Concentration spells are tracked.
- **Attacks:** a Critical hit checkbox doubles the dice. Damage options add Sneak Attack, Divine Smite (spends a slot), Divine Strike and similar. Rage, Hunter's Mark and Hex are added automatically while active.
- **Active effects:** switches for Rage, Bless, Bane, Guidance, Shield, Shield of Faith, Mage Armor, Haste, Barkskin, Hunter's Mark, Hex and subclass states. Their effects apply while on. Exhaustion and conditions apply their penalties per edition.
- **Magic items:** add them from the inventory field; "+1 weapon/armor" asks for the base item. Attunement (max 3) and charges are tracked.
- **Companions:** familiars, companions and summons with rollable stat blocks. Druids get Wild Shape with edition-correct CR limits.
- **Print** button: a one-page sheet (also "Save as PDF").
- **Light / dark:** the switch in the top bar picks Light, Dark or Follow system (kept in this browser).
- **Offline / install:** once opened from a server or host, the app works offline and can be installed ("Install app" in the browser menu). Opening `index.html` from disk won't register the offline worker; use `npm run preview` or a host.

## Run

Requires Node 18+.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine, keyword linker, data schema tests
npm run build      # static site in dist/ (works from any folder or static host)
```

## Rules data

```
data/raw/        5e-bits 2024 SRD 5.2 JSON   (npm run fetch:data to refresh both editions)
data/raw-2014/   5e-bits 2014 SRD 5.1 JSON
data/overlays/   hand-extracted SRD 5.2 text: glossary, invocations, metamagic
data/srd/        generated 2024 app data — do not edit; run npm run build:data
data/srd-2014/   generated 2014 app data (scripts/build-data-2014.ts)
```

`scripts/build-data.ts` converts raw data into the app schema (`src/types/rules.ts`) and adds overlays for
player choices and mechanical effects (skill/expertise picks, fighting styles, weapon mastery, subclass
always-prepared spells, unarmored defense, etc.).

## Rules packs and your own content

The **Rules packs** page (`#/packs`) manages packs and your own content, per edition (switch at the top of the page), with forms for:
- **Feats, Backgrounds, Species, Subclasses** (subclasses include an always-prepared spell table)
- **Spells, Items, Rules terms** (hover definitions)
- **Magic items** from the Item form: rarity, attunement, charges, +N attack/damage/AC/saves, a set ability score, "+N any weapon/armor/shield", or a weapon/armor with its own stats. **Grants** adds effects while equipped (and attuned): resistance, speed, fly/swim/climb, darkvision, skill/save proficiency, language, ability or HP increase, initiative, or a spell the item casts (shown under Spells with the item's name and a note such as "1 charge").
- **Creatures:** stat blocks for companions, familiars and summons. Attacks with a to-hit bonus and damage dice are rollable, and beasts can be used for Wild Shape.

Anything else, such as whole classes or entries with choices and effects, can be imported as JSON in the same format as the bundled data.
**`templates/`** has commented example files for every importable kind (feats that grant spells, species, subclasses, a whole class, spells, magic items, creatures…) and a beginner's guide to writing JSON in `templates/README.md`. Pack entries are edited with **Edit text** (wording only).

## Building packs

No packs are bundled with this repository. A pack is user-authored JSON in the app's format: put one in
`data/packs/<id>/` (a `pack.json` plus part files) and build it. Built packs appear on the landing page and the
Rules packs page of your local build, with one-click Install. Pack folders are gitignored, so they stay on your machine.

```sh
npm run build:packs                                 # validate + merge data/packs/<id>/ → data/packs/<id>.json
npm run build:packs -- data/packs/<id>/<part>.json  # validate one part file
```

Format guide: `data/packs/AUTHORING.md`. Only add content you have the rights to use.

## Code map

- `src/engine/collect.ts` — walks species, background, classes, subclasses and feats; returns granted
  effects, features and every choice (with the player's picks). Choices are keyed by path, e.g.
  `class:fighter:fighter-fighting-style:feat`.
- `src/engine/derive.ts` — computes the sheet: abilities, skills, AC, HP, attacks, spellcasting, slots.
- `src/engine/ops.ts` — level up, rests, damage/heal, starting equipment.
- `src/keywords/` — keyword linker and the hover/focus/tap tooltip.
- `src/pages/` — wizard, sheet, level up, rules packs (custom content).
- `src/theme/` — light/dark setting (`localStorage` `dndb.theme`) and the top-bar switch.

## License

App code: MIT, see `LICENSE`. Rules content: SRD 5.2.1 and SRD 5.1 under CC-BY-4.0, and 5e-bits data under MIT; see `LICENSE-SRD.md` and `LICENSES/`.
