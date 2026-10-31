import { lessonBuilder, binaryRows, type LessonDefinition } from './build';
export const xorLesson: LessonDefinition = {
  component: 'xor',
  title: 'XOR Switch',
  explanation: 'Exakt en ingång ska ha ström. Båda av eller båda på ger ingen utmatning.',
  why: 'Använd för att upptäcka olika tillstånd eller för tvåvägsstyrning där en ändrad signal växlar resultatet.',
  formula: 'A ELLER B, MEN INTE BÅDA',
  source: 'https://wiki.facepunch.com/rust/item/electric.xorswitch',
  rows: binaryRows([0, 1, 1, 0]),
  create: () => {
    const b = lessonBuilder('xor');
    {
      const s = b.section(
        'Grund',
        'Exakt en av A och B tänder lampan.',
        'Se skillnaden mellan OR och XOR.',
        'Tänd med A. Slå på B också och se att lampan slocknar.',
      );
      const a = s.input('A · 20 rW', 0, 0),
        c = s.input('B · 40 rW', 0, 1, false, 40),
        g = s.gate('xor', 2, 0.5),
        l = s.lamp(4, 0.5);
      s.binary(a, c, g);
      s.wire(g, l);
    }
    {
      const s = b.section(
        'Mellan',
        'Tvåvägsstyrning med separat tillstånd.',
        'Ett gemensamt tillstånd kan stänga av ett XOR-styrt system.',
        'Prova A och B var för sig. C måste samtidigt vara på.',
      );
      const a = s.input('A · Styrpunkt 1', 0, 0),
        c = s.input('B · Styrpunkt 2', 0, 1),
        permit = s.input('C · Tillstånd', 0, 2.5),
        g = s.gate('xor', 2, 0.5),
        h = s.gate('and', 4, 1),
        l = s.lamp(6, 1);
      s.binary(a, c, g);
      s.binary(g, permit, h);
      s.wire(h, l);
    }
    {
      const s = b.section(
        'Avancerad',
        'Jämför två zoner som vardera kräver två villkor.',
        'Signalera när bara en av två zoner är redo.',
        'Zon 1 kräver A och B. Zon 2 kräver C och D. Lampan slocknar när båda zonerna är redo.',
      );
      const a = s.input('A · Zon 1, villkor 1', 0, 0),
        c = s.input('B · Zon 1, villkor 2', 0, 1),
        d = s.input('C · Zon 2, villkor 1', 0, 2),
        e = s.input('D · Zon 2, villkor 2', 0, 3),
        g = s.gate('and', 2, 0.5),
        h = s.gate('and', 2, 2.5),
        x = s.gate('xor', 4, 1.5),
        l = s.lamp(6, 1.5);
      s.binary(a, c, g);
      s.binary(d, e, h);
      s.binary(g, h, x);
      s.wire(x, l);
    }
    return b.circuit;
  },
};
