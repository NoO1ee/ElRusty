import type { Circuit, ComponentNode, ComponentSettings, WireEdge } from '../model';
import { blankCircuit } from '../model';
import { newNode } from './catalog';
import nexusData from './nexus.json';
import { logicLessons } from './lessons';

export interface ExampleBuild {
  id: string;
  name: string;
  category: 'Reservkraft' | 'Fördelning' | 'Logik' | 'Industrial';
  difficulty: 'Grund' | 'Medel' | 'Avancerad' | 'Alla nivåer';
  origin: 'Handboken' | 'Rustrician' | 'ElRusty';
  author: string;
  summary: string;
  mode: 'model' | 'reference' | 'unavailable';
  notice: string;
  steps: string[];
  source?: { title: string; url: string };
  create?: () => Circuit;
}
const handbook = (section: string) => ({
  title: 'The Rust Electrical Handbook · SwiftCoyote och communityn',
  url: 'https://www.rustrician.io/handbook/#' + encodeURIComponent(section),
});
const colors = {
  main: '#ff4d59',
  backup: '#65b4ff',
  signal: '#bd9aff',
  charge: '#efc46c',
  industrial: '#77d7b0',
};
function build() {
  const c = blankCircuit();
  function node(
    id: string,
    definition: string,
    label: string,
    x: number,
    y: number,
    settings: Partial<ComponentSettings> = {},
  ) {
    const n = newNode(definition, x, y);
    n.id = id;
    n.data.label = label;
    Object.assign(n.data.settings, settings);
    c.nodes.push(n);
    return n;
  }
  function wire(
    a: ComponentNode,
    b: ComponentNode,
    source: string,
    target: string,
    role: keyof typeof colors = 'main',
  ) {
    c.edges.push({
      id: 'wire-' + c.edges.length,
      type: 'wire',
      source: a.id,
      target: b.id,
      sourceHandle: 'out:' + source,
      targetHandle: 'in:' + target,
      data: {
        color: colors[role],
        kind: role === 'industrial' ? 'industrial' : 'power',
        waypoints: [],
      },
    });
  }
  return { c, node, wire };
}

function nih(checked: boolean) {
  const { c, node, wire } = build();
  const wind = node('source', 'wind', 'Huvudkälla', 0, 0);
  const main = node('main-reserve', 'branch', '1 · Basens effektbudget', 340, 0, { branch: 99 });
  const excess = node('overflow', 'branch', '2 · Närvarosignal', 340, 390, { branch: 1 });
  const memory = node('memory', 'memory', 'Välj laddning / direktmatning', 700, 0);
  const load = node('load', 'or', 'Ut till basen · 99 rW', 1430, 0);
  const charge = node('charge', 'or', 'Laddningsväg', 1060, 420);
  const battery = node('battery', 'battery-large', 'Reservbatteri', 1430, 420);
  const reserve = node('battery-reserve', 'branch', '3 · Reservens effektbudget', 1060, 0, {
    branch: 99,
  });
  wire(wind, main, 'Power Out', 'Power In');
  wire(main, memory, 'Branch Out', 'Power In');
  wire(main, excess, 'Power Out', 'Power In', 'charge');
  wire(excess, charge, 'Power Out', 'Input A', 'charge');
  wire(charge, battery, 'Power Out', 'Power In', 'charge');
  wire(battery, reserve, 'Power Output', 'Power In', 'backup');
  wire(reserve, load, 'Branch Out', 'Input B', 'backup');
  if (!checked) {
    wire(excess, memory, 'Branch Out', 'Set', 'signal');
    wire(reserve, memory, 'Power Out', 'Reset', 'signal');
    wire(memory, load, 'Output', 'Input A');
    wire(memory, charge, 'Inverted Output', 'Input B', 'charge');
  } else {
    const block = node('battery-check', 'blocker', 'Batterikontroll', 700, 440);
    const control = node('control', 'battery-small', 'Kontrollström', 340, 720);
    wire(excess, block, 'Branch Out', 'Block Passthrough', 'signal');
    wire(reserve, block, 'Power Out', 'Power In', 'signal');
    wire(block, memory, 'Power Out', 'Set', 'signal');
    wire(control, memory, 'Power Output', 'Reset', 'signal');
    wire(memory, charge, 'Output', 'Input B', 'charge');
    wire(memory, load, 'Inverted Output', 'Input A');
  }
  return c;
}
function nexus() {
  const { c, node, wire } = build();
  const nodes = Object.fromEntries(
    nexusData.nodes.map((n) => [
      n.id,
      node(n.id, n.definition, n.label, n.x, n.y, 'branch' in n ? { branch: n.branch } : {}),
    ]),
  );
  for (const e of nexusData.edges) {
    const signal =
      ['Set', 'Reset', 'Block Passthrough'].includes(e.targetPort) ||
      e.sourcePort === 'Fully Charged';
    wire(
      nodes[e.source],
      nodes[e.target],
      e.sourcePort,
      e.targetPort,
      signal
        ? 'signal'
        : ['42', '46', '72', '78', '85', '89', '110', '120'].includes(e.source)
          ? 'backup'
          : ['50', '56', '64', '97'].includes(e.source)
            ? 'charge'
            : 'main',
    );
  }
  return c;
}
function priority() {
  const { c, node, wire } = build();
  const source = node('source', 'wind', 'Ordinarie matning', 0, 0),
    battery = node('battery', 'battery-large', 'Reservmatning', 0, 310);
  const selector = node('selector', 'or', 'Välj högsta tillgängliga effekt', 350, 0),
    main = node('priority', 'branch', 'Reservera 40 rW till kritisk last', 700, 0, { branch: 40 });
  const critical = node('critical', 'splitter', 'Kritisk fördelning', 1060, 0),
    optional = node('optional', 'splitter', 'Extra förbrukare', 1060, 420);
  wire(source, selector, 'Power Out', 'Input A');
  wire(battery, selector, 'Power Output', 'Input B', 'backup');
  wire(selector, main, 'Power Out', 'Power In');
  wire(main, critical, 'Branch Out', 'Power In');
  wire(main, optional, 'Power Out', 'Power In');
  for (let i = 0; i < 3; i++) {
    const a = node('critical-' + i, 'turret', 'Kritisk last ' + (i + 1), 1430, i * 300);
    wire(critical, a, 'Power Out ' + (i + 1), 'Power In');
  }
  const extra = node('extra', 'light', 'Servicebelysning', 1060, 750);
  wire(optional, extra, 'Power Out 1', 'Power In');
  return c;
}
function latch() {
  const { c, node, wire } = build();
  const source = node('source', 'generator', 'Matning', 0, 0),
    branch = node('branch', 'branch', '20 rW till larm', 350, 0, { branch: 20 });
  const sensors = node('supply', 'branch', '2 rW till sensor', 350, 340, { branch: 2 }),
    sensor = node('sensor', 'laser', 'Manuell testhändelse', 700, 340);
  const reset = node('reset', 'switch', 'Återställ larm', 700, 670, { enabled: false }),
    memory = node('memory', 'memory', 'Lås larmet efter en händelse', 1060, 0),
    lamp = node('alarm', 'light', 'Larmindikering', 1430, 0);
  wire(source, branch, 'Power Out', 'Power In');
  wire(branch, memory, 'Branch Out', 'Power In');
  wire(branch, sensors, 'Power Out', 'Power In');
  wire(sensors, sensor, 'Branch Out', 'Power In', 'signal');
  wire(sensors, reset, 'Power Out', 'Power In', 'signal');
  wire(sensor, memory, 'Power Out', 'Set', 'signal');
  wire(reset, memory, 'Power Out', 'Reset', 'signal');
  wire(memory, lamp, 'Output', 'Power In');
  return c;
}
function timed() {
  const { c, node, wire } = build();
  const source = node('source', 'generator', 'Matning', 0, 0),
    reserve = node('branch', 'branch', '20 rW till lampan', 350, 0, { branch: 20 }),
    timer = node('timer', 'timer', 'Fem sekunders servicefönster', 1060, 0, { seconds: 5 }),
    trigger = node('trigger', 'switch', 'Starta med en stigande signal', 700, 350, {
      enabled: false,
    }),
    light = node('light', 'light', 'Tillfällig belysning', 1430, 0);
  wire(source, reserve, 'Power Out', 'Power In');
  wire(reserve, timer, 'Branch Out', 'Power In');
  wire(reserve, trigger, 'Power Out', 'Power In', 'signal');
  wire(trigger, timer, 'Power Out', 'Toggle On', 'signal');
  wire(timer, light, 'Power Out', 'Power In');
  return c;
}
function smelter() {
  const { c, node, wire } = build();
  const source = node('source', 'generator', 'Matning', 0, 0),
    b1 = node('input-power', 'branch', '2 rW till inmatning', 350, 0, { branch: 2 }),
    b2 = node('furnace-power', 'branch', '3 rW till ugnen', 700, 0, { branch: 3 });
  const input = node('input', 'conveyor', 'Mata endast Metal Ore', 350, 400),
    furnace = node('furnace', 'furnace', 'Smältning · 3 rW', 1060, 400),
    output = node('output', 'conveyor', 'Ta ut färdiga metaller', 1430, 400);
  const raw = node('raw', 'box', 'Startlager · 120 Metal Ore', 0, 400, {
      inventory: [{ item: 'metal.ore', amount: 120 }],
    }),
    done = node('done', 'box', 'Färdigt material', 1800, 400);
  input.data.settings.filter.rules = [
    { item: 'metal.ore', category: null, min: 0, max: 0, buffer: 0, blueprint: false },
  ];
  wire(source, b1, 'Power Out', 'Power In');
  wire(b1, input, 'Branch Out', 'Power In');
  wire(b1, b2, 'Power Out', 'Power In');
  wire(b2, furnace, 'Branch Out', 'Power In');
  wire(b2, output, 'Power Out', 'Power In');
  wire(raw, input, 'Industrial Out', 'Industrial Input', 'industrial');
  wire(input, furnace, 'Industrial Output', 'Industrial In', 'industrial');
  wire(furnace, output, 'Industrial Out', 'Industrial Input', 'industrial');
  wire(output, done, 'Industrial Output', 'Industrial In', 'industrial');
  return c;
}
function sectors() {
  const { c, node, wire } = build();
  for (let i = 0; i < 2; i++) {
    const y = i * 420,
      source = node('source-' + i, 'solar', 'Solpanel · sektor ' + (i + 1), 0, y),
      battery = node('battery-' + i, 'battery-small', 'Lokalt batteri · sektor ' + (i + 1), 350, y),
      toggle = node('switch-' + i, 'switch', 'Servicebrytare · sektor ' + (i + 1), 700, y),
      load = node('light-' + i, 'light', 'Belysning · sektor ' + (i + 1), 1060, y);
    wire(source, battery, 'Power Out', 'Power In', 'charge');
    wire(battery, toggle, 'Power Output', 'Power In', i ? 'backup' : 'main');
    wire(toggle, load, 'Power Out', 'Power In', i ? 'backup' : 'main');
  }
  return c;
}
export const exampleBuilds: ExampleBuild[] = [
  ...logicLessons.map(l => ({id:'learn-'+l.component,name:l.title+' · lär dig',category:'Logik' as const,difficulty:'Alla nivåer' as const,origin:'ElRusty' as const,author:'ElRusty · pedagogiska modellbyggen',summary:'Grund, mellan och avancerad i tre separata områden. '+l.why,mode:'model' as const,notice:'Testknapparna påverkar signalerna utan att återställa minnet. Bibliotekets modeller är inte spelverifierade.',steps:['Välj nivå och prova signalerna i guiden.','Jämför signalbilden med kablarna på arbetsytan.'],source:{title:'Facepunch · '+l.title,url:l.source},create:l.create})),
  {
    id: 'nih-core',
    name: 'Nih Core',
    category: 'Reservkraft',
    difficulty: 'Avancerad',
    origin: 'Handboken',
    author: 'Nih · handbokens community-variant',
    summary: 'Direktmatning med separat laddnings- och reservväg.',
    mode: 'reference',
    notice:
      'Kopplingsreferens. Memory Cell-prioritet, laddning och batteriförbrukning återges inte tillräckligt exakt av ElRustys motor.',
    steps: [
      'Följ huvudkällan till effektbudgeten på 99 rW.',
      'Jämför minnescellens två vägar till basen och laddningen.',
      'Den andra branchen är inställd på 1 rW; batteriets branch är 99 rW.',
      'Studera omkopplingen i originalkällan. Simulering är avstängd för denna referens.',
    ],
    source: handbook('Nih Core'),
    create: () => nih(false),
  },
  {
    id: 'bcn-core',
    name: 'BCN Core',
    category: 'Reservkraft',
    difficulty: 'Avancerad',
    origin: 'Handboken',
    author: 'SwiftCoyote',
    summary: 'Reservkraft med separat kontroll av batterivägen.',
    mode: 'reference',
    notice:
      'Kopplingsreferens. Batteriets hälsa och minnescellens prioritetsregler är inte spelverifierade i ElRusty.',
    steps: [
      'Jämför huvudväg och laddningsväg med Nih Core.',
      'Följ batteriets närvarosignal genom Blocker till Set.',
      'Det lilla batteriet ger separat kontrollström till Reset.',
      'Utgången märkt Ut till basen är anslutningspunkten för vidare distribution.',
    ],
    source: handbook('BCN Core'),
    create: () => nih(true),
  },
  {
    id: 'nexus',
    name: 'NEXUS Core',
    category: 'Reservkraft',
    difficulty: 'Avancerad',
    origin: 'Rustrician',
    author: 'Publikt delad Rustrician-krets · upphovsperson ej angiven i exporten',
    summary: 'Två huvudbatterier, laddningslogik och ett separat reservbatteri.',
    mode: 'reference',
    notice:
      '24 komponenter och 32 anslutningar från din länk. Alla portar och Branch-värden är bevarade; layouten är omritad. Simulering är avstängd eftersom batteri- och prioritetsregler saknas.',
    steps: [
      'Följ de två vindkällorna till huvudmatningen.',
      'Jämför minnescellen för huvudvägen med minnescellen för laddningsfördelningen.',
      'AND Switch läser Fully Charged från båda huvudbatterierna.',
      'Den separata reservdelen matar den sista OR Switch som försörjer Auto Turret.',
    ],
    source: { title: 'NEXUS Core · delad Rustrician-krets', url: nexusData.source },
    create: nexus,
  },
  {
    id: 'inline',
    name: 'Inline Backup',
    category: 'Reservkraft',
    difficulty: 'Grund',
    origin: 'Handboken',
    author: 'Allmän kopplingsprincip · egen diagramlayout',
    summary: 'Energikälla till batteri, därefter vidare till lasten.',
    mode: 'reference',
    notice:
      'Laddningsförluster och batteritid kan inte studeras med appens alltid laddade batterier.',
    steps: [
      'Följ laddningskabeln till batteriet.',
      'Lasten får sin matning från batteriets Power Output.',
      'Jämför med bypass-principen i Nih Core.',
    ],
    source: handbook('Inline Backup'),
    create: () => {
      const { c, node, wire } = build();
      const a = node('source', 'solar', 'Laddning', 0, 0),
        b = node('battery', 'battery-large', 'Batteri i matningsvägen', 350, 0),
        d = node('load', 'light', 'Last', 700, 0);
      wire(a, b, 'Power Out', 'Power In', 'charge');
      wire(b, d, 'Power Output', 'Power In', 'backup');
      return c;
    },
  },
  {
    id: 'priority-backup',
    name: 'Reservkraft med prioriterad last',
    category: 'Fördelning',
    difficulty: 'Avancerad',
    origin: 'ElRusty',
    author: 'ElRusty',
    summary: 'Två matningar, reserverad effektbudget och separata förbrukargrupper.',
    mode: 'model',
    notice:
      'Modelltestad omkoppling. Batteriet har ständig laddning; exemplet beräknar ingen drifttid eller laddning.',
    steps: [
      'Starta simuleringen och kontrollera de tre kritiska lasterna.',
      'Stäng av Ordinarie matning i komponentpanelen. Reservmatningen ger då 100 rW.',
      'Kritisk fördelning behåller sin reserverade budget på 40 rW.',
      'Stäng även av reservbatteriet för att undersöka strömvarningarna.',
    ],
    create: priority,
  },
  {
    id: 'latched-alarm',
    name: 'Låsande larm med manuell återställning',
    category: 'Logik',
    difficulty: 'Avancerad',
    origin: 'ElRusty',
    author: 'ElRusty',
    summary: 'En kort sensorhändelse bevaras i en Memory Cell.',
    mode: 'model',
    notice:
      'Sensorhändelsen anges manuellt. Varje ändring av inställningarna återställer körningen; använd Stega efter inställningen för att följa signalen.',
    steps: [
      'Välj Manuell testhändelse och aktivera Sensor utlöst.',
      'Stega simuleringen: larmindikeringen tänds.',
      'Memory Cell behåller sitt Set-tillstånd mellan tidssteg i samma körning.',
      'Återställ larm visar hur Reset-porten är kopplad. Inställningsändringar startar om simuleringen.',
    ],
    create: latch,
  },
  {
    id: 'timed-light',
    name: 'Tidsstyrd servicebelysning',
    category: 'Logik',
    difficulty: 'Medel',
    origin: 'ElRusty',
    author: 'ElRusty',
    summary: 'En Timer begränsar ett servicefönster till fem sekunder.',
    mode: 'model',
    notice:
      'Timern startar på en stigande Toggle On-signal. Ändrad komponentinställning återställer hela körningen.',
    steps: [
      'Aktivera Starta med en stigande signal i komponentpanelen.',
      'Starta simuleringen och följ lampan under fem sekunder.',
      'En kvarvarande hög signal startar inte om timern.',
      'Ändra Tid för att prova ett annat servicefönster.',
    ],
    create: timed,
  },
  {
    id: 'auto-smelter',
    name: 'Automatisk smältlinje',
    category: 'Industrial',
    difficulty: 'Avancerad',
    origin: 'ElRusty',
    author: 'ElRusty',
    summary: 'Separat matning till conveyors och ugn, med råvaru- och färdiglager.',
    mode: 'model',
    notice:
      'Transport sker i modellens femsekunderscykler. Ugnen har enbart Power In; ingen elektrisk seriekoppling via ugnen används.',
    steps: [
      'Startlagret innehåller 120 Metal Ore.',
      'Inmatningsconveyorn flyttar råvaran till ugnens input-platser.',
      'Följ gröna industrial-kablar till det färdiga lagret.',
      'Kontrollera den separata effektfördelningen: conveyors och ugn har egna matningar.',
    ],
    create: smelter,
  },
  {
    id: 'isolated-sectors',
    name: 'Två fristående elsektorer',
    category: 'Fördelning',
    difficulty: 'Medel',
    origin: 'ElRusty',
    author: 'ElRusty',
    summary: 'Varje sektor har eget batteri och lokal servicebrytare.',
    mode: 'model',
    notice:
      'Batterierna är alltid laddade i modellen. Testa brytare eller batterifel; släckt solpanel tömmer inte batteriet.',
    steps: [
      'Jämför de två separata matningsvägarna.',
      'Stäng av Servicebrytare i sektor 1.',
      'Sektor 2 ska behålla sin belysning.',
      'Prova batterifel i en sektor och jämför med en central matning.',
    ],
    create: sectors,
  },
];

export function openExample(id: string): Circuit {
  const example = exampleBuilds.find((e) => e.id === id);
  if (!example?.create) throw new Error('Exemplet saknar ett publicerat kopplingsschema.');
  const c = example.create();
  // Each opened instance has fresh identifiers; edits never mutate the library or an existing save.
  const ids = new Map(c.nodes.map((n) => [n.id, crypto.randomUUID()]));
  c.nodes = c.nodes.map((n) => ({ ...n, id: ids.get(n.id)! }));
  c.edges = c.edges.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    source: ids.get(e.source)!,
    target: ids.get(e.target)!,
  }));
  if (c.lesson) c.lesson = { ...c.lesson, areas: c.lesson.areas.map(a => ({ ...a, controls: a.controls.map(control => ({ ...control,nodeId:ids.get(control.nodeId)! })), focusNodeId:ids.get(a.focusNodeId)!, outputNodeId:ids.get(a.outputNodeId)! })) };
  c.id = crypto.randomUUID();
  c.name = example.name + ' · egen kopia';
  c.example = {
    id: example.id,
    name: example.name,
    mode: example.mode === 'reference' ? 'reference' : 'model',
    notice: example.notice,
    steps: [...example.steps],
    author: example.author,
    ...(example.source ? { source: { ...example.source } } : {}),
  };
  return c;
}
