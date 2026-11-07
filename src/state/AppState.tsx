import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRegistry, mergeRules, type CustomContent, type Registry } from '../data/registry';
import { RULES } from '../data/srd';
import { roll, type RollMode, type RollResult } from '../engine/dice';
import { createLinker, type Linker } from '../keywords/linker';
import { loadCharacters, loadCustom, saveCharacters, saveCustom } from '../storage/storage';
import type { Character } from '../types/character';
import { EDITIONS, type Edition } from '../types/rules';

export interface Rules {
  registry: Registry;
  linker: Linker;
}

interface AppState {
  /** Rules (SRD + matching custom content) per edition. */
  rules: Record<Edition, Rules>;
  characters: Record<string, Character>;
  saveCharacter: (c: Character) => void;
  deleteCharacter: (id: string) => void;
  custom: CustomContent;
  setCustom: (c: CustomContent) => void;
  storageOk: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [characters, setCharacters] = useState(loadCharacters);
  const [custom, setCustomState] = useState(loadCustom);
  const [storageOk, setStorageOk] = useState(true);

  const rules = useMemo(
    () =>
      Object.fromEntries(
        EDITIONS.map((e) => {
          const registry = createRegistry(mergeRules(RULES[e], custom));
          return [e, { registry, linker: createLinker(registry) }];
        }),
      ) as Record<Edition, Rules>,
    [custom],
  );

  useEffect(() => setStorageOk(saveCharacters(characters)), [characters]);

  const saveCharacter = useCallback((c: Character) => {
    setCharacters((all) => ({ ...all, [c.id]: { ...c, updatedAt: new Date().toISOString() } }));
  }, []);
  const deleteCharacter = useCallback((id: string) => {
    setCharacters((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
  }, []);
  const setCustom = useCallback((c: CustomContent) => {
    setCustomState(c);
    setStorageOk(saveCustom(c));
  }, []);

  const value = useMemo(
    () => ({ rules, characters, saveCharacter, deleteCharacter, custom, setCustom, storageOk }),
    [rules, characters, saveCharacter, deleteCharacter, custom, setCustom, storageOk],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}

const EditionCtx = createContext<Edition>('2024');

/** Sets which edition's rules the components below use (a character's ruleset). */
export function RulesProvider({ edition, children }: { edition: Edition; children: ReactNode }) {
  return <EditionCtx.Provider value={edition}>{children}</EditionCtx.Provider>;
}

/** Registry + keyword linker for the nearest RulesProvider (2024 if none). */
export function useRules(): Rules & { edition: Edition } {
  const edition = useContext(EditionCtx);
  return { ...useApp().rules[edition], edition };
}

/** Character by id plus an updater that persists. */
export function useCharacter(id: string | undefined) {
  const { characters, saveCharacter } = useApp();
  const character = id ? characters[id] : undefined;
  const update = useCallback(
    (fn: (c: Character) => Character) => {
      if (character) saveCharacter(fn(character));
    },
    [character, saveCharacter],
  );
  return [character, update] as const;
}

// ---------- dice rolling ----------

interface DiceState {
  rolls: RollResult[];
  mode: RollMode;
  setMode: (m: RollMode) => void;
  rollDice: (label: string, expression: string, opts?: { d20?: boolean }) => RollResult | null;
  clear: () => void;
}

const DiceCtx = createContext<DiceState | null>(null);

export function DiceProvider({ children }: { children: ReactNode }) {
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [mode, setMode] = useState<RollMode>('normal');
  const rollDice = useCallback(
    (label: string, expression: string, opts?: { d20?: boolean }) => {
      const r = roll(label, expression, opts?.d20 ? mode : 'normal');
      if (r) setRolls((xs) => [r, ...xs].slice(0, 30));
      // Advantage/disadvantage is a one-shot toggle.
      if (opts?.d20) setMode('normal');
      return r;
    },
    [mode],
  );
  const value = useMemo(() => ({ rolls, mode, setMode, rollDice, clear: () => setRolls([]) }), [rolls, mode, rollDice]);
  return <DiceCtx.Provider value={value}>{children}</DiceCtx.Provider>;
}

export function useDice(): DiceState {
  const v = useContext(DiceCtx);
  if (!v) throw new Error('useDice outside DiceProvider');
  return v;
}
