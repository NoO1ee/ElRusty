import { useState } from 'react';
import type { Circuit, ComponentNode } from '../model';
import { useStudio } from '../store';
import { byDefinition } from '../data/catalog';
import { byItem } from '../data/items';
import { logicLessons } from '../data/lessons';

export function LogicLessonGuide({ circuit }: { circuit: Circuit }) {
  const [open, setOpen] = useState(true);
  const inputs = useStudio((s) => s.testInputs),
    simulation = useStudio((s) => s.simulation);
  const lesson = circuit.lesson!,
    definition = logicLessons.find((l) => l.component === lesson.component)!;
  const selected = Math.max(
    0,
    lesson.areas.findIndex((a) => a.id === lesson.activeAreaId),
  );
  const area = lesson.areas[selected];
  const setSelected = (index: number) =>
    useStudio.setState((s) => ({
      circuit: {
        ...s.circuit,
        lesson: { ...s.circuit.lesson!, activeAreaId: lesson.areas[index].id },
      },
    }));
  const output = simulation.nodeStates[area.outputNodeId];
  const focus = circuit.nodes.find((n) => n.id === area.focusNodeId);
  return (
    <section className="example-guide logic-lesson-guide" aria-label="Guide för exempelbygge">
      <div className="example-guide-heading">
        <strong>{definition.title} · tre nivåer i samma bygge</strong>
        <button
          className="subtle"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            useStudio.setState({
              lessonFocus: { areaId: area.id, requestId: crypto.randomUUID() },
            });
          }}
        >
          {open ? 'Dölj guide' : 'Visa guide'}
        </button>
      </div>
      <>
        <div className="lesson-levels" aria-label="Välj svårighetsnivå">
          {lesson.areas.map((a, i) => (
            <button
              key={a.id}
              aria-pressed={selected === i}
              onClick={() => {
                setSelected(i);
                useStudio.setState({
                  lessonFocus: { areaId: a.id, requestId: crypto.randomUUID() },
                });
              }}
            >
              {a.title}
            </button>
          ))}
        </div>
        {open && (
          <div className="lesson-guide-columns">
            <div className="lesson-explanation">
              <h3>Vad gör den?</h3>
              <p>{definition.explanation}</p>
              <h3>Varför använda den?</h3>
              <p>{definition.why}</p>
              <p className="lesson-exercise">
                <strong>{area.title}:</strong> {area.description}
                <br />
                {area.exercise}
              </p>
              <div className="lesson-controls" aria-label="Prova signalerna">
                {area.controls.map((c) => {
                  const node = circuit.nodes.find((n) => n.id === c.nodeId);
                  const value = inputs[c.nodeId] ?? node?.data.settings.enabled ?? false;
                  return (
                    <label className={'lesson-toggle ' + (value ? 'on' : '')} key={c.nodeId}>
                      <input
                        type="checkbox"
                        aria-label={c.label}
                        disabled={!node}
                        checked={value}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          useStudio.setState((s) => ({
                            testInputs: { ...s.testInputs, [c.nodeId]: checked },
                          }));
                        }}
                      />
                      <span>{c.label}</span>
                      <b>{value ? '1' : '0'}</b>
                    </label>
                  );
                })}
              </div>
              <output
                className={'lesson-result ' + (output?.active ? 'on' : '')}
                aria-label="Resultat för nivån"
              >
                {output
                  ? output.active
                    ? 'Lampan lyser'
                    : 'Lampan är släckt'
                  : 'Resultatlampan saknas'}
              </output>
              <small>
                Testsignaler ändrar inte startinställningarna. Minnet behålls när du släpper
                signalerna.
              </small>
            </div>
            <div className="lesson-visual">
              <LogicVisual circuit={circuit} node={focus} />
              <div className="lesson-table-row">
                <table aria-label={'Sanningstabell för ' + definition.title}>
                  <caption>
                    {lesson.component === 'memory'
                      ? 'Minnesregler'
                      : 'Sanningstabell · 1 = ström finns'}
                  </caption>
                  <thead>
                    <tr>
                      <th>
                        {lesson.component === 'blocker'
                          ? 'Power In'
                          : lesson.component === 'memory'
                            ? 'Signal'
                            : 'A'}
                      </th>
                      <th>
                        {lesson.component === 'blocker'
                          ? 'Block'
                          : lesson.component === 'memory'
                            ? 'Händelse'
                            : 'B'}
                      </th>
                      <th>{lesson.component === 'memory' ? 'Minne' : 'Ut'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definition.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.a}</td>
                        <td>{r.b}</td>
                        <td>{r.out}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <strong>{definition.formula}</strong>
                  <p>
                    {lesson.component === 'memory'
                      ? 'Prova Set och Reset var för sig. Toggle växlar på stigande kant. Samtidiga styrsignaler och spelprioriteter ingår inte i lektionen.'
                      : 'Signalbilden visar komponenten markerad med ' +
                        definition.title +
                        ' i vald nivå. Sammansatta villkor kan ändra dess ingångar.'}
                  </p>
                  <a
                    className="text-link"
                    href={definition.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Komponentkälla ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    </section>
  );
}

function LogicVisual({ circuit, node }: { circuit: Circuit; node?: ComponentNode }) {
  const simulation = useStudio((s) => s.simulation),
    component = circuit.lesson!.component,
    d = byDefinition[component];
  const ports = d.ports.filter((p) => p.direction === 'in'),
    outs = d.ports.filter((p) => p.direction === 'out');
  const input = (port: string) => {
    const edge = circuit.edges.find((e) => e.target === node?.id && e.targetHandle === port);
    return edge ? simulation.outputs[edge.source + '|' + edge.sourceHandle] || 0 : 0;
  };
  const signal = (p: (typeof d.ports)[number]) =>
    p.direction === 'in' ? input(p.id) : simulation.outputs[node?.id + '|' + p.id] || 0;
  const color = (v: number) => (v > 0 ? '#83e2b6' : '#526378');
  const y = (i: number, n: number) => (n === 1 ? 90 : 25 + (i * 130) / (n - 1));
  return (
    <svg
      className="logic-visual"
      viewBox="0 0 540 185"
      role="img"
      aria-label={'Visuell signalbild för ' + d.name}
    >
      {ports.map((p, i) => {
        const v = signal(p),
          py = y(i, ports.length);
        return (
          <g key={p.id}>
            <text x="5" y={py - 7} fill="#c0cee0" fontSize="11">
              {p.name}
            </text>
            <text x="113" y={py - 7} fill={color(v)} fontSize="11">
              {v} rW
            </text>
            <path
              d={`M 5 ${py + 5} H ${163 + i * 9} V ${ports.length === 1 ? 90 : 58 + (i * 60) / (ports.length - 1)} H 205`}
              fill="none"
              stroke={color(v)}
              strokeWidth="3"
            />
            <circle
              cx="205"
              cy={ports.length === 1 ? 90 : 58 + (i * 60) / (ports.length - 1)}
              r="4"
              fill={color(v)}
            />
          </g>
        );
      })}
      <rect x="205" y="43" width="133" height="96" rx="13" fill="#1b293f" stroke="#7087a5" />
      <image href={byItem[d.shortname]?.image} x="249" y="49" width="45" height="45" />
      <text x="271" y="111" textAnchor="middle" fill="#f0f5fc" fontSize="13">
        {d.name}
      </text>
      {component === 'memory' && (
        <text x="271" y="130" textAnchor="middle" fill="#a6d9c0" fontSize="11">
          Minne: {simulation.memory[node?.id || '']?.set ? '1' : '0'}
        </text>
      )}
      {outs.map((p, i) => {
        const v = signal(p),
          py = y(i, outs.length);
        return (
          <g key={p.id}>
            <path
              d={`M 338 ${outs.length === 1 ? 90 : 65 + (i * 50) / (outs.length - 1)} H ${360 + i * 9} V ${py + 5} H 534`}
              stroke={color(v)}
              strokeWidth="3"
              fill="none"
            />
            <circle cx="534" cy={py + 5} r="4" fill={color(v)} />
            <text x="371" y={py - 7} fontSize="11" fill="#c0cee0">
              {p.name}
            </text>
            <text x="488" y={py - 7} fill={color(v)} fontSize="11">
              {v} rW
            </text>
          </g>
        );
      })}
      {!node && (
        <text x="270" y="179" textAnchor="middle" fill="#f4acac" fontSize="11">
          Komponenten har tagits bort ur kopian.
        </text>
      )}
    </svg>
  );
}
