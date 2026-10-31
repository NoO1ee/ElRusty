import { useState } from 'react';
import { ChevronRight, Trash2, PackagePlus, Settings2 } from 'lucide-react';
import { useStudio } from '../store';
import { byDefinition } from '../data/catalog';
import { items, byItem, recipes } from '../data/items';
import { craftSeconds, smelting } from '../simulation/production';
import {
  initialInventory,
  startBlueprints,
  insertStock,
  inventoryProblem,
  layout,
  stackSize,
  type Compartment,
} from '../simulation/inventory';
import { powerStatus } from '../simulation/power-status';
import { ItemImage } from './ItemImage';
import { FilterEditor } from './FilterEditor';
export function Inspector() {
  const node = useStudio((s) => s.circuit.nodes.find((n) => n.selected)),
    testInputs = useStudio((s) => s.testInputs),
    reference = useStudio((s) => s.circuit.example?.mode === 'reference'),
    runtime = useStudio((s) => (node ? s.simulation.nodeStates[node.id] : undefined)),
    change = useStudio((s) => s.settings),
    notify = useStudio((s) => s.notify);
  const [inventoryItem, setInventoryItem] = useState('wood'),
    [inventoryAmount, setInventoryAmount] = useState(1000),
    [inventoryQuery, setInventoryQuery] = useState(''),
    [filterOpen, setFilterOpen] = useState(false),
    [inventoryBlueprint, setInventoryBlueprint] = useState(false),
    [inventoryPart, setInventoryPart] = useState<Compartment>('input');
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
    inventory = runtime?.inventory || initialInventory(node);
  const hasInventory = ['storage', 'furnace', 'crafter'].includes(def.behavior);
  function addStock() {
    if (!node) return;
    const next = initialInventory(node).filter((s) => def.behavior !== 'crafter' || !s.blueprint);
    const isBlueprint = def.behavior === 'storage' && inventoryBlueprint;
    const part = isBlueprint ? 'blueprint' : inventoryPart;
    if (
      def.behavior === 'furnace' &&
      (isBlueprint ||
        (part === 'input'
          ? !smelting[inventoryItem]
          : !Object.values(smelting).some((r) => r.item === inventoryItem)))
    ) {
      notify('Välj ett item som ugnen kan behandla i den valda lagerdelen.');
      return;
    }
    if (def.behavior === 'crafter' && isBlueprint) {
      notify('Blueprints för craftern väljs i de fyra platserna nedan.');
      return;
    }
    const added = insertStock(
      node,
      next,
      {
        item: inventoryItem,
        amount: inventoryAmount,
        ...(isBlueprint ? { blueprint: true } : {}),
      },
      inventoryAmount,
      part,
    );
    if (added !== inventoryAmount || inventoryProblem(node, next)) {
      notify('För få platser i vald lagerdel. Minska mängden eller töm startlagret.');
      return;
    }
    change(node.id, {
      inventory: next,
      ...(def.behavior === 'crafter' ? { blueprints: startBlueprints(node) } : {}),
    });
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
        <h2>{node.data.label || def.name}</h2>
        <span className={'status-chip ' + (runtime?.active ? 'good' : '')}>
          {reference
            ? 'Kopplingsreferens'
            : runtime && powerStatus(def, runtime.input) === 'missing'
              ? 'Saknar ström'
              : runtime && powerStatus(def, runtime.input) === 'insufficient'
                ? 'För lite ström'
                : runtime?.active
                  ? 'Aktiv'
                  : 'Avstängd'}
        </span>
      </div>
      <section>
        {node.id in testInputs && (
          <p className="help-text">
            Testsignal från lektionsguiden: {testInputs[node.id] ? 'På' : 'Av'}. Aktiverad nedan är
            startinställningen.
          </p>
        )}
        <label>
          Komponentnamn
          <input
            aria-label="Komponentnamn"
            value={node.data.label || ''}
            placeholder={def.name}
            maxLength={120}
            onFocus={() => useStudio.getState().checkpoint()}
            onChange={(e) => {
              const s = useStudio.getState();
              s.setGraph(
                s.circuit.nodes.map((n) =>
                  n.id === node.id ? { ...n, data: { ...n.data, label: e.target.value } } : n,
                ),
              );
            }}
          />
        </label>
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
              min={1}
              max={10000}
              value={settings.branch}
              onChange={(e) =>
                change(node.id, {
                  branch: Math.max(1, Math.min(10000, Math.floor(+e.target.value))),
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
            {inventory.map((s, i) => (
              <div key={s.slot ?? i}>
                <ItemImage item={s.item} />
                <span>
                  {byItem[s.item]?.name}
                  {s.blueprint ? ' Blueprint' : ''}
                  <small>
                    {s.amount.toLocaleString('sv-SE')}
                    {s.slot !== undefined ? ` · plats ${s.slot + 1}` : ''}
                  </small>
                </span>
              </div>
            ))}
            {!inventory.length && <p className="help-text">Lagret är tomt.</p>}
          </div>
          {layout(node) && (
            <div aria-label="Maskinens lagerplatser">
              {(Object.entries(layout(node)) as [Compartment, number[]][])
                .filter(([, slots]) => slots.length)
                .map(([part, slots]) => (
                  <div key={part}>
                    <p className="help-text">
                      {part === 'input'
                        ? 'Inmatning'
                        : part === 'output'
                          ? 'Utmatning'
                          : 'Blueprints'}{' '}
                      · {slots.length} platser
                    </p>
                    <div className="machine-slots">
                      {slots.map((slot) => {
                        const item = inventory.find((s) => s.slot === slot);
                        return (
                          <div
                            className="machine-slot"
                            key={slot}
                            title={
                              item
                                ? byItem[item.item]?.name + (item.blueprint ? ' Blueprint' : '')
                                : 'Tom plats'
                            }
                          >
                            {item ? (
                              <>
                                <ItemImage item={item.item} />
                                <span>
                                  {item.amount} / {stackSize(item)}
                                </span>
                              </>
                            ) : (
                              <span>Tom</span>
                            )}
                            <small>#{slot + 1}</small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
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
            {def.behavior === 'storage' && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={inventoryBlueprint}
                  onChange={(e) => {
                    setInventoryBlueprint(e.target.checked);
                    if (e.target.checked) setInventoryAmount(1);
                  }}
                />
                Blueprint
              </label>
            )}
            {layout(node) && (
              <label>
                Lagerdel
                <select
                  value={inventoryPart}
                  onChange={(e) => setInventoryPart(e.target.value as Compartment)}
                >
                  <option value="input">Inmatning</option>
                  <option value="output">Utmatning</option>
                </select>
              </label>
            )}
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
            Blueprints prioriteras från vänster till höger. Conveyors kan mata in och ta ut dem via
            blueprint-portarna.
          </p>
          <label>
            Blueprint / recept
            <select
              value={settings.recipe}
              onChange={(e) =>
                change(node.id, {
                  recipe: e.target.value,
                  blueprints: [e.target.value, ...startBlueprints(node).slice(1)],
                })
              }
            >
              {Object.keys(recipes).map((id) => (
                <option key={id} value={id}>
                  {byItem[id]?.name || id}
                </option>
              ))}
            </select>
          </label>
          {[0, 1, 2, 3].map((index) => (
            <label key={index}>
              Blueprint-plats {index + 1}
              <select
                aria-label={'Blueprint-plats ' + (index + 1)}
                value={startBlueprints(node)[index] ?? ''}
                onChange={(e) => {
                  const blueprints = Array.from(
                    { length: 4 },
                    (_, i) => startBlueprints(node)[i] ?? '',
                  );
                  blueprints[index] = e.target.value;
                  change(node.id, { blueprints });
                }}
              >
                <option value="">Tom</option>
                {Object.keys(recipes).map((id) => (
                  <option key={id} value={id}>
                    {byItem[id]?.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
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
            Två inmatningsplatser delar smälthastigheten. Färdiga items hamnar enbart i de tre
            utmatningsplatserna. Blandade material behöver fortfarande jämföras i spelet.
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
