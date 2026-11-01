import { expect, it } from 'vitest';
import { TimeLearner, phasePosition } from '../server/time-learning';
import type { RustTimeInfo } from '../shared/time';
const info = (time = 6, extra: Partial<RustTimeInfo> = {}): RustTimeInfo => ({
  time,
  sunrise: 6,
  sunset: 18,
  dayLengthMinutes: 2.4,
  timeScale: 1,
  ...extra,
});
const sample = (l: TimeLearner, ms: number) => l.observe(info((6 + ms / 6000) % 24), ms);
function learned() {
  const l = new TimeLearner();
  for (let t = 0; t <= 144000; t += 1000) sample(l, t);
  return l;
}
it('beräknar verklig tid och växlar vid solgränser och midnatt', () => {
  const l = new TimeLearner();
  expect(l.estimate(info(12, { dayLengthMinutes: 60 }))).toEqual({
    milliseconds: 900000,
    learned: false,
    next: 'Natt',
  });
  expect(l.estimate(info(18, { dayLengthMinutes: 60 }))).toMatchObject({
    milliseconds: 1800000,
    next: 'Dag',
  });
  expect(l.estimate(info(24, { dayLengthMinutes: 60 }))).toMatchObject({
    milliseconds: 900000,
    next: 'Dag',
  });
  expect(l.estimate(info(6, { dayLengthMinutes: 60, timeScale: 2 }))).toMatchObject({
    milliseconds: 900000,
    next: 'Natt',
  });
  expect(phasePosition(info(23, { sunrise: 20, sunset: 4 })).phase).toBe('day');
  expect(phasePosition(info(5, { sunrise: 20, sunset: 4 })).phase).toBe('night');
});
it.each([
  { time: NaN },
  { sunset: 6 },
  { sunrise: Infinity },
  { dayLengthMinutes: 0 },
  { timeScale: -1 },
  { timeScale: 0 },
  { time: 25 },
])('avvisar ogiltig cykel %j', (extra) => {
  const l = learned();
  l.observe(info(6, extra), 145000);
  expect(l.estimate(info(6, extra))).toBeNull();
  expect(l.snapshot()).toBeUndefined();
  expect(l.takeDirty()).toBe(true);
});
it('lär kompletta dag- och nattfaser med 21 punkter och sparar bara slutförda faser', () => {
  const l = new TimeLearner();
  sample(l, 0);
  sample(l, 1000);
  expect(l.takeDirty()).toBe(false);
  for (let t = 2000; t <= 72000; t += 1000) sample(l, t);
  expect(l.snapshot()!.day[0]).toHaveLength(21);
  expect(l.snapshot()!.day[0][20]).toBeCloseTo(72000);
  expect(l.snapshot()!.night).toEqual([]);
  expect(l.takeDirty()).toBe(true);
  expect(l.takeDirty()).toBe(false);
  for (let t = 73000; t <= 144000; t += 1000) sample(l, t);
  expect(l.snapshot()!.night[0][20]).toBeCloseTo(72000);
  expect(l.estimate(info(9))!.learned).toBe(true);
});
it('första ofullständiga fasen räknas inte som inlärd', () => {
  const l = new TimeLearner();
  for (let t = 36000; t <= 108000; t += 1000) sample(l, t);
  expect(l.snapshot()!.day).toEqual([]);
  expect(l.snapshot()!.night).toHaveLength(0);
  for (let t = 109000; t <= 144000; t += 1000) sample(l, t);
  expect(l.snapshot()!.day).toEqual([]);
  expect(l.snapshot()!.night).toHaveLength(1);
});
it('interpolerar fasgränser mellan avläsningar', () => {
  const l = new TimeLearner();
  for (let t = 1000; t <= 300000; t += 5000) sample(l, t);
  expect(l.snapshot()!.day[0][20]).toBeCloseTo(72000, 4);
  expect(l.snapshot()!.night[0][20]).toBeCloseTo(72000, 4);
});
it('lär ojämnt tidsförlopp i stället för att bara använda en linjär dygnslängd', () => {
  const l = new TimeLearner();
  for (let t = 0; t <= 120000; t += 1000) l.observe(info(6 + 12 * (t / 120000) ** 2), t);
  const e = l.estimate(info(9))!;
  expect(e.learned).toBe(true);
  expect(e.milliseconds).toBeCloseTo(60000, 0);
});
it('behåller tre senaste kompletta faser och tar median per punkt', () => {
  const l = new TimeLearner();
  for (let t = 0; t <= 144000 * 5; t += 1000) sample(l, t);
  expect(l.snapshot()!.day).toHaveLength(3);
  expect(l.snapshot()!.night).toHaveLength(3);
  const saved = l.snapshot()!;
  saved.day = [1000, 3000, 2000].map((step) => Array.from({ length: 21 }, (_, i) => i * step));
  const restored = new TimeLearner(saved);
  expect(restored.estimate(info(12))).toEqual({ milliseconds: 20000, learned: true, next: 'Natt' });
});
it('avbrott och långa luckor kastar den pågående fasen men behåller färdiga kurvor', () => {
  const l = learned();
  sample(l, 149000);
  l.interrupt();
  sample(l, 154000);
  sample(l, 174001);
  expect(l.snapshot()!.day).toHaveLength(1);
  for (let t = 175001; t <= 220001; t += 1000) sample(l, t);
  expect(l.snapshot()!.day).toHaveLength(1);
});
it.each([
  { time: 5 },
  { time: 16 },
  { timeScale: 0 },
  { timeScale: 1.02 },
  { dayLengthMinutes: 2.45 },
  { sunrise: 6.051 },
  { sunset: 18.051 },
])('återställer inlärning efter klockhopp/fryst/ändrat värde %j', (extra) => {
  const l = learned();
  l.takeDirty();
  l.observe(info(6.1, extra), 145000);
  expect(l.snapshot()?.day.length || 0).toBe(0);
  expect(l.takeDirty()).toBe(true);
});
it('tolererar ändringar inom överenskomna gränser och ogiltig sparad data', () => {
  const l = learned();
  l.observe(info(6.1, { timeScale: 1.01, sunrise: 6.04, sunset: 18.04 }), 145000);
  expect(l.snapshot()!.day).toHaveLength(1);
  expect(
    new TimeLearner({ reference: info(), day: [[0, NaN]], night: [] }).snapshot(),
  ).toBeUndefined();
});
