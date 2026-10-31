import { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, CopyPlus, Search, ShieldCheck, Wrench } from 'lucide-react';
import type { Circuit } from '../model';
import { byDefinition, nodeHeight, NODE_WIDTH } from '../data/catalog';
import { byItem } from '../data/items';
import { exampleBuilds, type ExampleBuild } from '../data/examples';

function Preview({ circuit, title }: { circuit?: Circuit; title: string }) {
  if (!circuit)
    return (
      <div className="example-preview missing-preview">
        <BookOpen size={30} />
        <span>Schema saknas i källan</span>
      </div>
    );
  const width = Math.max(...circuit.nodes.map((n) => n.position.x + NODE_WIDTH)) + 40;
  const height =
    Math.max(
      ...circuit.nodes.map((n) => n.position.y + nodeHeight(byDefinition[n.data.definition])),
    ) + 40;
  return (
    <svg
      className="example-preview"
      role="img"
      aria-label={'Översikt av ' + title}
      viewBox={`-20 -20 ${width + 20} ${height + 20}`}
    >
      {circuit.edges.map((e) => {
        const a = circuit.nodes.find((n) => n.id === e.source)!,
          b = circuit.nodes.find((n) => n.id === e.target)!;
        const x = a.position.x + NODE_WIDTH,
          y = a.position.y + 95,
          tx = b.position.x,
          ty = b.position.y + 95,
          m = (x + tx) / 2;
        return (
          <path
            key={e.id}
            d={`M ${x} ${y} H ${m} V ${ty} H ${tx}`}
            stroke={e.data?.color}
            strokeWidth={4}
            opacity={0.7}
            fill="none"
          />
        );
      })}
      {circuit.nodes.map((n) => {
        const d = byDefinition[n.data.definition];
        return (
          <g key={n.id} transform={`translate(${n.position.x} ${n.position.y})`}>
            <rect
              width={NODE_WIDTH}
              height={nodeHeight(d)}
              rx={14}
              fill="#132135"
              stroke="#53677e"
              strokeWidth={3}
            />
            <image href={byItem[d.shortname]?.image} x={18} y={16} width={64} height={64} />
            <text x={16} y={118} fill="#d9e4f2" fontSize={17}>
              {d.name.length > 24 ? d.name.slice(0, 22) + '…' : d.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
export function ExampleLibrary({ onOpen }: { onOpen: (id: string) => void | Promise<void> }) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('Alla'),
    [origin, setOrigin] = useState('Alla'),
    [opening, setOpening] = useState(false);
  const previews = useMemo(
    () => Object.fromEntries(exampleBuilds.map((e) => [e.id, e.create?.()])),
    [],
  );
  const shown = exampleBuilds.filter(
    (e) =>
      (category === 'Alla' || e.category === category) &&
      (origin === 'Alla' || e.origin === origin) &&
      `${e.name} ${e.summary} ${e.category} ${e.author}`
        .toLocaleLowerCase('sv-SE')
        .includes(query.toLocaleLowerCase('sv-SE')),
  );
  return (
    <main className="scroll-page">
      <div className="page examples-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">STUDERA · ÖPPNA · BYGG VIDARE</div>
            <h1>Exempelbyggen</h1>
            <p>Handboken, delade Rustrician-kretsar och egna byggen att experimentera med.</p>
          </div>
          <a
            className="text-link"
            href="https://www.rustrician.io/handbook/"
            target="_blank"
            rel="noreferrer"
          >
            Rustrician-handboken <ArrowUpRight size={14} />
          </a>
        </header>
        <div className="example-intro">
          <ShieldCheck size={22} />
          <p>
            <strong>En egen kopia varje gång.</strong> Bibliotekets original påverkas inte av dina
            ändringar. Modelltestade exempel kan köras i ElRusty. Kopplingsreferenser har
            simuleringen avstängd när motorn inte stöder de regler bygget kräver.
          </p>
        </div>
        <div className="examples-toolbar">
          <div className="searchbox">
            <Search size={15} />
            <input
              aria-label="Sök exempelbyggen"
              placeholder="Sök Nih, reservkraft, logik…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label>
            Ursprung
            <select
              aria-label="Filtrera exempel efter ursprung"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              {['Alla', 'Handboken', 'Rustrician', 'ElRusty'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="tabs example-categories" aria-label="Exempelkategorier">
          {['Alla', 'Reservkraft', 'Fördelning', 'Logik', 'Industrial'].map((c) => (
            <button
              key={c}
              className={category === c ? 'selected' : ''}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="help-text">
          {shown.length} av {exampleBuilds.length} exempel · egna layouter · Rust-bilder
        </p>
        <div className="examples-grid">
          {shown.map((e) => (
            <ExampleCard
              key={e.id}
              example={e}
              circuit={previews[e.id]}
              opening={opening}
              onOpen={async () => {
                if (opening) return;
                setOpening(true);
                try {
                  await onOpen(e.id);
                } finally {
                  setOpening(false);
                }
              }}
            />
          ))}
        </div>
        {!shown.length && (
          <div className="empty">
            <Search size={28} />
            <h2>Inga exempel matchar</h2>
            <p>Prova ett annat sökord eller välj Alla.</p>
            <button
              onClick={() => {
                setQuery('');
                setCategory('Alla');
                setOrigin('Alla');
              }}
            >
              Rensa sökning och filter
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
function ExampleCard({
  example: e,
  circuit,
  onOpen,
  opening,
}: {
  example: ExampleBuild;
  circuit?: Circuit;
  onOpen: () => void;
  opening: boolean;
}) {
  return (
    <article className="example-card" data-testid={'example-' + e.id}>
      <div className="example-badges">
        <span>
          {e.category} · {e.difficulty}
        </span>
        <span className={'example-mode ' + e.mode}>
          {e.mode === 'model'
            ? 'Modelltestad'
            : e.mode === 'reference'
              ? 'Kopplingsreferens'
              : 'Schema saknas'}
        </span>
      </div>
      <Preview circuit={circuit} title={e.name} />
      <div className="example-body">
        <span className="eyebrow">{e.origin}</span>
        <h2>{e.name}</h2>
        <p>{e.summary}</p>
        <small>{e.author}</small>
        <p className="example-notice">{e.notice}</p>
        <div className="example-count">
          {circuit
            ? `${circuit.nodes.length} komponenter · ${circuit.edges.length} anslutningar`
            : 'Inget lokalt schema'}
        </div>
        <div className="example-card-actions">
          <button className="primary" disabled={!e.create || opening} onClick={onOpen}>
            <CopyPlus size={15} />
            {e.create ? 'Öppna egen kopia' : 'Schema saknas'}
          </button>
          {e.source && (
            <a className="text-link" href={e.source.url} target="_blank" rel="noreferrer">
              Källa <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
export function ExampleGuide({ circuit }: { circuit: Circuit }) {
  const [open, setOpen] = useState(true);
  const example = circuit.example;
  if (!example) return null;
  return (
    <section
      className={'example-guide ' + (example.mode === 'reference' ? 'reference' : '')}
      aria-label="Guide för exempelbygge"
    >
      <div className="example-guide-heading">
        <strong>
          <Wrench size={15} />
          {example.name} ·{' '}
          {example.mode === 'reference' ? 'Kopplingsreferens' : 'Modelltestad förlaga'}
        </strong>
        <button className="subtle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Dölj guide' : 'Visa guide'}
        </button>
      </div>
      {open && (
        <>
          <p>
            {example.notice}
            {example.mode === 'model'
              ? ' Testerna gäller förlagan; egna ändringar behöver kontrolleras.'
              : ''}
          </p>
          <ol>
            {example.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <small>{example.author}</small>
          {example.source && (
            <a className="text-link" href={example.source.url} target="_blank" rel="noreferrer">
              Öppna originalkällan <ArrowUpRight size={13} />
            </a>
          )}
        </>
      )}
    </section>
  );
}
