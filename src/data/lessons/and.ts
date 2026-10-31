import { lessonBuilder, binaryRows, type LessonDefinition } from './build';
export const andLesson: LessonDefinition = {
  component: 'and',
  title: 'AND Switch',
  explanation:
    'Båda ingångarna måste ha ström. Då släpps den högsta effekten vidare; effekterna adderas inte.',
  why: 'Använd när flera villkor måste vara uppfyllda samtidigt, till exempel ett tillstånd och en sensor.',
  formula: 'A OCH B',
  source: 'https://wiki.facepunch.com/rust/item/electric.andswitch',
  rows: binaryRows([0, 0, 0, 1]),
  create: () => {
    const b = lessonBuilder('and');
    {
      const s = b.section(
        'Grund',
        'Två signaler tänder en lampa.',
        'Lär dig skillnaden mellan ett krav och två samtidiga krav.',
        'Prova alla fyra kombinationer av A och B.',
      );
      const a = s.input('A · 20 rW', 0, 0),
        c = s.input('B · 40 rW', 0, 1, false, 40),
        g = s.gate('and', 2, 0.5),
        l = s.lamp(4, 0.5);
      s.binary(a, c, g);
      s.wire(g, l);
    }
    {
      const s = b.section(
        'Mellan',
        'Tre villkor i en kedja av två AND Switch.',
        'Kräv exempelvis huvudpåslag, sensor och operatörstillstånd.',
        'A, B och C måste vara på för att lampan ska lysa.',
      );
      const a = s.input('A · Huvudpåslag', 0, 0),
        c = s.input('B · Sensor', 0, 1),
        d = s.input('C · Tillstånd', 0, 2.5),
        g = s.gate('and', 2, 0.5),
        h = s.gate('and', 4, 1),
        l = s.lamp(6, 1);
      s.binary(a, c, g);
      s.binary(g, d, h);
      s.wire(h, l);
    }
    {
      const s = b.section(
        'Avancerad',
        '(Sensor A ELLER sensor B) OCH tillstånd C.',
        'Välj mellan flera utlösare men behåll ett gemensamt säkerhetsvillkor.',
        'Prova A utan C. Slå sedan på C och växla mellan A och B.',
      );
      const a = s.input('A · Sensor vänster', 0, 0),
        c = s.input('B · Sensor höger', 0, 1),
        d = s.input('C · Gemensamt tillstånd', 0, 2.5),
        o = s.gate('or', 2, 0.5),
        g = s.gate('and', 4, 1),
        l = s.lamp(6, 1);
      s.binary(a, c, o);
      s.binary(o, d, g);
      s.wire(g, l);
    }
    return b.circuit;
  },
};
