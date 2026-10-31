import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  Controls,
  useReactFlow,
  useStoreApi,
  useKeyPress,
  ViewportPortal,
  useNodesInitialized,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type XYPosition,
} from '@xyflow/react';
import { useStudio } from '../store';
import { byDefinition, NODE_WIDTH, nodeHeight, portY } from '../data/catalog';
import { validateConnection } from '../graph';
import type { ComponentNode, WireEdge } from '../model';
import { routeWire, routeConnections, pathFromPoints } from '../routing';
import { powerStatus } from '../simulation/power-status';
import { ItemImage } from './ItemImage';

const WireRoutesContext = createContext<ReturnType<typeof routeConnections> | null>(null);

const ComponentCard = memo(function ComponentCard({
  id,
  data,
  selected,
}: NodeProps<ComponentNode>) {
  const def = byDefinition[data.definition];
  const runtime = useStudio((s) => s.simulation.nodeStates[id]),
    outputs = useStudio((s) => s.simulation.outputs);
  const reference = useStudio((s) => s.circuit.example?.mode === 'reference');
  const powerIssue = runtime && !reference ? powerStatus(def, runtime.input) : null;
  return (
    <article
      className={
        'component-card ' +
        (selected ? 'is-selected' : '') +
        ' ' +
        (runtime?.active ? 'is-powered' : '') +
        (powerIssue ? ' is-power-warning' : '')
      }
      data-power-status={powerIssue ?? 'ok'}
      style={{ width: NODE_WIDTH, height: nodeHeight(def) }}
      aria-label={def.name}
    >
      <header className="component-header">
        <ItemImage item={def.shortname} />
        <div>
          <strong>{data.label || def.name}</strong>
          <span>
            {data.label ? def.name : def.category} {def.watts > 0 ? '· ' + def.watts + ' rW' : ''}
          </span>
        </div>
        <i
          className={'activity-dot ' + (runtime?.active ? 'on' : '')}
          title={powerIssue ? runtime?.message : runtime?.active ? 'Aktiv' : 'Avstängd / väntar'}
        />
      </header>
      {def.ports.map((p, i) => {
        const top = portY(p, i, def.ports),
          value = p.direction === 'out' ? outputs[id + '|' + p.id] : runtime?.input;
        return (
          <div key={p.id}>
            <Handle
              type={p.direction === 'in' ? 'target' : 'source'}
              position={p.direction === 'in' ? Position.Left : Position.Right}
              id={p.id}
              style={{ top }}
              className={'port-handle ' + p.kind}
              aria-label={def.name + ' ' + p.name}
            />
            <span style={{ top: top - 8 }} className={'port-label ' + p.direction}>
              {p.name}
              {p.kind === 'power' && p.direction === 'out' && value !== undefined && (
                <em>{value}</em>
              )}
            </span>
          </div>
        );
      })}
      <footer className="component-footer">
        {runtime?.message ||
          (['storage', 'furnace', 'crafter'].includes(def.behavior)
            ? (runtime?.inventory || data.settings.inventory).reduce((a, s) => a + s.amount, 0) +
              ' items'
            : def.verification === 'modelled'
              ? 'Utökad modell'
              : '')}
      </footer>
    </article>
  );
});

function Wire({
  id,
  source,
  sourceHandleId,
  target,
  targetHandleId,
  targetX,
  targetY,
  sourceX,
  sourceY,
  data,
  selected,
}: EdgeProps<WireEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useStudio((s) => s.circuit.nodes),
    patchEdge = useStudio((s) => s.patchEdge),
    output = useStudio((s) => s.simulation.outputs[source + '|' + sourceHandleId]);
  const obstacles = nodes.map((n) => ({
    ...n.position,
    width: NODE_WIDTH,
    height: nodeHeight(byDefinition[n.data.definition]),
  }));
  const paths = useContext(WireRoutesContext);
  const planned = paths?.get(id);
  const matches =
    planned &&
    Math.abs(planned.points[0].x - sourceX) < 0.01 &&
    Math.abs(planned.points[0].y - sourceY) < 0.01 &&
    Math.abs(planned.points.at(-1)!.x - targetX) < 0.01 &&
    Math.abs(planned.points.at(-1)!.y - targetY) < 0.01;
  const routed = matches
    ? planned
    : routeWire(
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
        obstacles,
        data?.waypoints || [],
        paths ? [...paths].filter(([key]) => key !== id).map(([, value]) => value.points) : [],
      );
  const path = pathFromPoints(routed.points);
  const handles = data?.waypoints.length ? data.waypoints : routed.points.slice(1, -1);
  const mid = routed.points[Math.floor(routed.points.length / 2)];
  const from = nodes.find((n) => n.id === source),
    to = nodes.find((n) => n.id === target);
  const sourceName = from?.data.label || (from ? byDefinition[from.data.definition].name : 'Källa');
  const targetName = to?.data.label || (to ? byDefinition[to.data.definition].name : 'Mål');
  const referenceOnly = useStudio((s) => s.circuit.example?.mode === 'reference');
  const endpoints =
    sourceName +
    ' · ' +
    sourceHandleId?.replace('out:', '') +
    ' → ' +
    targetName +
    ' · ' +
    targetHandleId?.replace('in:', '');
  return (
    <>
      <path
        d={path}
        className="wire-crossing-gap"
        fill="none"
        stroke="#0d1724"
        strokeWidth={selected ? 8 : 6}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={22}
        style={{
          stroke: routed.conflict ? '#f6bd64' : data?.color || '#ff4d59',
          strokeWidth: selected ? 3.5 : 2.5,
          filter: selected ? 'drop-shadow(0 0 3px ' + (data?.color || '#ff4d59') + ')' : undefined,
          strokeDasharray:
            data?.kind === 'industrial' ? '7 4' : routed.conflict ? '4 4' : undefined,
          opacity: output === 0 && data?.kind === 'power' ? 0.65 : 1,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          {handles.map((p, i) => (
            <button
              key={i}
              aria-label={'Flytta kabelböj ' + (i + 1)}
              className="wire-bend nodrag nopan"
              style={{ transform: `translate(-50%,-50%) translate(${p.x}px,${p.y}px)` }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (data?.waypoints.length)
                  patchEdge(id, { waypoints: data.waypoints.filter((_, index) => index !== i) });
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                useStudio.getState().checkpoint();
                const initial = data?.waypoints.length
                  ? [...data.waypoints]
                  : handles.map((p) => ({ ...p }));
                e.currentTarget.setPointerCapture(e.pointerId);
                const move = (ev: PointerEvent) => {
                  const next = [...initial];
                  next[i] = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
                  patchEdge(id, { waypoints: next }, false);
                };
                const button = e.currentTarget;
                button.addEventListener('pointermove', move);
                button.addEventListener(
                  'pointerup',
                  () => button.removeEventListener('pointermove', move),
                  { once: true },
                );
              }}
            />
          ))}
          {mid && (
            <div
              className={'wire-value wire-endpoints ' + (routed.conflict ? 'conflict' : '')}
              aria-label="Markerad kabel"
              style={{ transform: `translate(-50%,-100%) translate(${mid.x}px,${mid.y}px)` }}
            >
              <strong>{endpoints}</strong>
              {routed.conflict
                ? 'Kabelväg i konflikt'
                : referenceOnly
                  ? 'Kopplingsreferens'
                  : data?.kind === 'power'
                    ? (output ?? 0) + ' rW'
                    : 'Industrial'}
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { component: ComponentCard },
  edgeTypes = { wire: Wire };

function CanvasInner() {
  const flowStore = useStoreApi();
  const handActive = useKeyPress(['Control', 'Space'], { actInsideInputWithModifier: false });
  const circuit = useStudio((s) => s.circuit),
    setGraph = useStudio((s) => s.setGraph),
    notify = useStudio((s) => s.notify);
  const initialized = useNodesInitialized();
  const lessonFocus = useStudio((s) => s.lessonFocus);
  const { screenToFlowPosition, setViewport, fitBounds, getInternalNode } = useReactFlow<
    ComponentNode,
    WireEdge
  >();
  const obstacles = circuit.nodes.map((n) => ({
    ...n.position,
    width: NODE_WIDTH,
    height: nodeHeight(byDefinition[n.data.definition]),
  }));
  const connections = circuit.edges.flatMap((e) => {
    const a = circuit.nodes.find((n) => n.id === e.source),
      b = circuit.nodes.find((n) => n.id === e.target);
    if (!a || !b) return [];
    const locate = (n: ComponentNode, handle: string | undefined | null) => {
      const def = byDefinition[n.data.definition],
        p = def.ports.find((p) => p.id === handle);
      if (!p) return null;
      const bounds = getInternalNode(n.id)?.internals.handleBounds?.[
        p.direction === 'out' ? 'source' : 'target'
      ]?.find((h) => h.id === handle);
      return bounds
        ? {
            x: n.position.x + bounds.x + bounds.width / 2,
            y: n.position.y + bounds.y + bounds.height / 2,
          }
        : {
            x: n.position.x + (p.direction === 'out' ? NODE_WIDTH : 0),
            y: n.position.y + portY(p, def.ports.indexOf(p), def.ports),
          };
    };
    const start = locate(a, e.sourceHandle),
      end = locate(b, e.targetHandle);
    return start && end ? [{ id: e.id, start, end, waypoints: e.data?.waypoints || [] }] : [];
  });
  const routingKey = JSON.stringify({ connections, obstacles, initialized });
  const routes = useMemo(() => routeConnections(connections, obstacles), [routingKey]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; point: XYPosition } | null>(
      null,
    ),
    [guides, setGuides] = useState<{ x?: number; y?: number }>({}),
    [help, setHelp] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const currentId = useRef(circuit.id);
  useEffect(() => {
    if (currentId.current !== circuit.id) {
      currentId.current = circuit.id;
      setTimeout(() => setViewport(circuit.viewport), 30);
    }
  }, [circuit.id, setViewport]);
  useEffect(() => {
    const area = circuit.lesson?.areas.find((a) => a.id === lessonFocus?.areaId);
    if (!initialized) return;
    if (!area && !circuit.lesson) return;
    const timer = setTimeout(() => {
      if (area) void fitBounds(area, { padding: 0.08, duration: 200 });
      else void setViewport(circuit.viewport);
    }, 40);
    return () => clearTimeout(timer);
  }, [initialized, lessonFocus, circuit.id, fitBounds]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null);
        flowStore.getState().cancelConnection();
      }
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? useStudio.getState().redo() : useStudio.getState().undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        useStudio.getState().deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const onConnect = useCallback((c: Connection) => {
    if (c.sourceHandle && c.targetHandle)
      useStudio.getState().connect(c.source, c.target, c.sourceHandle, c.targetHandle);
  }, []);
  return (
    <div
      className={'canvas-shell' + (handActive ? ' hand-mode' : '')}
      ref={container}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const definition = e.dataTransfer.getData('application/elrusty');
        if (!byDefinition[definition]) return;
        const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        useStudio.getState().add(definition, p.x, p.y);
      }}
    >
      <WireRoutesContext.Provider value={routes}>
        <ReactFlow<ComponentNode, WireEdge>
          nodes={circuit.nodes}
          edges={circuit.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={(changes) => {
            const s = useStudio.getState();
            setGraph(applyNodeChanges(changes, s.circuit.nodes));
          }}
          onEdgesChange={(changes) => {
            const s = useStudio.getState();
            setGraph(s.circuit.nodes, applyEdgeChanges(changes, s.circuit.edges));
          }}
          onConnect={onConnect}
          connectOnClick
          connectionMode={ConnectionMode.Strict}
          isValidConnection={(c) => {
            if (!c.sourceHandle || !c.targetHandle) return false;
            return !validateConnection(
              useStudio.getState().circuit,
              c.source,
              c.target,
              c.sourceHandle,
              c.targetHandle,
            );
          }}
          onConnectEnd={(_, state) => {
            if (state.fromHandle && !state.isValid && state.toHandle)
              notify(
                'Ogiltig anslutning: kontrollera porttyp, riktning och om porten är upptagen.',
              );
          }}
          onNodeDragStart={() => {
            useStudio.getState().checkpoint();
            setMenu(null);
          }}
          onNodeDrag={(event, node) => {
            if (!('shiftKey' in event) || !event.shiftKey) {
              setGuides({});
              return;
            }
            const others = useStudio.getState().circuit.nodes.filter((n) => n.id !== node.id);
            if (!others.length) return;
            const closest = others.reduce((a, b) =>
              Math.hypot(a.position.x - node.position.x, a.position.y - node.position.y) <
              Math.hypot(b.position.x - node.position.x, b.position.y - node.position.y)
                ? a
                : b,
            );
            const h = nodeHeight(byDefinition[node.data.definition]),
              oh = nodeHeight(byDefinition[closest.data.definition]);
            const candidatesX = [
                closest.position.x,
                closest.position.x + NODE_WIDTH / 2 - NODE_WIDTH / 2,
                closest.position.x + NODE_WIDTH - NODE_WIDTH,
              ],
              candidatesY = [
                closest.position.y,
                closest.position.y + oh / 2 - h / 2,
                closest.position.y + oh - h,
              ];
            const x = candidatesX.sort(
                (a, b) => Math.abs(a - node.position.x) - Math.abs(b - node.position.x),
              )[0],
              y = candidatesY.sort(
                (a, b) => Math.abs(a - node.position.y) - Math.abs(b - node.position.y),
              )[0];
            const snapX = Math.abs(x - node.position.x) < 18,
              snapY = Math.abs(y - node.position.y) < 18;
            const newPosition = { x: snapX ? x : node.position.x, y: snapY ? y : node.position.y };
            const s = useStudio.getState();
            setGraph(
              s.circuit.nodes.map((n) => (n.id === node.id ? { ...n, position: newPosition } : n)),
            );
            setGuides({ x: snapX ? x : undefined, y: snapY ? y : undefined });
          }}
          onNodeDragStop={() => setGuides({})}
          onEdgeContextMenu={(e, edge) => {
            e.preventDefault();
            setMenu({
              id: edge.id,
              x: Math.min(e.clientX, window.innerWidth - 240),
              y: Math.min(e.clientY, window.innerHeight - 340),
              point: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
            });
            setGraph(
              circuit.nodes,
              circuit.edges.map((x) => ({ ...x, selected: x.id === edge.id })),
            );
          }}
          onPaneClick={() => setMenu(null)}
          onMoveEnd={(_, viewport) =>
            useStudio.setState((s) => ({ circuit: { ...s.circuit, viewport } }))
          }
          defaultViewport={circuit.viewport}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 0.85 }}
          minZoom={0.15}
          maxZoom={2.5}
          zoomOnScroll={false}
          zoomOnPinch
          zoomActivationKeyCode="Control"
          panActivationKeyCode={['Space', 'Control']}
          panOnDrag={[1]}
          selectionOnDrag={!handActive}
          nodesDraggable={!handActive}
          nodesConnectable={!handActive}
          elementsSelectable={!handActive}
          selectionKeyCode={null}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: false }}
        >
          {circuit.lesson && (
            <ViewportPortal>
              {circuit.lesson.areas.map((area) => (
                <div
                  className="lesson-area"
                  key={area.id}
                  style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
                >
                  <strong>{area.title}</strong>
                  <p>{area.description}</p>
                </div>
              ))}
            </ViewportPortal>
          )}
          <Controls showInteractive={false} />
          {Object.entries(guides).map(
            ([axis, value]) =>
              value !== undefined && <Guide key={axis} axis={axis} value={value} />,
          )}
        </ReactFlow>
      </WireRoutesContext.Provider>
      <div className="canvas-heading">
        <span className="eyebrow">FRI ARBETSYTA</span>
        <button
          className="subtle icon-button"
          aria-label="Visa kortkommandon"
          onClick={() => setHelp(!help)}
        >
          ?
        </button>
      </div>
      {help && (
        <div className="canvas-help">
          <strong>Kortkommandon</strong>
          <p>
            Ctrl + scroll · zoom vid muspekaren
            <br />
            Ctrl + vänsterdrag / mellanslag + dra / mittenknapp · panorera
            <br />
            Shift + dra · linjera kort
            <br />
            Delete · ta bort markering
            <br />
            Ctrl + Z / Ctrl + Shift + Z · ångra / gör om
            <br />
            Esc · avbryt anslutning
            <br />
            Högerklick på kabel · färg / brytpunkter
            <br />
            Dubbelklick på böj · ta bort brytpunkt
          </p>
        </div>
      )}
      {menu && (
        <div
          className="context-menu"
          role="dialog"
          aria-label="Kabelinställningar"
          style={{ left: menu.x, top: menu.y }}
        >
          <header>
            <strong>Vald kabel</strong>
            <button className="subtle" onClick={() => setMenu(null)} aria-label="Stäng kabelmeny">
              ×
            </button>
          </header>
          <p>Färg på endast denna kabel</p>
          <div className="swatches">
            {['#ff4d59', '#65b4ff', '#f2bc5c', '#73d9b0', '#bd9aff', '#f0f4fa'].map((color) => (
              <button
                key={color}
                style={{ background: color }}
                aria-label={'Kabelfärg ' + color}
                onClick={() => {
                  useStudio.getState().patchEdge(menu.id, { color });
                  setMenu(null);
                }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              const edge = circuit.edges.find((e) => e.id === menu.id);
              if (edge)
                useStudio
                  .getState()
                  .patchEdge(menu.id, { waypoints: [...edge.data!.waypoints, menu.point] });
              setMenu(null);
            }}
          >
            ＋ Lägg till brytpunkt här
          </button>
          <button
            onClick={() => {
              useStudio.getState().patchEdge(menu.id, { waypoints: [] });
              setMenu(null);
            }}
          >
            Återställ automatisk väg
          </button>
          <button
            className="danger-text"
            onClick={() => {
              useStudio.getState().checkpoint();
              setGraph(
                circuit.nodes,
                circuit.edges.filter((e) => e.id !== menu.id),
              );
              setMenu(null);
            }}
          >
            Ta bort kabel
          </button>
        </div>
      )}
    </div>
  );
}
function Guide({ axis, value }: { axis: string; value: number }) {
  const { flowToScreenPosition } = useReactFlow();
  const point = flowToScreenPosition({ x: axis === 'x' ? value : 0, y: axis === 'y' ? value : 0 });
  return (
    <div
      className={'alignment-guide ' + axis}
      style={axis === 'x' ? { left: point.x } : { top: point.y }}
    />
  );
}
export function CircuitCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
