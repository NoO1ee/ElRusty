import { useState } from 'react';
import { ChevronRight, Trash2, PackagePlus, Settings2 } from 'lucide-react';
import { useStudio } from '../store';
import { byDefinition } from '../data/catalog';
import { items, byItem, recipes } from '../data/items';
import { craftSeconds, smelting } from '../simulation/production';
import { ItemImage } from './ItemImage';
import { FilterEditor } from './FilterEditor';
export function Inspector() {
  const node = useStudio((s) => s.circuit.nodes.find((n) => n.selected)),
    runtime = useStudio((s) => (node ? s.simulation.nodeStates[node.id] : undefined)),
    change = useStudio((s) => s.settings),
    notify = useStudio((s) => s.notify);
  const [inventoryItem, setInventoryItem] = useState('wood'),
    [inventoryAmount, setInventoryAmount] = useState(1000),
    [inventoryQuery, setInventoryQuery] = useState(''),
    [filterOpen, setFilterOpen] = useState(false);
  if (!node)
    return (
      <aside className="inspector">
        <div className="panel-heading">
          <h3>Inställningar</h3>
          <button
            className="subtle icon-button"
            aria-label="Dölj inställningar"
            onClick={() => useStudio.setState({ right: false })}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="empty">
          <Settings2 size={28} />
          <h3>Välj en komponent</h3>
          <p>
            Klicka på ett kort på arbetsytan för att se portar, inställningar och simuleringsstatus.
          </p>
        </div>
      </aside>
    );
  const def = byDefinition[node.data.definition],
    settings = node.data.settings,
    inventory = runtime?.inventory || settings.inventory;
  const hasInventory = ['storage', 'furnace', 'crafter'].includes(def.behavior);
  function addStock() {
    if (!node) return;
    const existing = settings.inventory.find((s) => s.item === inventoryItem);
    const next = existing
      ? settings.inventory.map((s) =>
          s.item === inventoryItem ? { ...s, amount: s.amount + inventoryAmount } : s,
        )
      : [...settings.inventory, { item: inventoryItem, amount: inventoryAmount }];
    const slots = next.reduce((a, s) => a + Math.ceil(s.amount / (byItem[s.item]?.stack || 1)), 0);
    if (slots > settings.slots) {
      notify('För få lagerplatser. Minska mängden eller töm lagret.');
      return;
    }
    change(node.id, { inventory: next });
  }
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <h3>Inställningar</h3>
        <button
          className="subtle icon-button"
          aria-label="Dölj inställningar"
          onClick={() => useStudio.setState({ right: false })}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="inspector-component">
        <ItemImage item={def.shortname} />
        <h2>{def.name}</h2>
        <span className={'status-chip ' + (runtime?.active ? 'good' : '')}>
          {runtime?.active ? 'Aktiv' : 'Av / saknar ström'}
        </span>
      </div>
      <section>
        <label className="check-label">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => change(node.id, { enabled: e.target.checked })}
          />
          Aktiverad
        </label>
        {def.behavior === 'branch' && (
          <label>
            Branch Out (rW)
            <input
              type="number"
              min={2}
              max={10000}
              value={settings.branch}
              onChange={(e) =>
                change(node.id, {
                  branch: Math.max(2, Math.min(10000, Math.floor(+e.target.value))),
                })
              }
            />
          </label>
        )}
        {def.behavior === 'timer' && (
          <label>
            Tid (sekunder)
            <input
              type="number"
              min={0.1}
              max={86400}
              value={settings.seconds}
              onChange={(e) =>
                change(node.id, { seconds: Math.max(0.1, Math.min(86400, +e.target.value)) })
              }
            />
          </label>
        )}
        {def.behavior === 'sensor' && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={settings.sensor}
              onChange={(e) => change(node.id, { sensor: e.target.checked })}
            />
            Sensor utlöst
          </label>
        )}
        {runtime?.message && (
          <p role="status" className="help-text">
            {runtime.message}
          </p>
        )}
        <h3>Portar</h3>
        {def.ports.map((p) => (
          <div key={p.id} className="port-summary">
            <span>
              <i className={'mini-port ' + p.kind} />
              {p.name}
            </span>
            <small>
              {p.kind === 'power' && p.direction === 'in' && p.name === 'Power In'
                ? (runtime?.input ?? 0) + ' rW'
                : p.direction === 'in'
                  ? 'IN'
                  : 'OUT'}
            </small>
          </div>
        ))}
      </section>
      {hasInventory && (
        <section>
          <h3>
            Lager <span className="muted">{inventory.reduce((a, s) => a + s.amount, 0)} items</span>
          </h3>
          <div className="inventory-list">
            {inventory.map((s) => (
              <div key={s.item}>
                <ItemImage item={s.item} />
                <span>
                  {byItem[s.item]?.name}
                  <small>{s.amount.toLocaleString('sv-SE')}</small>
                </span>
              </div>
            ))}
            {!inventory.length && <p className="help-text">Lagret är tomt.</p>}
          </div>
          <details>
            <summary>
              <PackagePlus size={14} />
              Redigera startlager
            </summary>
            <input
              aria-label="Sök i startlager"
              placeholder="Sök item…"
              value={inventoryQuery}
              onChange={(e) => setInventoryQuery(e.target.value)}
            />
            <select
              aria-label="Item till startlager"
              value={inventoryItem}
              onChange={(e) => setInventoryItem(e.target.value)}
            >
              {items
                .filter(
                  (i) =>
                    i.id === inventoryItem ||
                    i.name.toLowerCase().includes(inventoryQuery.toLowerCase()),
                )
                .slice(0, 120)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
            <input
              aria-label="Antal till startlager"
              type="number"
              min={1}
              max={1000000}
              value={inventoryAmount}
              onChange={(e) =>
                setInventoryAmount(Math.max(1, Math.min(1000000, Math.floor(+e.target.value))))
              }
            />
            <button onClick={addStock}>Lägg till startlager</button>
            <button
              className="subtle danger-text"
              onClick={() => change(node.id, { inventory: [] })}
            >
              Töm startlager
            </button>
            <p className="help-text">Ändrat startlager återställer simuleringen.</p>
          </details>
        </section>
      )}
      {def.behavior === 'conveyor' && (
        <section>
          <h3>Simuleringsfilter</h3>
          <p className="help-text">
            {settings.filter.rules.length} regler · {settings.filter.mode}
          </p>
          <button onClick={() => setFilterOpen(true)}>Redigera regler</button>
        </section>
      )}
      {def.behavior === 'crafter' && (
        <section>
          <p className="help-text">
            Ett manuellt valt blueprint. Blueprint-transport simuleras ännu inte.
          </p>
          <label>
            Blueprint / recept
            <select
              value={settings.recipe}
              onChange={(e) => change(node.id, { recipe: e.target.value })}
            >
              {Object.keys(recipes).map((id) => (
                <option key={id} value={id}>
                  {byItem[id]?.name || id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workbench tier
            <select
              value={settings.workbench}
              onChange={(e) => change(node.id, { workbench: +e.target.value })}
            >
              {[1, 2, 3].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </section>
      )}
      {def.behavior === 'crafter' && recipes[settings.recipe] && (
        <section>
          <h3>Produktion per sats</h3>
          <p className="help-text">
            {recipes[settings.recipe].output} × {byItem[settings.recipe]?.name} ·{' '}
            {craftSeconds(settings.recipe, settings.workbench) ?? '—'} s · kräver Workbench{' '}
            {recipes[settings.recipe].workbench}
          </p>
          {recipes[settings.recipe].ingredients.map((i) => (
            <p className="help-text" key={i.item}>
              {i.amount} × {byItem[i.item]?.name}
            </p>
          ))}
          <a
            className="text-link"
            href={recipes[settings.recipe].source}
            target="_blank"
            rel="noreferrer"
          >
            Receptkälla ↗
          </a>
        </section>
      )}
      {def.behavior === 'furnace' && (
        <section>
          <h3>Smältning</h3>
          {Object.entries(smelting).map(([id, r]) => (
            <p className="help-text" key={id}>
              {byItem[id]?.name} → {r.output} × {byItem[r.item]?.name} · {r.seconds} s
            </p>
          ))}
          <p className="help-text">
            En produktionskö med delat lager. Blandade malmer och spelets separata slots är ännu
            inte spelverifierade.
          </p>
          <a
            className="text-link"
            href="https://wiki.facepunch.com/rust/item/electric.furnace"
            target="_blank"
            rel="noreferrer"
          >
            Smältningskälla ↗
          </a>
        </section>
      )}
      <section>
        <p className="help-text">
          {def.verification === 'modelled'
            ? 'Utökad simuleringsmodell · jämför beteendet med spelet.'
            : 'Portar dokumenterade; modellens regler testas automatiskt.'}
        </p>
        {def.note && <p className="help-text">{def.note}</p>}
        <a className="text-link" href={def.source} target="_blank" rel="noreferrer">
          Komponentkälla ↗
        </a>
      </section>
      <button className="subtle danger-text" onClick={() => useStudio.getState().deleteSelected()}>
        <Trash2 size={14} />
        Ta bort komponent
      </button>
      {filterOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
          <div
            className="modal large"
            role="dialog"
            aria-modal="true"
            aria-label="Conveyor-regler för simulering"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>Conveyor · simuleringsregler</h2>
              <button aria-label="Stäng simuleringsfilter" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </header>
            <FilterEditor
              compact
              value={settings.filter}
              onChange={(filter) => change(node.id, { filter })}
              onNotice={notify}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
