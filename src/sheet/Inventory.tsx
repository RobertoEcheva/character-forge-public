import { useState } from 'react';
import { uid } from '../engine/ops';
import { useRules } from '../state/AppState';
import type { Character, Coins, InventoryItem } from '../types/character';
import type { ItemDef } from '../types/rules';
import { CoinIcon } from '../components/icons';
import { Pips, useSheet } from './common';

const COIN_NAMES = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' } as const;

export function Inventory() {
  const { character, sheet, update } = useSheet();
  const { registry } = useRules();
  const [adding, setAdding] = useState('');
  const [baseFor, setBaseFor] = useState<ItemDef | null>(null);
  const [baseId, setBaseId] = useState('');
  const items = character.inventory;
  const setItems = (inventory: Character['inventory']) => update((c) => ({ ...c, inventory }));
  const patch = (u: string, p: Partial<InventoryItem>) => setItems(items.map((x) => (x.uid === u ? { ...x, ...p } : x)));

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    const item = registry.data.items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (item?.magic?.variantOf) {
      setBaseFor(item);
      setBaseId('');
      return;
    }
    setItems([...items, { uid: uid(), ...(item ? { itemId: item.id } : {}), name: item?.name ?? name, qty: 1 }]);
    setAdding('');
  };

  // "+1 weapon" style items need the mundane item they enchant.
  const bases = baseFor
    ? registry.data.items.filter((i) =>
        baseFor.magic!.variantOf === 'weapon' ? i.weapon : baseFor.magic!.variantOf === 'shield' ? i.armor?.type === 'shield' : i.armor && i.armor.type !== 'shield',
      )
    : [];
  const addVariant = () => {
    const base = registry.items.get(baseId);
    if (!base || !baseFor) return;
    const plus = baseFor.name.match(/\+\d/)?.[0] ?? '';
    setItems([...items, { uid: uid(), itemId: base.id, magicId: baseFor.id, name: `${base.name} ${plus}`.trim(), qty: 1, equipped: true }]);
    setBaseFor(null);
    setAdding('');
  };

  const coins = character.coins;
  return (
    <section className="block">
      <h2>Inventory</h2>
      <ul className="inventory">
        {items.map((it) => {
          const def = it.itemId ? registry.items.get(it.itemId) : undefined;
          const magic = registry.items.get(it.magicId ?? it.itemId ?? '')?.magic;
          const equippable = Boolean(def?.weapon || def?.armor || magic);
          return (
            <li key={it.uid} className={magic ? 'is-magic' : ''}>
              {equippable ? (
                <input
                  type="checkbox"
                  checked={Boolean(it.equipped)}
                  aria-label={`Equip ${it.name}`}
                  title={magic && !def?.weapon && !def?.armor ? 'Worn / carried' : 'Equipped'}
                  onChange={(e) => patch(it.uid, { equipped: e.target.checked })}
                />
              ) : (
                <span className="inv-gap" />
              )}
              <span className="inv-name" title={registry.items.get(it.magicId ?? '')?.description ?? def?.description}>
                {it.name}
                {magic && (
                  <span className="inv-magic small">
                    {magic.rarity}
                    {magic.attunement && (
                      <label className="row">
                        <input type="checkbox" checked={Boolean(it.attuned)} onChange={(e) => patch(it.uid, { attuned: e.target.checked })} />
                        attuned
                      </label>
                    )}
                    {magic.charges ? (
                      <Pips label={`${it.name} charges`} total={magic.charges} used={it.chargesUsed ?? 0} onSet={(v) => patch(it.uid, { chargesUsed: v })} />
                    ) : null}
                  </span>
                )}
              </span>
              <input
                type="number"
                min={0}
                className="inv-qty"
                value={it.qty}
                aria-label={`Quantity of ${it.name}`}
                onChange={(e) => patch(it.uid, { qty: Math.max(0, Number(e.target.value) || 0) })}
              />
              <button type="button" className="btn-quiet btn-small" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((x) => x.uid !== it.uid))}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {sheet.attuned > 0 && <p className="small muted">Attuned: {sheet.attuned} of 3.</p>}
      {baseFor ? (
        <div className="row base-pick">
          <span className="small">{baseFor.name} — which {baseFor.magic!.variantOf}?</span>
          <select value={baseId} onChange={(e) => setBaseId(e.target.value)} aria-label="Base item">
            <option value="">Choose…</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-small btn-primary" disabled={!baseId} onClick={addVariant}>
            Add
          </button>
          <button type="button" className="btn-small btn-quiet" onClick={() => setBaseFor(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <form className="row" onSubmit={(e) => (e.preventDefault(), add())}>
          <input list="item-names" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add an item or magic item" aria-label="Item name" style={{ flex: 1 }} />
          <datalist id="item-names">
            {registry.data.items.map((i) => (
              <option key={i.id} value={i.name}>
                {i.magic ? `${i.magic.rarity} magic item` : undefined}
              </option>
            ))}
          </datalist>
          <button type="submit" disabled={!adding.trim()}>Add</button>
        </form>
      )}
      <div className="coins">
        {(['cp', 'sp', 'ep', 'gp', 'pp'] as (keyof Coins)[]).map((k) => (
          <label key={k}>
            <span className="coin-label">
              <CoinIcon coin={k} /> {COIN_NAMES[k]}
            </span>
            <input
              type="number"
              min={0}
              value={coins[k]}
              onChange={(e) => update((c) => ({ ...c, coins: { ...c.coins, [k]: Math.max(0, Number(e.target.value) || 0) } }))}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
