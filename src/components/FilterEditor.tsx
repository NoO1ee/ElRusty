import { useState } from 'react';
import { Search, Plus, X, Clipboard, Upload, Save } from 'lucide-react';
import { items, byItem, categories, categoryLabels } from '../data/items';
import { categoryIds, categoryFromId } from '../data/categories';
import type { ConveyorFilter, FilterRule } from '../model';
import { exportRustFilter, importRustFilter, MAX_FILTER_RULES } from '../filters';
import { ItemImage } from './ItemImage';
export function FilterEditor({
  value,
  onChange,
  onSave,
  compact = false,
  onNotice,
}: {
  value: ConveyorFilter;
  onChange: (filter: ConveyorFilter) => void;
  onSave?: () => void;
  compact?: boolean;
  onNotice: (s: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('Alla'),
    [limit, setLimit] = useState(60),
    [importText, setImportText] = useState(''),
    [showImport, setShowImport] = useState(false),
    [copied, setCopied] = useState(false);
  const found = items
    .filter(
      (i) =>
        (category === 'Alla' || i.category === category) &&
        (i.name + ' ' + i.id).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const q = query.trim().toLowerCase();
      const score = (i: typeof a) =>
        i.name.toLowerCase() === q || i.id === q ? 0 : i.name.toLowerCase().startsWith(q) ? 1 : 2;
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  const add = (rule: FilterRule) => {
    if (value.rules.length >= MAX_FILTER_RULES) {
      onNotice('Filtret är fullt: högst 30 regler.');
      return;
    }
    if (
      value.rules.some(
        (r) =>
          r.item === rule.item && r.category === rule.category && r.blueprint === rule.blueprint,
      )
    )
      return;
    onChange({ ...value, rules: [...value.rules, rule] });
  };
  const patch = (index: number, change: Partial<FilterRule>) =>
    onChange({
      ...value,
      rules: value.rules.map((r, i) => (i === index ? { ...r, ...change } : r)),
    });
  const copy = async () => {
    try {
      const json = exportRustFilter(value);
      await navigator.clipboard.writeText(json);
      setCopied(true);
      onNotice(
        'JSON kopierad. I Rust: håll Shift och välj Paste (JSON). Ställ filterläget separat.',
      );
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onNotice('Kunde inte kopiera. Använd JSON-fältet nedan: ' + (err as Error).message);
      setImportText(exportRustFilter(value));
      setShowImport(true);
    }
  };
  return (
    <div className={'filter-editor ' + (compact ? 'compact' : '')}>
      <div className="item-browser">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Sök Rust-items"
            placeholder="Sök itemnamn eller shortname…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(60);
            }}
          />
        </div>
        <div className="filter-category-row">
          <select
            aria-label="Itemkategori"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setLimit(60);
            }}
          >
            <option>Alla</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c] || c}
              </option>
            ))}
          </select>
          <span className="muted small">{found.length} items</span>
          {category !== 'Alla' && (
            <button
              className="subtle"
              onClick={() =>
                add({
                  item: null,
                  category: categoryIds[category],
                  min: 0,
                  max: 0,
                  buffer: 0,
                  blueprint: false,
                })
              }
            >
              <Plus size={13} />
              Hela kategorin
            </button>
          )}
        </div>
        <div className="quick-categories">
          {['Resources', 'Construction', 'Component', 'Electrical'].map((c) => (
            <button
              className={c === category ? 'selected' : ''}
              key={c}
              onClick={() => {
                setCategory(c);
                setLimit(60);
              }}
            >
              {categoryLabels[c] || c}
            </button>
          ))}
        </div>
        <div className="item-results">
          {found.slice(0, limit).map((item) => (
            <button
              className={
                'item-tile ' + (value.rules.some((r) => r.item === item.id) ? 'chosen' : '')
              }
              key={item.id}
              onClick={() =>
                add({ item: item.id, category: null, min: 0, max: 0, buffer: 0, blueprint: false })
              }
            >
              <ItemImage item={item.id} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.id}</small>
              </span>
              <Plus size={13} />
            </button>
          ))}
        </div>
        {!found.length && <p className="empty">Inga items matchar sökningen.</p>}
        {found.length > limit && (
          <button onClick={() => setLimit(limit + 60)}>Visa fler ({found.length - limit})</button>
        )}
      </div>
      <aside className="filter-rules">
        <label>
          Filternamn
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value.slice(0, 200) })}
          />
        </label>
        <div className="section-title">
          <h3>Valda regler</h3>
          <span>
            {value.rules.length} / {MAX_FILTER_RULES}
          </span>
        </div>
        {value.rules.length === 0 && (
          <p className="empty">
            Välj ett item eller en hel kategori. Ett tomt filter tillåter alla items.
          </p>
        )}
        <div className="rules-list">
          {value.rules.map((rule, index) => (
            <div className="filter-rule" key={rule.item ?? 'category' + rule.category}>
              <div className="rule-heading">
                {rule.item && <ItemImage item={rule.item} />}
                <strong>
                  {rule.item
                    ? byItem[rule.item]?.name
                    : 'Kategori: ' +
                      (categoryLabels[categoryFromId(rule.category!)] ||
                        categoryFromId(rule.category!))}
                </strong>
                <button
                  className="subtle icon-button"
                  aria-label={'Ta bort regel ' + (index + 1)}
                  onClick={() =>
                    onChange({ ...value, rules: value.rules.filter((_, i) => index !== i) })
                  }
                >
                  <X size={14} />
                </button>
              </div>
              <div className="amount-fields">
                {(['min', 'max', 'buffer'] as const).map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      disabled={value.mode === 'all' && field !== 'buffer'}
                      value={rule[field]}
                      onChange={(e) =>
                        patch(index, {
                          [field]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={rule.blueprint}
                  onChange={(e) => patch(index, { blueprint: e.target.checked })}
                />
                Blueprint
              </label>
            </div>
          ))}
        </div>
        <label>
          Filterläge
          <select
            value={value.mode}
            onChange={(e) => onChange({ ...value, mode: e.target.value as ConveyorFilter['mode'] })}
          >
            <option value="any">Any Item · minst en regel</option>
            <option value="all">Require All · alla regler</option>
            <option value="exclude">Exclude Listed Items</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary" onClick={copy}>
            <Clipboard size={15} />
            {copied ? 'Kopierat!' : 'Kopiera till Rust'}
          </button>
          {onSave && (
            <button onClick={onSave}>
              <Save size={15} />
              Spara filter
            </button>
          )}
          <button className="subtle" onClick={() => setShowImport(!showImport)}>
            <Upload size={14} />
            Importera / visa JSON
          </button>
        </div>
        <p className="help-text">
          Min lämnas kvar i källan. Max begränsar målboxen. Buffer kräver en minsta sats. 0 betyder
          ingen gräns. Filterläget väljs separat i spelet.
        </p>
        <p className="help-text warning-text">
          Exportformatet är testat som JSON. Inklistring i Rust är ännu inte verifierad.
        </p>
        {showImport && (
          <div className="json-panel">
            <textarea
              aria-label="Rust filter JSON"
              value={importText || exportRustFilter(value)}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
            />
            <button
              onClick={() => {
                try {
                  onChange({ ...value, rules: importRustFilter(importText) });
                  onNotice('Rust-filter importerat.');
                } catch (e) {
                  onNotice((e as Error).message);
                }
              }}
            >
              Importera regler
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
