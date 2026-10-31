import { lessonBuilder, binaryRows, type LessonDefinition } from './build';
export const blockerLesson: LessonDefinition = {
  component: 'blocker',
  title: 'Blocker',
  explanation:
    'Power In släpps igenom tills Block Passthrough får en signal. Block-signalen stoppar strömmen; den matar inte lasten.',
  why: 'Använd för servicebrytning, spärrar eller när ett system bara ska köras om ingen stoppsignal finns.',
  formula: 'POWER IN OCH INTE BLOCK',
  source: 'https://wiki.facepunch.com/rust/item/electric.blocker',
  rows: binaryRows([0, 0, 1, 0]),
  create: () => {
    const b = lessonBuilder('blocker');
    {
      const s = b.section(
        'Grund',
        'Matning A passerar bara när spärr B är av.',
        'Skilj på effektmatning och styrsignal.',
        'A är på från början. Slå på B och se hur 40 rW stoppas.',
      );
      const a = s.input('A · Power In 40 rW', 0, 0, true, 40),
        c = s.input('B · Block-signal', 0, 1),
        g = s.gate('blocker', 2, 0.5),
        l = s.lamp(4, 0.5);
      s.wire(a, g);
      s.wire(c, g, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(g, l);
    }
    {
      const s = b.section(
        'Mellan',
        'Två oberoende spärrar i serie.',
        'Både underhåll och felstatus ska kunna stoppa samma matning.',
        'Testa A och B var för sig. Bara när båda spärrarna är av lyser lampan.',
      );
      const power = s.supply(0, 0),
        a = s.input('A · Underhåll', 0, 1),
        c = s.input('B · Felstatus', 0, 2.5),
        g = s.gate('blocker', 2, 0.5),
        h = s.gate('blocker', 4, 1),
        l = s.lamp(6, 1);
      s.wire(power, g);
      s.wire(a, g, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(g, h);
      s.wire(c, h, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(h, l);
    }
    {
      const s = b.section(
        'Avancerad',
        'Tillstånd krävs och valfri stoppsignal spärrar maskinen.',
        'Kombinera ett positivt krav med flera negativa villkor.',
        'A ger tillstånd. B är nödstopp och C är felstatus. A måste vara på och B/C av.',
      );
      const power = s.supply(2, 0),
        a = s.input('A · Tillstånd', 0, 0),
        c = s.input('B · Nödstopp', 0, 1.5),
        d = s.input('C · Felstatus', 0, 3),
        permit = s.gate('and', 3, 0.5),
        stops = s.gate('or', 3, 2.5),
        g = s.gate('blocker', 5, 1.5),
        l = s.lamp(7, 1.5);
      s.binary(power, a, permit);
      s.binary(c, d, stops);
      s.wire(permit, g);
      s.wire(stops, g, 'Power Out', 'Block Passthrough', '#bd9aff');
      s.wire(g, l);
    }
    return b.circuit;
  },
};
