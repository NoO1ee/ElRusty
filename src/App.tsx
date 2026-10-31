import { useEffect, useRef, useState } from 'react';
import {
  Workflow,
  ListFilter,
  FolderOpen,
  Search,
  PanelLeftClose,
  PanelRightClose,
  Play,
  Pause,
  RotateCcw,
  Save,
  Plus,
  Download,
  Upload,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  Pencil,
  ArrowUpRight,
  ChevronRight,
  Check,
  AlertCircle,
  StepForward,
  ExternalLink,
  Zap,
} from 'lucide-react';
import type {
  Circuit,
  ConveyorFilter,
  SavedRecord,
  SimulationRequest,
  SimulationResponse,
} from './model';
import { blankCircuit, emptyFilter } from './model';
import { catalog, starterCircuit } from './data/catalog';
import { items } from './data/items';
import { useStudio } from './store';
import {
  db,
  listRecords,
  saveRecord,
  encodeBackup,
  decodeBackup,
  downloadJson,
  loadCircuit,
  validateFilter,
} from './storage';
import { CircuitCanvas } from './components/CircuitCanvas';
import { Inspector } from './components/Inspector';
import { FilterEditor } from './components/FilterEditor';
import { ExampleLibrary, ExampleGuide } from './components/ExampleLibrary';
import { openExample } from './data/examples';
import { LivePage } from './components/LivePage';
import { ItemImage } from './components/ItemImage';

function useSimulator() {
  const circuit = useStudio((s) => s.circuit),
    running = useStudio((s) => s.running),
    testInputs = useStudio((s) => s.testInputs),
    inputsRef = useRef(testInputs),
    pendingInputs = useRef<Record<string, boolean>[]>([]),
    worker = useRef<Worker | null>(null),
    busy = useRef(false),
    seq = useRef(0),
    latest = useRef(0),
    circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  inputsRef.current = testInputs;
  const signature = JSON.stringify({
    nodes: circuit.nodes.map((n) => ({
      id: n.id,
      definition: n.data.definition,
      settings: n.data.settings,
    })),
    lesson: circuit.lesson
      ? {
          component: circuit.lesson.component,
          controls: circuit.lesson.areas.flatMap((a) => a.controls),
        }
      : undefined,
    exampleMode: circuit.example?.mode,
    edges: circuit.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      kind: e.data?.kind,
    })),
  });
  const send = (type: 'step' | 'reset', dt = 0.25, inputSnapshot = inputsRef.current) => {
    if (!worker.current || (busy.current && type !== 'reset')) return;
    if (type === 'reset') pendingInputs.current = [];
    const requestId = ++seq.current;
    latest.current = requestId;
    busy.current = true;
    worker.current.postMessage({
      type,
      dt,
      requestId,
      circuit: structuredClone(circuitRef.current),
      testInputs: { ...inputSnapshot },
    } satisfies SimulationRequest);
  };
  useEffect(() => {
    const w = new Worker(new URL('./simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<SimulationResponse>) => {
      if (e.data.requestId !== latest.current) return;
      busy.current = false;
      useStudio.setState({ simulation: e.data.result });
      const nextInputs = pendingInputs.current.shift();
      if (nextInputs) send('step', 0, nextInputs);
    };
    w.onerror = (e) => {
      busy.current = false;
      pendingInputs.current = [];
      useStudio.setState({ running: false, message: 'Simuleringsfel: ' + e.message });
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    send('reset', 0);
  }, [signature]);
  useEffect(() => {
    if (busy.current) pendingInputs.current.push({ ...testInputs });
    else send('step', 0, testInputs);
  }, [testInputs]);
  useEffect(() => {
    if (!running || circuit.example?.mode === 'reference') return;
    const interval = setInterval(() => send('step'), 250);
    return () => clearInterval(interval);
  }, [running]);
  return { reset: () => send('reset', 0), step: () => send('step') };
}
function Library() {
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('Alla');
  const vp = useStudio((s) => s.circuit.viewport);
  return (
    <aside className="library">
      <div className="panel-heading">
        <h3>Komponenter</h3>
        <button
          className="subtle icon-button"
          aria-label="Dölj komponenter"
          onClick={() => useStudio.setState({ left: false })}
        >
          <PanelLeftClose size={17} />
        </button>
      </div>
      <div className="searchbox">
        <Search size={15} />
        <input
          aria-label="Sök komponenter"
          placeholder="Sök komponent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="component-categories">
        {['Alla', 'El', 'Industrial', 'Logik', 'Sensorer', 'Förvaring', 'Förbrukare'].map((c) => (
          <button
            className={category === c ? 'selected' : ''}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="library-count">
        {catalog.length} komponenter · {items.length} items
      </div>
      <div className="component-grid">
        {catalog
          .filter(
            (c) =>
              (category === 'Alla' || category === c.category) &&
              (c.name + ' ' + c.shortname).toLowerCase().includes(search.toLowerCase()),
          )
          .map((c) => (
            <button
              draggable
              key={c.id}
              data-testid={'palette-' + c.id}
              className="component-tile"
              onDragStart={(e) => {
                e.dataTransfer.setData('application/elrusty', c.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() =>
                useStudio.getState().add(c.id, (-vp.x + 360) / vp.zoom, (-vp.y + 220) / vp.zoom)
              }
            >
              <ItemImage item={c.shortname} />
              <strong>{c.name}</strong>
              <span>{c.category}</span>
            </button>
          ))}
      </div>
      <div className="library-footer">
        <h3>Kom igång</h3>
        <button onClick={() => useStudio.getState().replace(starterCircuit())}>
          <Workflow size={14} />
          Öppna sorteringsexempel
        </button>
        <p>Dra ett item till arbetsytan eller klicka för att placera det.</p>
      </div>
    </aside>
  );
}

export default function App() {
  const [view, setView] = useState<'circuit' | 'filters' | 'saved' | 'examples' | 'live'>(
      'circuit',
    ),
    [records, setRecords] = useState<SavedRecord[]>([]),
    [filter, setFilter] = useState<ConveyorFilter>(emptyFilter),
    [filterId, setFilterId] = useState<string>(() => crypto.randomUUID()),
    [recordKind, setRecordKind] = useState('all'),
    [recordSearch, setRecordSearch] = useState(''),
    [ready, setReady] = useState(false),
    [dialog, setDialog] = useState<{ id: string; value: string } | null>(null),
    [filterSaveStatus, setFilterSaveStatus] = useState('');
  const circuit = useStudio((s) => s.circuit),
    left = useStudio((s) => s.left),
    right = useStudio((s) => s.right),
    running = useStudio((s) => s.running),
    simulation = useStudio((s) => s.simulation),
    message = useStudio((s) => s.message),
    saveStatus = useStudio((s) => s.saveStatus),
    past = useStudio((s) => s.past.length),
    future = useStudio((s) => s.future.length);
  const notify = useStudio((s) => s.notify);
  const fileInput = useRef<HTMLInputElement>(null);
  const simulator = useSimulator();
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const refresh = () =>
    listRecords()
      .then(setRecords)
      .catch((e) => notify('Kunde inte läsa biblioteket: ' + e.message));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const preferences = await db.preferences.toArray();
        const get = (k: string) => preferences.find((p) => p.key === k)?.value;
        const saved = await listRecords();
        if (cancelled) return;
        setRecords(saved);
        const circuitRecord = saved.find(
          (r) => r.id === get('lastCircuit') && r.kind === 'circuit',
        );
        if (circuitRecord) {
          const loaded = loadCircuit(circuitRecord.payload);
          useStudio.getState().replace(loaded.circuit);
          if (loaded.notice) notify(loaded.notice);
        }
        const filterRecord = saved.find((r) => r.id === get('lastFilter') && r.kind === 'filter');
        if (filterRecord) {
          validateFilter(filterRecord.payload);
          setFilter(filterRecord.payload);
          setFilterId(filterRecord.id);
        }
        useStudio.setState({
          left: typeof get('left') === 'boolean' ? (get('left') as boolean) : true,
          right: typeof get('right') === 'boolean' ? (get('right') as boolean) : true,
          saveStatus: 'Lokalt bibliotek klart',
        });
      } catch (e) {
        notify('Lokal lagring kunde inte öppnas: ' + (e as Error).message);
        useStudio.setState({ saveStatus: 'Lagring otillgänglig · exportera backup' });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const persistedCircuit = JSON.stringify({
    ...circuit,
    nodes: circuit.nodes.map(({ selected, dragging, measured, ...n }) => n),
    edges: circuit.edges.map(({ selected, ...e }) => e),
  });
  useEffect(() => {
    if (!ready) return;
    useStudio.setState({ saveStatus: 'Osparade ändringar…' });
    const timer = setTimeout(async () => {
      try {
        const payload = JSON.parse(persistedCircuit) as Circuit;
        await saveRecord({
          id: payload.id,
          kind: 'circuit',
          name: payload.name,
          updatedAt: Date.now(),
          payload,
        });
        await db.preferences.put({ key: 'lastCircuit', value: payload.id });
        useStudio.setState({ saveStatus: 'Sparat lokalt' });
        refresh();
      } catch (e) {
        useStudio.setState({ saveStatus: 'Kunde inte spara' });
        notify('Lagringsfel: ' + (e as Error).message);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [persistedCircuit, ready]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      try {
        await saveRecord({
          id: filterId,
          kind: 'filter',
          name: filter.name,
          updatedAt: Date.now(),
          payload: filter,
        });
        await db.preferences.put({ key: 'lastFilter', value: filterId });
        setFilterSaveStatus('Sparat lokalt');
        refresh();
      } catch (e) {
        setFilterSaveStatus('Kunde inte spara');
        notify('Filtret kunde inte sparas: ' + (e as Error).message);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [filter, filterId, ready]);
  useEffect(() => {
    if (ready)
      db.preferences
        .bulkPut([
          { key: 'left', value: left },
          { key: 'right', value: right },
        ])
        .catch(() => {});
  }, [left, right, ready]);
  async function manualSave() {
    try {
      if (view === 'filters') {
        await saveRecord({
          id: filterId,
          kind: 'filter',
          name: filter.name,
          updatedAt: Date.now(),
          payload: filter,
        });
        setFilterSaveStatus('Sparat lokalt');
      } else {
        await saveRecord({
          id: circuit.id,
          kind: 'circuit',
          name: circuit.name,
          updatedAt: Date.now(),
          payload: JSON.parse(persistedCircuit),
        });
        useStudio.setState({ saveStatus: 'Sparat lokalt' });
      }
      await refresh();
      notify('Sparat i ditt lokala bibliotek.');
    } catch (e) {
      notify('Kunde inte spara: ' + (e as Error).message);
    }
  }
  async function openRecord(r: SavedRecord) {
    try {
      if (r.kind === 'circuit') {
        const loaded = loadCircuit(r.payload);
        useStudio.getState().replace(loaded.circuit);
        if (loaded.notice) r = { ...r, migrationNotice: loaded.notice };
        setView('circuit');
      } else {
        validateFilter(r.payload);
        setFilter(r.payload);
        setFilterId(r.id);
        setView('filters');
      }
      notify(r.migrationNotice || 'Öppnade ' + r.name);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function duplicate(r: SavedRecord) {
    try {
      const copy = structuredClone(r);
      copy.id = crypto.randomUUID();
      copy.name += ' (kopia)';
      copy.payload.name = copy.name;
      if (copy.kind === 'circuit') (copy.payload as Circuit).id = copy.id;
      copy.updatedAt = Date.now();
      await saveRecord(copy);
      await refresh();
      notify('Kopia skapad.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function deleteRecord(r: SavedRecord) {
    if (
      !window.confirm(
        'Radera ' + r.name + ' från den här enheten? Exportera först om du vill behålla en backup.',
      )
    )
      return;
    try {
      await db.records.delete(r.id);
      if (r.id === circuit.id) useStudio.getState().replace(blankCircuit());
      if (r.id === filterId) {
        setFilter(emptyFilter());
        setFilterId(crypto.randomUUID());
      }
      await refresh();
      notify('Raderat från biblioteket.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const filterView = (
    <div className="page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">FRÅN PLAN TILL SPEL</div>
          <h1>Conveyor-filter</h1>
          <p>Sök bland alla Rust-items. Spara dina filter och kopiera dem till spelet.</p>
        </div>
        <div className="page-actions">
          <span className="save-status">
            <Check size={13} />
            {filterSaveStatus}
          </span>
          <button
            onClick={() => {
              setFilter(emptyFilter());
              setFilterId(crypto.randomUUID());
            }}
          >
            <Plus size={15} />
            Nytt filter
          </button>
          <button onClick={() => downloadJson(filter.name, encodeBackup('filter', filter))}>
            <Download size={15} />
            Backup
          </button>
        </div>
      </header>
      <FilterEditor value={filter} onChange={setFilter} onSave={manualSave} onNotice={notify} />
    </div>
  );
  return (
    <div className="application" data-ready={ready} aria-busy={!ready}>
      {!ready && (
        <div className="boot-screen" role="status">
          Läser ditt lokala bibliotek…
        </div>
      )}
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('circuit');
          }}
          aria-label="ElRusty hem"
        >
          <span className="brand-mark">
            <Zap size={21} fill="currentColor" />
          </span>
          El<span>Rusty</span>
          <small>CIRCUIT STUDIO</small>
        </a>
        <nav aria-label="Huvudmeny">
          <button className={view === 'circuit' ? 'active' : ''} onClick={() => setView('circuit')}>
            <Workflow size={16} />
            Kretsbyggare
          </button>
          <button className={view === 'filters' ? 'active' : ''} onClick={() => setView('filters')}>
            <ListFilter size={16} />
            Conveyor-filter
          </button>
          <button
            className={view === 'examples' ? 'active' : ''}
            onClick={() => setView('examples')}
          >
            <Workflow size={16} />
            Exempelbyggen
          </button>
          <button
            className={view === 'saved' ? 'active' : ''}
            onClick={() => {
              setView('saved');
              refresh();
            }}
          >
            <FolderOpen size={16} />
            Sparat <span className="nav-count">{records.length}</span>
          </button>
          <button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>
            <Zap size={16} />
            Live
          </button>
        </nav>
        <a
          className="source-link"
          href="https://github.com/NoO1ee/ElRusty"
          target="_blank"
          rel="noreferrer"
        >
          Open source
          <ArrowUpRight size={13} />
        </a>
      </header>
      {view === 'circuit' && (
        <main className="circuit-view">
          <div className="workspace-toolbar">
            <div className="project-info">
              <input
                aria-label="Kretsnamn"
                value={circuit.name}
                onChange={(e) => useStudio.getState().rename(e.target.value)}
              />
              <span className="save-status">
                <span className={'save-dot ' + (saveStatus.includes('Kunde') ? 'error' : '')} />
                {saveStatus}
              </span>
            </div>
            <div className="toolbar-actions">
              <div className="toolbar-group">
                <button
                  className={'icon-button ' + (left ? 'selected' : '')}
                  aria-label="Visa eller dölj komponentpanel"
                  aria-pressed={left}
                  onClick={() => useStudio.setState({ left: !left })}
                >
                  <PanelLeftClose size={17} />
                </button>
                <button
                  className={'icon-button ' + (right ? 'selected' : '')}
                  aria-label="Visa eller dölj inställningar"
                  aria-pressed={right}
                  onClick={() => useStudio.setState({ right: !right })}
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              <div className="toolbar-group">
                <button
                  className="icon-button"
                  aria-label="Ångra"
                  disabled={!past}
                  onClick={() => useStudio.getState().undo()}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Gör om"
                  disabled={!future}
                  onClick={() => useStudio.getState().redo()}
                >
                  <Redo2 size={16} />
                </button>
              </div>
              <button
                className="subtle"
                onClick={() => useStudio.getState().replace(blankCircuit())}
              >
                <Plus size={15} />
                Ny krets
              </button>
              <button
                aria-label="Återställ simulering"
                className="icon-button"
                onClick={simulator.reset}
              >
                <RotateCcw size={16} />
              </button>
              <button
                aria-label="Stega simulering"
                className="icon-button"
                disabled={running || circuit.example?.mode === 'reference'}
                onClick={simulator.step}
              >
                <StepForward size={16} />
              </button>
              <button
                disabled={circuit.example?.mode === 'reference'}
                title={
                  circuit.example?.mode === 'reference'
                    ? 'Kopplingsreferens: nödvändiga spelregler stöds ännu inte.'
                    : undefined
                }
                className={running ? 'running-button' : ''}
                onClick={() => useStudio.setState({ running: !running })}
              >
                {running ? <Pause size={15} /> : <Play size={15} />}
                <span>{running ? 'Pausa' : 'Simulera'}</span>
              </button>
              <button className="primary" onClick={manualSave}>
                <Save size={15} />
                Spara
              </button>
              <button
                className="icon-button"
                aria-label="Exportera kretsbackup"
                onClick={() =>
                  downloadJson(circuit.name, encodeBackup('circuit', JSON.parse(persistedCircuit)))
                }
              >
                <Download size={16} />
              </button>
            </div>
          </div>
          <ExampleGuide key={circuit.id} circuit={circuit} />
          <div className="workspace">
            {left && <Library />}
            <CircuitCanvas />
            {right && <Inspector />}
          </div>
          <div className="simulation-strip">
            <span className={'simulation-state ' + (running ? 'active' : '')}>
              {circuit.example?.mode === 'reference'
                ? 'Kopplingsreferens · simulering avstängd'
                : running
                  ? '● Kör'
                  : 'Ⅱ Pausad'}{' '}
              <small>{simulation.time.toFixed(2)} s</small>
            </span>
            <span>{simulation.transfers.toLocaleString('sv-SE')} flyttade items</span>
            <span className="muted">Fast sol / vind · batterier alltid laddade</span>
            {simulation.warnings.length > 0 && (
              <span className="warning-text">
                <AlertCircle size={13} />
                {simulation.warnings[0]}
              </span>
            )}
          </div>
        </main>
      )}
      {view === 'live' && <LivePage />}
      {view === 'examples' && (
        <ExampleLibrary
          onOpen={async (id) => {
            try {
              const previous = JSON.parse(persistedCircuit) as Circuit;
              await saveRecord({
                id: previous.id,
                name: previous.name,
                kind: 'circuit',
                updatedAt: Date.now(),
                payload: previous,
              });
              const copy = openExample(id);
              useStudio.getState().replace(copy);
              if (copy.lesson)
                useStudio.setState({
                  lessonFocus: { areaId: copy.lesson.areas[0].id, requestId: crypto.randomUUID() },
                });
              setView('circuit');
              notify(
                'Öppnade en egen kopia av ' +
                  copy.example!.name +
                  '. Ditt tidigare bygge finns kvar i Sparat.',
              );
              await refresh();
            } catch (e) {
              notify('Kunde inte öppna exemplet: ' + (e as Error).message);
            }
          }}
        />
      )}
      {view === 'filters' && <main className="scroll-page">{filterView}</main>}
      {view === 'saved' && (
        <main className="scroll-page">
          <div className="page">
            <header className="page-heading">
              <div>
                <div className="eyebrow">DINA BYGGEN, PÅ DIN ENHET</div>
                <h1>Sparat</h1>
                <p>Öppna och vidareutveckla dina kretsar och conveyor-filter.</p>
              </div>
              <button onClick={() => fileInput.current?.click()}>
                <Upload size={15} />
                Importera backup
              </button>
            </header>
            <div className="saved-toolbar">
              <div className="tabs">
                {[
                  ['all', 'Alla'],
                  ['circuit', 'Kretsar'],
                  ['filter', 'Filter'],
                ].map(([id, name]) => (
                  <button
                    key={id}
                    className={recordKind === id ? 'selected' : ''}
                    onClick={() => setRecordKind(id)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="searchbox">
                <Search size={16} />
                <input
                  aria-label="Sök sparade byggen"
                  placeholder="Sök i biblioteket…"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="saved-grid">
              {records
                .filter(
                  (r) =>
                    (recordKind === 'all' || r.kind === recordKind) &&
                    r.name.toLowerCase().includes(recordSearch.toLowerCase()),
                )
                .map((r) => (
                  <article className="saved-card" key={r.id}>
                    <div className="saved-card-kind">
                      {r.kind === 'circuit' ? <Workflow size={18} /> : <ListFilter size={18} />}
                      <span>{r.kind === 'circuit' ? 'KRETS' : 'CONVEYOR-FILTER'}</span>
                      <div className="saved-card-actions">
                        <button
                          className="subtle icon-button"
                          aria-label={'Byt namn på ' + r.name}
                          onClick={() => setDialog({ id: r.id, value: r.name })}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="subtle icon-button"
                          aria-label={'Duplicera ' + r.name}
                          onClick={() => duplicate(r)}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          className="subtle icon-button danger-text"
                          aria-label={'Radera ' + r.name}
                          onClick={() => deleteRecord(r)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <h2>{r.name || 'Utan namn'}</h2>
                    <p>
                      {r.kind === 'circuit'
                        ? (r.payload as Circuit).nodes.length +
                          ' komponenter · ' +
                          (r.payload as Circuit).edges.length +
                          ' kablar'
                        : (r.payload as ConveyorFilter).rules.length + ' filterregler'}
                    </p>
                    <time>{new Date(r.updatedAt).toLocaleString('sv-SE')}</time>
                    <div className="saved-card-bottom">
                      <button onClick={() => openRecord(r)}>
                        Öppna och redigera
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="subtle icon-button"
                        aria-label={'Exportera ' + r.name}
                        onClick={() => downloadJson(r.name, encodeBackup(r.kind, r.payload))}
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </article>
                ))}
            </div>
            {!records.length && (
              <div className="empty">
                <FolderOpen size={34} />
                <h2>Ditt bibliotek börjar här</h2>
                <p>
                  Sparade kretsar och filter visas här. Du kan också importera en ElRusty-backup.
                </p>
              </div>
            )}
            <p className="library-storage-note">
              Sparas i den här webbläsaren. Exportera en backup innan du rensar webbplatsdata eller
              byter enhet.
            </p>
          </div>
        </main>
      )}
      <footer className="app-status">
        <span role="status" aria-live="polite">
          {view === 'live'
            ? 'Live-tjänsten behöver köras även när webbläsaren är stängd.'
            : message}
        </span>
        <span className="version-label">ElRusty 0.6.3 · lokalt</span>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          try {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5_000_000) throw new Error('Filen är för stor.');
            const r = decodeBackup(await file.text());
            await saveRecord(r);
            await refresh();
            notify(r.migrationNotice || 'Backup importerad som en ny kopia.');
          } catch (err) {
            notify('Importen avbröts: ' + (err as Error).message);
          } finally {
            e.target.value = '';
          }
        }}
      />
      {dialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Byt namn"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = records.find((r) => r.id === dialog.id);
                if (!r) return;
                const name = dialog.value.trim();
                if (!name) return;
                const payload = { ...r.payload, name };
                await saveRecord({ ...r, name, payload, updatedAt: Date.now() });
                if (r.id === circuit.id) useStudio.getState().rename(name);
                if (r.id === filterId) setFilter({ ...filter, name });
                await refresh();
                setDialog(null);
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <h2>Byt namn</h2>
            <input
              autoFocus
              aria-label="Nytt namn"
              maxLength={200}
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            />
            <div className="page-actions">
              <button type="button" onClick={() => setDialog(null)}>
                Avbryt
              </button>
              <button type="submit" className="primary">
                Spara namn
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
