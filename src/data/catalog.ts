import type { Behavior, ComponentDefinition, Port, ComponentNode } from '../model';
import { defaultSettings, blankCircuit } from '../model';
const input = (name: string, kind: 'power' | 'industrial' = 'power'): Port => ({
  id: 'in:' + name,
  name,
  kind,
  direction: 'in',
});
const output = (name: string, kind: 'power' | 'industrial' = 'power'): Port => ({
  id: 'out:' + name,
  name,
  kind,
  direction: 'out',
});
const pIn = input('Power In'),
  pOut = output('Power Out');
const raw: [
  string,
  string,
  string,
  ComponentDefinition['category'],
  Behavior,
  number,
  Port[],
  string?,
][] = [
  [
    'solar',
    'Large Solar Panel',
    'electric.solarpanel.large',
    'El',
    'source',
    20,
    [output('Power Out')],
  ],
  ['wind', 'Wind Turbine', 'generator.wind.scrap', 'El', 'source', 150, [pOut]],
  ['generator', 'Small Generator', 'electric.fuelgenerator.small', 'El', 'source', 40, [pOut]],
  [
    'battery-large',
    'Large Rechargeable Battery',
    'electric.battery.rechargable.large',
    'El',
    'battery',
    100,
    [pIn, output('Power Output'), output('Fully Charged')],
  ],
  [
    'battery-medium',
    'Medium Rechargeable Battery',
    'electric.battery.rechargable.medium',
    'El',
    'battery',
    50,
    [pIn, output('Power Output'), output('Fully Charged')],
  ],
  [
    'battery-small',
    'Small Rechargeable Battery',
    'electric.battery.rechargable.small',
    'El',
    'battery',
    15,
    [pIn, output('Power Output'), output('Fully Charged')],
  ],
  [
    'root',
    'Root Combiner',
    'electrical.combiner',
    'El',
    'combiner',
    0,
    [input('Root Power 1'), input('Root Power 2'), output('Combined Power Out')],
  ],
  [
    'branch',
    'Electrical Branch',
    'electrical.branch',
    'El',
    'branch',
    0,
    [pIn, pOut, output('Branch Out')],
  ],
  [
    'splitter',
    'Splitter',
    'electric.splitter',
    'El',
    'splitter',
    0,
    [pIn, output('Power Out 1'), output('Power Out 2'), output('Power Out 3')],
  ],
  [
    'switch',
    'Switch',
    'electric.switch',
    'El',
    'switch',
    0,
    [pIn, pOut, input('Switch On'), input('Switch Off')],
  ],
  [
    'and',
    'AND Switch',
    'electric.andswitch',
    'Logik',
    'and',
    0,
    [input('Input A'), input('Input B'), output('Power Out')],
  ],
  [
    'or',
    'OR Switch',
    'electric.orswitch',
    'Logik',
    'or',
    0,
    [input('Input A'), input('Input B'), output('Power Out')],
  ],
  [
    'xor',
    'XOR Switch',
    'electric.xorswitch',
    'Logik',
    'xor',
    0,
    [input('Input A'), input('Input B'), output('Power Out')],
  ],
  [
    'blocker',
    'Blocker',
    'electric.blocker',
    'Logik',
    'blocker',
    0,
    [pIn, input('Block Passthrough'), output('Power Out')],
  ],
  [
    'memory',
    'Memory Cell',
    'electrical.memorycell',
    'Logik',
    'memory',
    0,
    [
      pIn,
      input('Set'),
      input('Reset'),
      input('Toggle'),
      output('Output'),
      output('Inverted Output'),
    ],
  ],
  ['timer', 'Timer', 'electric.timer', 'Logik', 'timer', 0, [pIn, input('Toggle On'), pOut]],
  [
    'hbhf',
    'HBHF Sensor',
    'electric.hbhfsensor',
    'Sensorer',
    'sensor',
    1,
    [pIn, pOut],
    'Antal personer förenklas till en manuell av/på-signal.',
  ],
  [
    'laser',
    'Laser Detector',
    'electric.laserdetector',
    'Sensorer',
    'sensor',
    1,
    [pIn, pOut],
    'Detektering anges manuellt.',
  ],
  [
    'light',
    'Ceiling Light',
    'ceilinglight',
    'Förbrukare',
    'consumer',
    2,
    [pIn, output('Passthrough')],
  ],
  [
    'simple-light',
    'Simple Light',
    'electric.simplelight',
    'Förbrukare',
    'consumer',
    1,
    [pIn, output('Passthrough')],
  ],
  [
    'turret',
    'Auto Turret',
    'autoturret',
    'Förbrukare',
    'consumer',
    10,
    [
      pIn,
      input('Toggle On'),
      input('Toggle Off'),
      output('Has Target'),
      output('Low Ammo'),
      output('No Ammo'),
    ],
    'Strömförbrukning simuleras; strid och ammunition simuleras inte.',
  ],
  [
    'conveyor',
    'Industrial Conveyor',
    'industrial.conveyor',
    'Industrial',
    'conveyor',
    1,
    [
      input('Industrial Input', 'industrial'),
      pIn,
      input('Turn On'),
      input('Turn Off'),
      output('Industrial Output', 'industrial'),
      output('Passthrough'),
      output('Filter Fail'),
      output('Filter Pass'),
    ],
  ],
  [
    'industrial-splitter',
    'Industrial Splitter',
    'industrial.splitter',
    'Industrial',
    'industrialSplitter',
    0,
    [
      input('Industrial In', 'industrial'),
      output('Industrial Out 1', 'industrial'),
      output('Industrial Out 2', 'industrial'),
      output('Industrial Out 3', 'industrial'),
    ],
  ],
  [
    'industrial-combiner',
    'Industrial Combiner',
    'industrial.combiner',
    'Industrial',
    'industrialCombiner',
    0,
    [
      input('Industrial In 1', 'industrial'),
      input('Industrial In 2', 'industrial'),
      input('Industrial In 3', 'industrial'),
      output('Industrial Out', 'industrial'),
    ],
  ],
  [
    'box',
    'Large Wood Box + Adaptor',
    'box.wooden.large',
    'Förvaring',
    'storage',
    0,
    [input('Industrial In', 'industrial'), output('Industrial Out', 'industrial')],
    'Boxen inkluderar en Storage Adaptor.',
  ],
  [
    'small-box',
    'Wood Storage Box + Adaptor',
    'box.wooden',
    'Förvaring',
    'storage',
    0,
    [input('Industrial In', 'industrial'), output('Industrial Out', 'industrial')],
    'Boxen inkluderar en Storage Adaptor; 18 platser.',
  ],
  [
    'furnace',
    'Electric Furnace + Adaptor',
    'electric.furnace',
    'Industrial',
    'furnace',
    3,
    [pIn, input('Industrial In', 'industrial'), output('Industrial Out', 'industrial')],
    'Två input-platser, tre output-platser. Endast Power In; ingen elektrisk utgång.',
  ],
  [
    'crafter',
    'Industrial Crafter',
    'industrial.crafter',
    'Industrial',
    'crafter',
    1,
    [
      input('Industrial In', 'industrial'),
      pIn,
      input('Toggle'),
      input('Blueprints In', 'industrial'),
      input('Turn On'),
      input('Turn Off'),
      output('Industrial Out', 'industrial'),
      output('Blueprint Out', 'industrial'),
    ],
    'Fem input-platser, fyra output-platser och fyra blueprint-platser. Blueprint-prioritet från vänster till höger.',
  ],
];
export const catalog: ComponentDefinition[] = raw.map(
  ([id, name, shortname, category, behavior, watts, ports, note]) => ({
    id,
    name,
    shortname,
    category,
    behavior,
    watts,
    ports,
    source:
      'https://wiki.rustclash.com/item/' +
      (id === 'box'
        ? 'large-wood-box'
        : id === 'root'
          ? 'root-combiner'
          : name.replace(' + Adaptor', '').toLowerCase().replaceAll(' ', '-')),
    verification: ['timer', 'memory', 'hbhf', 'laser', 'furnace', 'crafter'].includes(id)
      ? 'modelled'
      : 'documented',
    note,
  }),
);
export const byDefinition = Object.fromEntries(catalog.map((d) => [d.id, d]));
export const NODE_WIDTH = 228;
export const portY = (port: Port, index: number, ports: Port[]) => {
  const same = ports.filter((p) => p.direction === port.direction);
  return 94 + same.findIndex((p) => p.id === port.id) * 30;
};
export const nodeHeight = (def: ComponentDefinition) =>
  Math.max(
    160,
    116 +
      Math.max(
        def.ports.filter((p) => p.direction === 'in').length,
        def.ports.filter((p) => p.direction === 'out').length,
      ) *
        30,
  );
export function newNode(definition: string, x = 0, y = 0): ComponentNode {
  const settings = defaultSettings();
  if (definition === 'small-box') settings.slots = 18;
  return {
    id: crypto.randomUUID(),
    type: 'component',
    position: { x, y },
    data: { definition, settings },
  };
}
export function starterCircuit() {
  const c = blankCircuit();
  c.name = 'Min bassortering';
  const battery = newNode('battery-large', 0, 0),
    branch = newNode('branch', 360, 0),
    conveyor = newNode('conveyor', 730, 0),
    source = newNode('box', 350, 350),
    dest = newNode('box', 1100, 350);
  source.data.settings.inventory = [
    { item: 'wood', amount: 5000 },
    { item: 'metal.fragments', amount: 1000 },
  ];
  conveyor.data.settings.filter.rules = [
    { item: null, category: 3, min: 0, max: 0, buffer: 0, blueprint: false },
  ];
  branch.data.settings.branch = 2;
  c.nodes = [battery, branch, conveyor, source, dest];
  c.edges = [
    { a: battery, b: branch, s: 'Power Output', t: 'Power In', kind: 'power' as const },
    { a: branch, b: conveyor, s: 'Branch Out', t: 'Power In', kind: 'power' as const },
    {
      a: source,
      b: conveyor,
      s: 'Industrial Out',
      t: 'Industrial Input',
      kind: 'industrial' as const,
    },
    {
      a: conveyor,
      b: dest,
      s: 'Industrial Output',
      t: 'Industrial In',
      kind: 'industrial' as const,
    },
  ].map((e, i) => ({
    id: crypto.randomUUID(),
    source: e.a.id,
    target: e.b.id,
    sourceHandle: 'out:' + e.s,
    targetHandle: 'in:' + e.t,
    type: 'wire',
    data: { color: ['#65b4ff', '#ff444f', '#77d7b0', '#77d7b0'][i], kind: e.kind, waypoints: [] },
  }));
  return c;
}
