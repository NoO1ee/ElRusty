import { lessonBuilder, type LessonDefinition } from './build';
export const memoryLesson: LessonDefinition = {
  component: 'memory',
  title: 'Memory Cell',
  explanation:
    'Minnescellen lagrar ett tillstånd. Set väljer Output och Reset väljer Inverted Output. Tillståndet finns kvar när styrsignalen släpps.',
  why: 'Använd för låsande larm eller lägen som ska finnas kvar efter en kort händelse. Power In behövs fortfarande för att mata en utgång.',
  formula: 'SET → 1 · RESET → 0 · TOGGLE VÄXLAR',
  source: 'https://wiki.facepunch.com/rust/item/electrical.memorycell',
  rows: [
    { a: 'Set', b: 'puls', out: '1' },
    { a: 'Reset', b: 'puls', out: '0' },
    { a: 'Ingen', b: 'signal', out: 'Behåll' },
    { a: 'Toggle', b: 'stigande', out: 'Växla' },
  ],
  create: () => {
    const b = lessonBuilder('memory');
    {
      const s = b.section(
        'Grund',
        'Sätt och återställ ett minne med två indikeringar.',
        'En kort signal kan lämna ett varaktigt tillstånd.',
        'Slå på Set, släpp Set, och se att Output är kvar. Prova sedan Reset separat.',
      );
      const power = s.supply(2, 0),
        set = s.input('Set · Sätt minnet', 0, 1),
        reset = s.input('Reset · Nollställ', 0, 2.5),
        g = s.gate('memory', 3, 1),
        on = s.lamp(5, 1, 'Output'),
        off = s.lamp(5, 2.5, 'Inverted Output');
      s.wire(power, g);
      s.wire(set, g, 'Power Out', 'Set', '#bd9aff');
      s.wire(reset, g, 'Power Out', 'Reset', '#efc46c');
      s.wire(g, on, 'Output');
      s.wire(g, off, 'Inverted Output');
    }
    {
      const s = b.section(
        'Mellan',
        'Växla mellan två lägen med Toggle.',
        'Samma styrpunkt kan välja på och av.',
        'Slå på Toggle och släpp den. Nästa av→på-kant växlar tillbaka. En kvarvarande signal växlar bara en gång.',
      );
      const power = s.supply(2, 0),
        toggle = s.input('Toggle · Växla läge', 0, 1),
        g = s.gate('memory', 3, 1),
        on = s.lamp(5, 1, 'Läge på'),
        off = s.lamp(5, 2.5, 'Läge av');
      s.wire(power, g);
      s.wire(toggle, g, 'Power Out', 'Toggle', '#bd9aff');
      s.wire(g, on, 'Output');
      s.wire(g, off, 'Inverted Output');
    }
    {
      const s = b.section(
        'Avancerad',
        'Två larmutlösare låser minnet, med återställning och tyst service.',
        'Tysta lampan tillfälligt utan att radera den lagrade händelsen.',
        'A eller B sätter larmminnet. Släpp dem och slå på service D: lampan slocknar men minnet behålls. C återställer minnet.',
      );
      const a = s.input('A · Sensor vänster', 0, 0),
        c = s.input('B · Sensor höger', 0, 1),
        reset = s.input('C · Återställ', 0, 2),
        mute = s.input('D · Service / tysta', 0, 3),
        power = s.supply(4, 0),
        o = s.gate('or', 2, 0.5),
        g = s.gate('memory', 4, 1.5),
        block = s.gate('blocker', 6, 1.5),
        on = s.lamp(7, 1.5, 'Larmindikering'),
        off = s.lamp(6, 3, 'Minnet återställt');
      s.binary(a, c, o);
      s.wire(power, g);
      s.wire(o, g, 'Power Out', 'Set', '#bd9aff');
      s.wire(reset, g, 'Power Out', 'Reset', '#efc46c');
      s.wire(g, block, 'Output');
      s.wire(mute, block, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(block, on);
      s.wire(g, off, 'Inverted Output');
    }
    return b.circuit;
  },
};
