import { lessonBuilder, binaryRows, type LessonDefinition } from './build';
export const orLesson: LessonDefinition = {
  component: 'or',
  title: 'OR Switch',
  explanation:
    'Minst en ingång måste ha ström. Om båda har ström väljer utgången det högsta värdet, inte summan.',
  why: 'Använd för alternativa matningar eller när någon av flera händelser ska räcka.',
  formula: 'A ELLER B',
  source: 'https://wiki.facepunch.com/rust/item/electric.orswitch',
  rows: binaryRows([0, 1, 1, 1]),
  create: () => {
    const b = lessonBuilder('or');
    {
      const s = b.section(
        'Grund',
        'A eller B kan tända lampan.',
        'En enda aktiv väg räcker.',
        'Slå på A, sedan B, och jämför 20, 40 och 40 rW vid utgången.',
      );
      const a = s.input('A · 20 rW', 0, 0),
        c = s.input('B · 40 rW', 0, 1, false, 40),
        g = s.gate('or', 2, 0.5),
        l = s.lamp(4, 0.5);
      s.binary(a, c, g);
      s.wire(g, l);
    }
    {
      const s = b.section(
        'Mellan',
        'Tre möjliga utlösare med två OR Switch.',
        'Samla flera oberoende larm- eller startsignaler.',
        'Prova att bara C är på. Prova sedan A och B tillsammans.',
      );
      const a = s.input('A · Utlösare 1', 0, 0),
        c = s.input('B · Utlösare 2', 0, 1),
        d = s.input('C · Utlösare 3', 0, 2.5),
        g = s.gate('or', 2, 0.5),
        h = s.gate('or', 4, 1),
        l = s.lamp(6, 1);
      s.binary(a, c, g);
      s.binary(g, d, h);
      s.wire(h, l);
    }
    {
      const s = b.section(
        'Avancerad',
        'Alternativ matning med gemensam servicespärr.',
        'A och B erbjuder två vägar, medan C kan stoppa båda.',
        'Tänd med A eller B. Slå på servicespärr C och se att lasten stoppas.',
      );
      const a = s.input('A · Matning 20 rW', 0, 0),
        c = s.input('B · Matning 40 rW', 0, 1, false, 40),
        stop = s.input('C · Servicespärr', 0, 2.5),
        g = s.gate('or', 2, 0.5),
        h = s.gate('blocker', 4, 1),
        l = s.lamp(6, 1);
      s.binary(a, c, g);
      s.wire(g, h);
      s.wire(stop, h, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(h, l);
    }
    return b.circuit;
  },
};
